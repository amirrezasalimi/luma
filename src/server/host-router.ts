import { asyncIteratorObject, os } from '@orpc/server';
import { z } from 'zod';
import { createCodeAgentService } from './services/code-agent';
import { codeAgentEnabled } from './services/code-settings';
import { piMcpConfig, piMcpMutation } from './services/pi-mcp';
import { searchMarketplace } from './services/marketplace';
import { aiEvent, chatRequest, streamAI } from './services/ai';

const procedure = os.$context<{ request: Request }>();
const object = z.record(z.string(), z.unknown());
function code() {
  return createCodeAgentService({ enabled: codeAgentEnabled(), workspace: process.env.JARVIS_CODE_ROOT || process.cwd(), fullAccess: true });
}


export const hostRouter = {
  ai: {
    chat: procedure.input(chatRequest.safeExtend({ apiKey: z.string().max(10000).default('') }))
      .output(asyncIteratorObject(aiEvent))
      .handler(({ input, signal }) => streamAI(input, input.apiKey, signal)),
  },
  piExtensions: {
    browse: procedure.input(z.object({
      q: z.string().max(512).default(''),
      page: z.number().int().min(1).max(100000).default(1),
      installedOnly: z.boolean().default(false),
      type: z.enum(['all', 'npm', 'github', 'manual']).default('all'),
      category: z.enum(['all', 'mcp', 'agents', 'providers', 'tools', 'memory', 'web', 'ui']).default('all'),
      sort: z.enum(['popularity', 'updated', 'name']).default('popularity'),
    }))
      .handler(async ({ input }) => (await import('./services/pi-extensions')).browsePiExtensions(input)),
    manage: procedure.input(z.object({ source: z.string().min(1).max(1000), action: z.enum(['install', 'uninstall', 'enable', 'disable']), trusted: z.boolean().default(false) }))
      .handler(async ({ input }) => (await import('./services/pi-extensions')).managePiExtension(input)),
  },
  code: {
    status: procedure.handler(() => ({ enabled: codeAgentEnabled(), workspace: process.env.JARVIS_CODE_ROOT || process.cwd(), shellAvailable: true })),
    execute: procedure.input(object).handler(({ context, input }) => code()(input, context.request.signal)),
  },
  marketplace: procedure.input(z.object({ kind: z.enum(['mcp', 'skills']), q: z.string().max(512), cursor: z.string().max(4096).optional() }))
    .handler(({ context, input }) => {
      return searchMarketplace(input, context.request.signal);
    }),
  mcp: {
    list: procedure.handler(() => piMcpConfig.list()),
    manage: procedure.input(piMcpMutation).handler(({ input }) => piMcpConfig.mutate(input)),
  },
};
