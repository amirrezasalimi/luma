import { asyncIteratorObject, os } from '@orpc/server';
import { z } from 'zod';
import { createCodeAgentService } from './services/code-agent';
import { codeAgentEnabled } from './services/code-settings';
import { piMcpConfig, piMcpMutation } from './services/pi-mcp';
import { searchMarketplace } from './services/marketplace';
import { aiEvent, chatRequest, streamAI } from './services/ai';
import { completeWorkspaceOperation } from './services/workspace-operations';
import { readToolHistory } from './services/tool-history';
import { cancelRun, controlBackendAgents, listAgentOutcomes, listBackendAgents, listRuns, startRun, watchRun } from './services/ai-runs';
import { managementInput } from './services/workspace-operations';
import { exploreHistory, historyInput } from './services/session-history';
import { backgroundInput, changeBackground, readBackground } from './services/session-background';
import { claimSceneCommand, finishSceneCommand } from './services/scene-commands';

const procedure = os.$context<{ request: Request }>();
const object = z.record(z.string(), z.unknown());
function code() {
  return createCodeAgentService({ enabled: codeAgentEnabled(), workspace: process.env.LUMA_CODE_ROOT || process.cwd(), fullAccess: true });
}


export const hostRouter = {
  ai: {
    claimScene: procedure.input(z.object({ session: z.string().min(1) })).handler(({ input }) => claimSceneCommand(input.session)),
    finishScene: procedure.input(z.object({ session: z.string().min(1), id: z.string().uuid(), token: z.string().uuid(), result: z.unknown(), failed: z.boolean() })).handler(({ input }) => finishSceneCommand(input)),
    background: procedure.input(z.object({ session: z.string().min(1) })).handler(({ input }) => readBackground(input.session)),
    setBackground: procedure.input(z.object({ session: z.string().min(1), input: backgroundInput })).handler(({ input }) => changeBackground(input.session, input.input)),
    sessionHistory: procedure.input(historyInput).handler(({ input }) => exploreHistory(input)),
    outcomes: procedure.input(z.object({ session: z.string().min(1), after: z.number().int().min(0).default(0) })).handler(({ input }) => listAgentOutcomes(input.session, input.after)),
    start: procedure.input(chatRequest.safeExtend({ apiKey: z.string().max(10000).default('') }))
      .handler(({ input }) => startRun(input, input.apiKey)),
    runs: procedure.input(z.object({ session: z.string().min(1) })).handler(({ input }) => listRuns(input.session)),
    agents: procedure.input(z.object({ session: z.string().min(1) })).handler(({ input }) => listBackendAgents(input.session)),
    manageAgents: procedure.input(z.object({ session: z.string().min(1), input: managementInput })).handler(({ input }) => controlBackendAgents(input.session, input.input)),
    cancel: procedure.input(z.object({ id: z.string().uuid() })).handler(({ input }) => cancelRun(input.id)),
    watch: procedure.input(z.object({ id: z.string().uuid(), after: z.number().int().min(0).default(0) }))
      .output(asyncIteratorObject(z.object({ sequence: z.number(), event: aiEvent })))
      .handler(({ input, signal }) => watchRun(input.id, input.after, signal)),
    completeOperation: procedure.input(z.object({ id: z.string().uuid(), token: z.string().uuid(), session: z.string().min(1).max(200), result: z.unknown().optional(), error: z.string().max(4000).optional() }))
      .handler(({ input }) => completeWorkspaceOperation(input)),
    toolHistory: procedure.input(z.object({ session: z.string().min(1).max(200), id: z.string().optional(), agent: z.string().optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional() }))
      .handler(({ input }) => readToolHistory(input.session, input)),
    chat: procedure.input(chatRequest.safeExtend({ apiKey: z.string().max(10000).default('') }))
      .output(asyncIteratorObject(aiEvent))
      .handler(async function* ({ input, signal }) {
        if (!input.session_id || input.purpose === 'summary') {
          yield* streamAI(input, input.apiKey, signal);
          return;
        }
        const run = startRun(input, input.apiKey);
        for await (const item of watchRun(run.id, 0, signal)) yield item.event;
      }),
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
    status: procedure.handler(() => ({ enabled: codeAgentEnabled(), workspace: process.env.LUMA_CODE_ROOT || process.cwd(), shellAvailable: true })),
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
