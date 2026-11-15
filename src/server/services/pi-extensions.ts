import { DefaultPackageManager, getAgentDir, SettingsManager, type PackageSource } from '@earendil-works/pi-coding-agent';
import { access, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const CATALOG = 'https://raw.githubusercontent.com/shaftoe/awesome-pi-coding-agent/main/README.md';
const TTL = 60 * 60_000;
export type PiCatalogRow = { id: string; name: string; description: string; url: string; source: string | null; popularity: string; updated: string; tags: string[] };
const npmName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export const CATEGORY_MAP = {
  mcp: { label: 'MCP', pattern: /\b(mcp|modelcontextprotocol|model-context-protocol)\b/i },
  agents: { label: 'Agents & Workflows', pattern: /\b(subagents?|multi-agent|workflow\w*|orchestrat\w*|agent\w*|plan\w*|todo|delegat\w*|autonomous)\b/i },
  providers: { label: 'Providers & Models', pattern: /\b(provider\w*|claude|openai|gemini|deepseek|grok|ollama|openrouter|anthropic|bedrock|mistral|inference)\b/i },
  tools: { label: 'Developer Tools', pattern: /\b(lsp|lint\w*|format\w*|test\w*|sandbox|deltabox|git\w*|diff|execut\w*|compiler|debug\w*|terminal|cli|bash|tool\w*)\b/i },
  memory: { label: 'Memory & Context', pattern: /\b(memory|context|compress\w*|token\w*|vector|history|scratchpad|qmd|embedding\w*|cache)\b/i },
  web: { label: 'Web & Search', pattern: /\b(search\w*|web\w*|browse\w*|fetch\w*|crawl\w*|scrape\w*|http|url)\b/i },
  ui: { label: 'UI & Themes', pattern: /\b(ui|tui|theme\w*|colorscheme|footer|powerline|status\s*bar|pretty|color\w*|highlight\w*|view|overlay)\b/i },
} as const;

export type PiExtensionCategory = 'all' | keyof typeof CATEGORY_MAP;

export function detectCategories(name: string, description: string): string[] {
  const text = `${name} ${description}`;
  const tags: string[] = [];
  for (const [key, { pattern }] of Object.entries(CATEGORY_MAP)) {
    if (pattern.test(text)) tags.push(key);
  }
  return tags;
}

export function parseRelativeUpdatedAge(updated: string): number {
  const s = updated.trim().toLowerCase();
  if (s === 'today') return 0;
  if (s === 'yesterday') return 1;
  const hMatch = /^(\d+)h\s*ago/.exec(s);
  if (hMatch) return Number(hMatch[1]) / 24;
  const dMatch = /^(\d+)d\s*ago/.exec(s);
  if (dMatch) return Number(dMatch[1]);
  const moMatch = /^~?(\d+)mo\s*ago/.exec(s);
  if (moMatch) return Number(moMatch[1]) * 30;
  const yMatch = /^~?(\d+)y\s*ago/.exec(s);
  if (yMatch) return Number(yMatch[1]) * 365;
  return 999999;
}

export function parseQueryPatterns(q: string) {
  let text = q;
  let category: string | undefined;
  let source: string | undefined;
  let installedOnly: boolean | undefined;

  text = text.replace(/\b(?:category|tag|type):([a-z-]+)\b/gi, (_, val) => {
    category = val.toLowerCase();
    return '';
  });
  text = text.replace(/\bsource:([a-z]+)\b/gi, (_, val) => {
    source = val.toLowerCase();
    return '';
  });
  text = text.replace(/\bis:(installed|enabled)\b/gi, () => {
    installedOnly = true;
    return '';
  });

  return { text: text.trim().toLowerCase(), category, source, installedOnly };
}

export function installSource(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (url.hostname === 'www.npmjs.com' || url.hostname === 'npmjs.com') {
      const name = decodeURIComponent(url.pathname.replace(/^\/package\//, '').replace(/\/$/, ''));
      return url.pathname.startsWith('/package/') && npmName.test(name) ? `npm:${name}` : null;
    }
    if (url.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)) return `git:github.com${url.pathname.replace(/\/$/, '')}`;
  } catch { /* Unsupported catalog links remain browsable, never executable. */ }
  return null;
}

export function parsePiCatalog(markdown: string): PiCatalogRow[] {
  const rows: PiCatalogRow[] = [], seen = new Set<string>();
  let section = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) { section = line.trim() === '## Extensions'; continue; }
    if (!section) continue;
    const match = /^\| \[([^\]]+)\]\((https:\/\/[^\s)]+)\) \| (.*?) \| (.*?) \| (.*?) \|\s*$/.exec(line);
    if (!match) continue;
    const [, name, url, description, popularity, updated] = match;
    if (seen.has(url)) continue;
    seen.add(url);
    rows.push({ id: url, name, url, description: description.replace(/\\\|/g, '|'), source: installSource(url), popularity, updated, tags: detectCategories(name, description) });
  }
  return rows;
}

