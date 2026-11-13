// Discovery only: never executes packages, installs skills, or fetches caller-supplied URLs.
const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const REPOS = ['anthropics/skills', 'openai/skills', 'vercel-labs/agent-skills'] as const;
const TTL = 10 * 60_000;
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT = 15_000;

type ObjectValue = Record<string, unknown>;
export type MarketplaceRow = {
  id: string;
  name: string;
  description: string;
  source: string;
  url?: string;
  package?: ObjectValue;
  rawSkillUrl?: string;
  requirements?: ObjectValue;
  homepage?: string;
};
type Skill = { repo: string; path: string; branch: string };
const trees = new Map<string, { expires: number; rows: Skill[] }>();
const pendingTrees = new Map<string, Promise<Skill[]>>();
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const records = (value: unknown): ObjectValue[] => Array.isArray(value) ? value.filter(object) : [];
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store' },
});
class MarketplaceError extends Error {
  constructor(message: string, readonly status = 502, readonly retryAfter?: string) { super(message); }
}
function httpUrl(value: unknown): string | undefined {
  try {
    const url = new URL(text(value));
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Registry metadata may contain non-URLs. */ }
  return undefined;
}

async function upstreamJson(url: URL, source: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'jarvis-marketplace' },
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)]) : AbortSignal.timeout(TIMEOUT),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      const limited = response.status === 429 || (source.startsWith('GitHub') && response.status === 403);
      throw new MarketplaceError(`${source} ${limited ? 'rate limited or denied access' : 'request failed'} (HTTP ${response.status})`, limited ? 503 : 502, response.headers.get('retry-after') ?? undefined);
    }
    if (!response.body) throw new MarketplaceError(`${source} returned an empty response`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        throw new MarketplaceError(`${source} response exceeds 5 MiB`);
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new MarketplaceError(`${source} response exceeds 5 MiB`);
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof MarketplaceError) throw error;
    throw new MarketplaceError(`${source} request failed (network, redirect, invalid JSON, or ${TIMEOUT / 1000}s timeout)`);
  }
}

function normalizeServer(server: ObjectValue): MarketplaceRow | undefined {
  const name = text(server.name);
  if (!name) return undefined;
  const remotes = records(server.remotes);
  const packages = records(server.packages);
  const remote = remotes.find(remote => remote.type === 'streamable-http' && httpUrl(remote.url));
  const npm = packages.find(pkg => pkg.registryType === 'npm' && object(pkg.transport) && pkg.transport.type === 'stdio');
  const requirements: ObjectValue = {
    configReviewRequired: true,
    repository: server.repository ?? null,
    version: server.version ?? null,
    remotes,
    packages,
    note: 'Review upstream configuration and trust before importing. Discovery does not install or execute anything.',
  };
  let pkg: ObjectValue | undefined;
  if (npm) {
    const identifier = text(npm.identifier);
    // Registry arguments are descriptors, not argv. Never synthesize named or positional arguments.
    const noArguments = ['runtimeArguments', 'packageArguments'].every(key =>
      npm[key] === undefined || (Array.isArray(npm[key]) && npm[key].length === 0));
    const safeIdentifier = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(identifier);
    const supported = noArguments && safeIdentifier && (npm.runtimeHint === undefined || npm.runtimeHint === 'bunx');
    pkg = { ...npm, configReviewRequired: true };
    // Do not accept executable fields supplied outside the registry package schema.
    delete pkg.command;
    delete pkg.args;
    if (supported) {
      // Use only the literal npm identifier; version/argument interpretation is left to manual review.
      pkg.command = 'bunx';
      pkg.args = [identifier];
    }
    pkg.launchSupported = supported;
    if (!supported) pkg.reviewReason = 'Runtime/package arguments, runtime hint, or package identifier require manual configuration; no launch command generated.';
  }
  requirements.supportedTransport = remote ? 'streamable-http' : pkg?.launchSupported ? 'npm-stdio' : null;
  return {
    id: name,
    name,
    description: text(server.description),
    source: `${REGISTRY}/${encodeURIComponent(name)}/versions/${encodeURIComponent(text(server.version) || 'latest')}`,
    ...(remote ? { url: httpUrl(remote.url) } : {}),
    ...(pkg ? { package: pkg } : {}),
    requirements,
    homepage: httpUrl(server.websiteUrl) ?? (object(server.repository) ? httpUrl(server.repository.url) : undefined),
  };
}

