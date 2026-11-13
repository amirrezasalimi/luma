import { resolve, extname, sep } from 'node:path';
import { createCodeAgentHandler } from './code-agent';
import { createLocalMcpHandler, shutdownLocalMcpSessions } from './local-mcp';
import { marketplaceHandler } from './marketplace';

const root = import.meta.dir;
const port = Number(Bun.env.PORT || 3000);
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm',
};
const error = (message: string, status: number) => Response.json({ error: message }, { status });

export function createServerHandler(options: { port?: number; codeEnabled?: boolean; codeRoot?: string } = {}) {
  const configuredPort = options.port ?? port;
  const localMcpHandler = createLocalMcpHandler();
  const codeHandler = createCodeAgentHandler({
    enabled: options.codeEnabled ?? Bun.env.JARVIS_CODE_AGENT === '1',
    workspace: options.codeRoot ?? Bun.env.JARVIS_CODE_ROOT ?? root,
  });
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // Validate both authority sources before any proxy, subprocess, coding, or asset access.
    const allowedHosts = new Set(['localhost', '127.0.0.1'].map(host =>
      configuredPort === 80 ? host : `${host}:${configuredPort}`));
    if (!allowedHosts.has(req.headers.get('host') || '') || !allowedHosts.has(url.host)
        || url.protocol !== 'http:') {
      return Response.json({ error: { code: 'INVALID_HOST', message: 'Expected a loopback Host with the configured port' } }, { status: 403 });
    }
    // This local proxy can reach private MCP servers; do not expose it publicly.
    if ((req.headers.get('origin') && req.headers.get('origin') !== url.origin)
        || req.headers.get('sec-fetch-site') === 'cross-site') {
      return Response.json({ error: { code: 'CROSS_ORIGIN', message: 'Cross-origin requests are not allowed' } }, { status: 403 });
    }
    if (url.pathname === '/api/marketplace') return marketplaceHandler(req);
    if (url.pathname === '/api/code') return codeHandler(req);
    if (url.pathname === '/api/mcp/local') return localMcpHandler(req);
    if (url.pathname === '/api/mcp') {
      if (req.method !== 'POST') return error('Use POST', 405);
      if (!req.headers.get('content-type')?.includes('application/json')) return error('Expected JSON', 415);
      let input: { url: string; headers: Record<string, string>; body: unknown };
      let target: URL;
      let headers: Headers;
      try {
        input = await req.json();
        target = new URL(input.url);
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error();
        headers = new Headers(input.headers);
        // Let fetch manage transport headers, never accept browser-supplied ones.
        for (const name of ['host', 'connection', 'content-length', 'transfer-encoding', 'cookie', 'origin', 'referer']) headers.delete(name);
        headers.set('Content-Type', 'application/json');
        headers.set('Accept', 'application/json, text/event-stream');
        if (!input.body || typeof input.body !== 'object') throw new Error();
      } catch {
        return error('Expected { url: HTTP(S) URL, headers: object, body: JSON-RPC object }', 400);
      }
      try {
        const upstream = await fetch(target, {
          method: 'POST', headers, body: JSON.stringify(input.body), redirect: 'error',
          signal: AbortSignal.any([req.signal, AbortSignal.timeout(120_000)]),
        });
        const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
        for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version', 'retry-after', 'www-authenticate']) {
          const value = upstream.headers.get(name);
          if (value !== null) responseHeaders.set(name, value);
        }
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
      } catch (e) {
        console.error('MCP upstream request failed:', e instanceof Error ? e.message : e);
        return error('MCP upstream request failed (connection, redirect, or 120s timeout). Check the Bun terminal.', 502);
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return error('Method not allowed', 405);
    let path: string;
    try {
      path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    } catch {
      return error('Invalid path', 400);
    }
    // Serve app assets without exposing source, dotfiles, or arbitrary project files.
    const relative = path.slice(root.length + 1);
    if (!path.startsWith(root + sep) || relative.split(sep).some(p => p.startsWith('.'))
        || !(['index.html'].includes(relative) || ['vendor/', 'whistle/', 'models/'].some(p => relative.startsWith(p)))) {
      return error('Not found', 404);
    }
    const file = Bun.file(path);
    if (!(await file.exists())) return error('Not found', 404);
    return new Response(req.method === 'HEAD' ? null : file, {
      headers: { 'Content-Type': mime[extname(path)] || file.type || 'application/octet-stream' },
    });
  };
}

if (import.meta.main) {
  Bun.serve({ hostname: '127.0.0.1', port, fetch: createServerHandler() });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      shutdownLocalMcpSessions();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
  console.log(`JARVIS: http://localhost:${port}`);
}