export function createPiCatalogCache(load: () => Promise<string>, now = Date.now) {
  let cache: { expires: number; rows: PiCatalogRow[] } | undefined;
  let pending: Promise<PiCatalogRow[]> | undefined;
  return async () => {
    if (cache && cache.expires > now()) return cache.rows;
    if (pending) return pending;
    pending = (async () => {
      const rows = parsePiCatalog(await load());
      if (!rows.length) throw new Error('Pi catalog format changed or returned no extensions');
      cache = { rows, expires: now() + TTL };
      return rows;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

const catalog = createPiCatalogCache(async () => {
  const response = await fetch(CATALOG, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`Pi catalog unavailable (HTTP ${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024 * 1024) throw new Error('Pi catalog exceeds 16 MiB');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
});

type Disabled = Record<string, PackageSource>;
const sourceOf = (pkg: PackageSource) => typeof pkg === 'string' ? pkg : pkg.source;
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = queue.then(action);
  queue = next.catch(() => {});
  return next;
}
async function configuration() {
  const agentDir = getAgentDir();
  // Pi's package manager inherits the server environment for npm subprocesses.
  // Use a dedicated cache by default, never repair ~/.npm or invoke sudo.
  const cache = process.env.JARVIS_PI_NPM_CACHE || process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE || join(agentDir, 'jarvis-npm-cache');
  try {
    await mkdir(cache, { recursive: true, mode: 0o700 });
    await access(cache, constants.W_OK | constants.X_OK);
  } catch {
    throw new Error(`Pi npm cache is not writable: ${cache}. Set JARVIS_PI_NPM_CACHE to a writable directory and restart Jarvis.`);
  }
  process.env.npm_config_cache = cache;
  const settings = SettingsManager.create(process.cwd(), agentDir);
  const manager = new DefaultPackageManager({ cwd: process.cwd(), agentDir, settingsManager: settings });
  const file = join(agentDir, 'jarvis-disabled-packages.json');
  let disabled: Disabled = {};
  try { disabled = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const save = async () => {
    await writeFile(`${file}.tmp`, JSON.stringify(disabled, null, 2), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  };
  return { settings, manager, disabled, save, agentDir };
}

export async function browsePiExtensions(input: { q: string; page: number; installedOnly: boolean; type: 'all' | 'npm' | 'github' | 'manual'; category?: string; sort?: 'popularity' | 'updated' | 'name' }) {
  const rows = await catalog();
  return serialized(async () => {
    const { settings, disabled, agentDir } = await configuration();
    const packages = settings.getGlobalSettings().packages || [];
    const installed = packages.map(pkg => ({ source: sourceOf(pkg), enabled: !(sourceOf(pkg) in disabled) && !(typeof pkg === 'object' && pkg.autoload === false) }));
    const known = new Set(rows.map(row => row.source));
    const extra: PiCatalogRow[] = installed.filter(pkg => !known.has(pkg.source)).map(pkg => ({ id: pkg.source, source: pkg.source, name: pkg.source, description: 'Installed in your user Pi configuration', url: '', popularity: '', updated: '', tags: detectCategories(pkg.source, '') }));
    const parsed = parseQueryPatterns(input.q);
    const queryText = parsed.text;
    const targetCategory = (input.category && input.category !== 'all' ? input.category : parsed.category) || 'all';
    const targetSource = (input.type && input.type !== 'all' ? input.type : parsed.source) || 'all';
    const targetInstalledOnly = input.installedOnly || parsed.installedOnly || false;
    const targetSort = input.sort || 'popularity';

    const matches = [...extra, ...rows].filter(row => {
      if (queryText && !`${row.name} ${row.description}`.toLowerCase().includes(queryText)) return false;
      if (targetInstalledOnly && !installed.some(pkg => pkg.source === row.source)) return false;
      if (targetSource !== 'all') {
        if (targetSource === 'manual' && row.source) return false;
        if (targetSource === 'npm' && !row.source?.startsWith('npm:')) return false;
        if (targetSource === 'github' && !row.source?.startsWith('git:github.com/')) return false;
      }
      if (targetCategory !== 'all') {
        const tags = row.tags || detectCategories(row.name, row.description);
        if (!tags.includes(targetCategory)) return false;
      }
      return true;
    });

    if (targetSort === 'name') {
      matches.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    } else if (targetSort === 'updated') {
      matches.sort((a, b) => parseRelativeUpdatedAge(a.updated) - parseRelativeUpdatedAge(b.updated));
    }

    const start = (input.page - 1) * 24;
    return { rows: matches.slice(start, start + 24).map(row => ({ ...row, installed: installed.find(pkg => pkg.source === row.source) || null })),
      total: matches.length, page: input.page, hasMore: start + 24 < matches.length, agentDir };
  });
}

export async function managePiExtension(input: { source: string; action: 'install' | 'uninstall' | 'enable' | 'disable'; trusted: boolean }) {
  return serialized(async () => {
    const { settings, manager, disabled, save } = await configuration();
    const packages = settings.getGlobalSettings().packages || [];
    const existing = packages.find(pkg => sourceOf(pkg) === input.source);
    if (input.action === 'install') {
      if (!input.trusted) throw new Error('Confirm trust before installing third-party code');
      if (existing) throw new Error('Package is already configured');
      if (!(await catalog()).some(row => row.source === input.source)) throw new Error('Package is not in the Pi catalog');
      // Pi owns source resolution and package persistence; no shell command interpolation.
      await manager.installAndPersist(input.source);
      await settings.flush();
    } else {
      if (!existing) throw new Error('Package is not configured in user Pi settings');
      if (input.action === 'uninstall') {
        await manager.removeAndPersist(input.source);
        await settings.flush();
        delete disabled[input.source];
        await save();
      } else if (input.action === 'disable') {
        if (input.source in disabled) return { ok: true, installed: { source: input.source, enabled: false } };
        disabled[input.source] = existing;
        // Save recovery data before editing Pi settings; preserve all prior resource filters.
        await save();
        settings.setPackages(packages.map(pkg => sourceOf(pkg) === input.source ? { source: input.source, autoload: false, extensions: [], skills: [], prompts: [], themes: [] } : pkg));
        await settings.flush();
      } else {
        if (!input.trusted) throw new Error('Confirm trust before enabling third-party code');
        settings.setPackages(packages.map(pkg => sourceOf(pkg) === input.source ? disabled[input.source] || (typeof pkg === 'string' ? pkg : { ...pkg, autoload: true }) : pkg));
        await settings.flush();
        delete disabled[input.source];
        await save();
      }
    }
    const configured = (settings.getGlobalSettings().packages || []).find(pkg => sourceOf(pkg) === input.source);
    return { ok: true, installed: configured ? { source: input.source, enabled: !(input.source in disabled) && !(typeof configured === 'object' && configured.autoload === false) } : null };
  });
}