async function mcp(q: string, cursor: string, signal: AbortSignal) {
  const url = new URL(REGISTRY);
  url.searchParams.set('search', q);
  url.searchParams.set('limit', '20');
  if (cursor) url.searchParams.set('cursor', cursor);
  const data = await upstreamJson(url, 'Official MCP registry', signal);
  if (!object(data) || !Array.isArray(data.servers)
      || data.servers.some(entry => !object(entry) || !object(entry.server))) {
    throw new MarketplaceError('Official MCP registry returned an invalid servers response');
  }
  const rows = data.servers.map(entry => normalizeServer(entry.server)).filter((row): row is MarketplaceRow => !!row);
  const nextCursor = object(data.metadata) ? data.metadata.nextCursor : undefined;
  if (nextCursor !== undefined && nextCursor !== null && typeof nextCursor !== 'string') {
    throw new MarketplaceError('Official MCP registry returned an invalid cursor');
  }
  return { rows, nextCursor: nextCursor || null, sources: [{ name: 'Official MCP registry', url: REGISTRY }] };
}

async function tree(repo: string): Promise<Skill[]> {
  const cached = trees.get(repo);
  if (cached && cached.expires > Date.now()) return cached.rows;
  const pending = pendingTrees.get(repo);
  if (pending) return pending;
  const load = (async () => {
    const branch = 'main';
    const data = await upstreamJson(new URL(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`), `GitHub ${repo}`);
    if (!object(data) || !Array.isArray(data.tree) || typeof data.truncated !== 'boolean') {
      throw new MarketplaceError(`GitHub ${repo} returned an invalid tree`);
    }
    if (data.truncated) throw new MarketplaceError(`GitHub ${repo} returned a truncated tree; incomplete results are not served`);
    const rows = records(data.tree)
      .filter(entry => entry.type === 'blob' && /(^|\/)SKILL\.md$/.test(text(entry.path)))
      .map(entry => ({ repo, branch, path: text(entry.path) }));
    trees.set(repo, { rows, expires: Date.now() + TTL });
    return rows;
  })();
  pendingTrees.set(repo, load);
  try { return await load; } finally { pendingTrees.delete(repo); }
}

async function skills(q: string, cursor: string) {
  if (cursor && !/^(0|[1-9]\d{0,8})$/.test(cursor)) throw new MarketplaceError('Invalid skills cursor: expected a nonnegative offset', 400);
  const offset = cursor ? Number(cursor) : 0;
  const all = (await Promise.all(REPOS.map(repo => tree(repo)))).flat()
    .sort((a, b) => a.repo.localeCompare(b.repo) || a.path.localeCompare(b.path));
  const query = q.toLowerCase();
  const matches = all.filter(skill => `${skill.repo}/${skill.path}`.toLowerCase().includes(query));
  const rows: MarketplaceRow[] = matches.slice(offset, offset + 30).map(skill => {
    const directory = skill.path.split('/').slice(0, -1).join('/');
    const name = directory.split('/').pop() || skill.repo.split('/')[1]!;
    const path = skill.path.split('/').map(encodeURIComponent).join('/');
    const source = `https://github.com/${skill.repo}/blob/${skill.branch}/${path}`;
    return {
      id: `${skill.repo}:${skill.path}`, name,
      description: `${skill.repo} — ${skill.path}`,
      source,
      rawSkillUrl: `https://raw.githubusercontent.com/${skill.repo}/${skill.branch}/${path}`,
      homepage: `https://github.com/${skill.repo}`,
      requirements: {
        repo: skill.repo, branch: skill.branch, path: skill.path,
        configReviewRequired: true,
        note: 'Only the file path was indexed. Review SKILL.md and companion files for dependencies, permissions, and manual import instructions.',
      },
    };
  });
  return {
    rows, nextCursor: offset + 30 < matches.length ? String(offset + 30) : null,
    sources: REPOS.map(repo => ({ name: repo, url: `https://github.com/${repo}`, branch: 'main' })),
  };
}

export async function marketplaceHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Use GET' }), {
    status: 405, headers: { Allow: 'GET', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const q = (url.searchParams.get('q') ?? '').trim();
  const cursor = url.searchParams.get('cursor') ?? '';
  if (kind !== 'mcp' && kind !== 'skills') return json({ error: 'Expected kind=mcp or kind=skills' }, 400);
  if (q.length > 512 || cursor.length > 4096) return json({ error: 'Search or cursor is too long' }, 400);
  try {
    return json(await (kind === 'mcp' ? mcp(q, cursor, req.signal) : skills(q, cursor)));
  } catch (error) {
    const failure = error instanceof MarketplaceError ? error : new MarketplaceError('Marketplace discovery failed');
    const response = json({ error: failure.message }, failure.status);
    if (failure.retryAfter) response.headers.set('Retry-After', failure.retryAfter);
    return response;
  }
}
