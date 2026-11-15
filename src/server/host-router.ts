import { os } from '@orpc/server';
import { z } from 'zod';
import { createCodeAgentService } from './services/code-agent';
import { createLocalMcpService, shutdownLocalMcpSessions } from './services/local-mcp';
import { searchMarketplace } from './services/marketplace';

const procedure = os.$context<{ request: Request }>();
const object = z.record(z.string(), z.unknown());
const localMcp = createLocalMcpService();
let codeHandler: ReturnType<typeof createCodeAgentService> | undefined;
function code() {
  return codeHandler ??= createCodeAgentService({ enabled: process.env.JARVIS_CODE_AGENT === '1', workspace: process.env.JARVIS_CODE_ROOT || process.cwd() });
}

// Preserve HTTP status and MCP session/protocol headers across the RPC boundary.
async function envelope(response: Response) {
  return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}

export const hostRouter = {
  code: {
    status: procedure.handler(() => ({ enabled: process.env.JARVIS_CODE_AGENT === '1', workspace: process.env.JARVIS_CODE_ROOT || process.cwd(), shellAvailable: true })),
    execute: procedure.input(object).handler(({ context, input }) => code()(input, context.request.signal)),
  },
  marketplace: procedure.input(z.object({ kind: z.enum(['mcp', 'skills']), q: z.string().max(512), cursor: z.string().max(4096).optional() }))
    .handler(({ context, input }) => {
      return searchMarketplace(input, context.request.signal);
    }),
  mcp: {
    local: procedure.input(object).handler(({ context, input }) => localMcp(input, context.request.signal)),
    remote: procedure.input(z.object({ url: z.url(), headers: z.record(z.string(), z.string()), body: object }))
      .handler(async ({ context, input }) => {
        const target = new URL(input.url);
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Expected HTTP(S) MCP URL without credentials');
        const headers = new Headers(input.headers);
        for (const name of ['host', 'connection', 'content-length', 'transfer-encoding', 'cookie', 'origin', 'referer']) headers.delete(name);
        headers.set('Content-Type', 'application/json'); headers.set('Accept', 'application/json, text/event-stream');
        const response = await fetch(target, { method: 'POST', headers, body: JSON.stringify(input.body), redirect: 'error', signal: AbortSignal.any([context.request.signal, AbortSignal.timeout(120000)]) });
        return envelope(response);
      }),
  },
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdownLocalMcpSessions);
