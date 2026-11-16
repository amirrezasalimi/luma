import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { VOICE_RESPONSE_PROMPT } from '../../shared/prompts/voice';
import { createPiSoulTool, readSoul } from './pi-soul';
import { graphMemoryTool, GRAPH_MEMORY_GUIDANCE } from './graph-memory';
import { codeAgentEnabled } from './code-settings';
import { sessionHistoryTool } from './session-history';
import { sceneApiTool, sceneStatusTool, sceneTool } from './scene-commands';
import { managementTool, workspaceOperation, type WorkspaceOperation } from './workspace-operations';
import { finishToolRecord, startToolRecord, toolHistoryTool } from './tool-history';

export const chatRequest = z.object({
  endpoint: z.url().refine(url => ['http:', 'https:'].includes(new URL(url).protocol)),
  model: z.string().min(1).max(300),
  reasoning_effort: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  purpose: z.enum(['conversation', 'summary']).default('conversation'),
  host_tools: z.boolean().default(false),
  profile: z.string().min(1).max(200).optional(),
  session_id: z.string().min(1).max(200).optional(),
  context_window: z.number().int().min(1024).max(10000000).default(128000),
  max_tokens: z.number().int().min(1).max(1000000).default(16384),
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() })).min(1).max(10000),
}).refine(input => input.messages.at(-1)?.role === 'user', { message: 'AI history must end with a user message' });

export type PiEvent = { type: 'tool_execution_start' | 'tool_execution_end'; toolCallId: string; toolName: string; isError?: boolean; recordId?: string }
  | { type: 'extension_error'; message: string }
  | { type: 'soul_updated'; text: string };
export type AIEvent = { type: 'text'; text: string } | { type: 'pi'; event: PiEvent } | { type: 'complete'; text: string } | WorkspaceOperation;
export const aiEvent = z.discriminatedUnion('type', [
  workspaceOperation,
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('complete'), text: z.string() }),
  z.object({ type: z.literal('pi'), event: z.discriminatedUnion('type', [
    z.object({ type: z.literal('tool_execution_start'), toolCallId: z.string(), toolName: z.string(), recordId: z.string().optional() }),
    z.object({ type: z.literal('tool_execution_end'), toolCallId: z.string(), toolName: z.string(), isError: z.boolean().optional(), recordId: z.string().optional() }),
    z.object({ type: z.literal('extension_error'), message: z.string() }),
    z.object({ type: z.literal('soul_updated'), text: z.string() }),
  ]) }),
]);

/** Pi owns the native tool loop; Jarvis owns conversation snapshots and scene execution. */
export async function runAI(input: z.output<typeof chatRequest>, apiKey: string, signal: AbortSignal,
  onText: (text: string) => void, onEvent: (event: PiEvent) => void = () => {}, onOperation: (event: WorkspaceOperation) => void = () => {}) {
  const { createAgentSession, createCodemodeExtension, createMcpExtension, createToolSearchExtension, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, SettingsManager } = await import('@earendil-works/pi-coding-agent');
  const history = input.messages.filter(message => message.role !== 'system');
  const last = history.at(-1);
  if (!last || last.role !== 'user') throw new Error('AI history must end with a user message');
    signal.throwIfAborted();
    // Credentials are always request-scoped, even when trusted resources are enabled.
    const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false,
      credentials: { read: async () => undefined, list: async () => [], modify: async (_provider, fn) => fn(undefined), delete: async () => {} } });
    runtime.registerProvider('jarvis', {
      baseUrl: input.endpoint.replace(/\/$/, ''), api: 'openai-completions',
      authHeader: true,
      models: [{ id: input.model, name: input.model, reasoning: !!input.reasoning_effort && input.reasoning_effort !== 'off',
        compat: { supportsDeveloperRole: false },
        input: ['text'], contextWindow: input.context_window, maxTokens: Math.min(input.max_tokens, input.context_window),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    });
    // Runtime keys are literal values (not Pi configuration expressions).
    await runtime.setRuntimeApiKey('jarvis', apiKey || 'local-no-key');
    const model = runtime.getModel('jarvis', input.model);
    if (!model) throw new Error('Pi could not configure the selected model');
    const manager = SessionManager.inMemory();
    for (const message of history.slice(0, -1)) {
      if (message.role === 'user') manager.appendMessage({ role: 'user', content: message.content, timestamp: Date.now() });
      else manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: message.content }],
        api: model.api, provider: model.provider, model: model.id, stopReason: 'stop', timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    }
    // Conversations use the same enabled user resources and MCP configuration as Pi.
    const resources = input.purpose !== 'summary';
    const cwd = process.env.JARVIS_CODE_ROOT || process.cwd();
    const globalSettings = resources ? SettingsManager.create(cwd, getAgentDir()).getGlobalSettings() : {};
    const settingsManager = SettingsManager.inMemory({ ...globalSettings, compaction: { enabled: false }, retry: { enabled: false } });
    const storedSoul = resources ? readSoul(input.profile) : '';
    const appSystemPrompt = input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n').trim()
       + (resources ? '\n\nUse soul_memory for identity and personal preferences; use graph_memory for sourced factual relationships when available. Do not use scene code or host files to save your soul.\nCURRENT SAVED SOUL.md (authoritative personal identity):\n' + (storedSoul || '(No soul saved yet.)') : '')
       + (resources ? '\n\nBACKEND EXECUTION AUTHORITY: Jobs and agents run on the server independently of clients. Browser LIVE STATE agent lists may be stale legacy views. Use manage_agents list/inspect for authoritative agent status. Never use reply [[agent/tell/resume/stop/kill]] directives to manage backend agents. Native Pi tools execute host work now, not after a browser reply. Scene-only operations require a graphical client; do not claim they ran when no graphical client acknowledged them.' : '');
    if (!appSystemPrompt) throw new Error('Missing application system prompt');
    // Pi normally adds incremental system-section patches after restored history.
    // Its supported full-prompt override projects instructions into a leading
    // provider system message, retaining Pi's current MCP/skill prompt sections.
    const appPromptExtension: ExtensionFactory = pi => {
      pi.on('before_agent_start', event => ({
        systemPrompt: event.systemPrompt + (event.systemPrompt.includes(appSystemPrompt) ? '' : '\n\nAPPLICATION INSTRUCTIONS (including saved soul):\n' + appSystemPrompt)
          + (resources ? '\n\n' + VOICE_RESPONSE_PROMPT : '')
          + (resources && input.session_id ? '\n\n' + GRAPH_MEMORY_GUIDANCE : ''),
      }));
    };
    const loader = new DefaultResourceLoader({ cwd, agentDir: resources ? getAgentDir() : cwd, settingsManager, noExtensions: !resources, noSkills: !resources,
      extensionFactories: [...(resources ? [createCodemodeExtension(), createToolSearchExtension(), createMcpExtension()] : []), appPromptExtension],
      noPromptTemplates: true, noContextFiles: true, noThemes: true,
      systemPrompt: appSystemPrompt });
     await loader.reload();
     const hostEnabled = resources && input.host_tools && codeAgentEnabled();
     const { session } = await createAgentSession({ cwd, modelRuntime: runtime, model, settingsManager,
       sessionManager: manager, resourceLoader: loader,
       ...(hostEnabled ? { tools: ['+read', '+write', '+edit', '+bash', '+grep', '+find', '+ls'] } : { noTools: 'builtin' as const }),
        customTools: [
          ...(resources && input.session_id ? [graphMemoryTool(input.session_id, input.profile)] : []),
         ...(resources && input.session_id ? [sceneTool(input.session_id, input.profile || 'jarvis'), sceneStatusTool(input.session_id), sceneApiTool()] : []),
         ...(resources ? [sessionHistoryTool(input.session_id)] : []),
         ...(resources && input.session_id && !input.profile ? [managementTool(input.session_id, onOperation, async operation => {
           const { manageBackendAgents } = await import('./ai-runs');
           return manageBackendAgents(input.session_id!, operation, input, apiKey);
         })] : []),
         ...(resources ? [createPiSoulTool(input.profile, text => onEvent({ type: 'soul_updated', text })), ...(input.session_id ? [toolHistoryTool(input.session_id)] : [])] : [])],
      thinkingLevel: input.reasoning_effort || 'off' });
    const abort = () => { void session.abort(); };
    const records = new Map<string, string>();
    const unsubscribe = session.subscribe(event => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') onText(event.assistantMessageEvent.delta);
      if (event.type === 'tool_execution_start') {
        const recordId = input.session_id && event.toolName !== 'tool_history' ? startToolRecord(input.session_id, input.profile || 'main', event.toolName, event.args) : undefined;
        if (recordId) records.set(event.toolCallId, recordId);
        onEvent({ type: event.type, toolCallId: event.toolCallId, toolName: event.toolName, recordId });
      }
      if (event.type === 'tool_execution_end') {
        const recordId = records.get(event.toolCallId);
        if (recordId) { finishToolRecord(recordId, event.result, event.isError); records.delete(event.toolCallId); }
        onEvent({ type: event.type, toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError, recordId });
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      await session.bindExtensions({ onError: error => { onEvent({ type: 'extension_error', message: error.error }); } });
      signal.throwIfAborted();
      await session.prompt(last.content, { expandPromptTemplates: false });
      signal.throwIfAborted();
      const final = session.messages.at(-1);
      if (final?.role === 'assistant' && (final.stopReason === 'error' || final.stopReason === 'aborted')) throw new Error(final.errorMessage || 'Pi request failed');
      return session.getLastAssistantText() || '';
    } finally {
      for (const recordId of records.values()) finishToolRecord(recordId, { error: 'Request ended before tool completion was observed', aborted: signal.aborted }, true);
      signal.removeEventListener('abort', abort);
      unsubscribe();
      session.dispose();
    }
}

/** Typed oRPC stream. Cancellation of the consumer aborts the active Pi session. */
export async function* streamAI(input: z.output<typeof chatRequest>, apiKey: string, requestSignal?: AbortSignal): AsyncGenerator<AIEvent> {
  const cancelled = new AbortController();
  const signal = requestSignal ? AbortSignal.any([requestSignal, cancelled.signal]) : cancelled.signal;
  const queue: AIEvent[] = [];
  let wake: (() => void) | undefined;
  let done = false;
  let failure: unknown;
  const push = (event: AIEvent) => { queue.push(event); wake?.(); };
   const execution = runAI(input, apiKey, signal, text => push({ type: 'text', text }), event => push({ type: 'pi', event }), push)
    .then(text => push({ type: 'complete', text }))
    .catch(error => { failure = error; })
    .finally(() => { done = true; wake?.(); });
  const abort = () => wake?.();
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (!done || queue.length) {
      signal.throwIfAborted();
      if (queue.length) yield queue.shift()!;
      else await new Promise<void>(resolve => { wake = resolve; });
    }
    if (failure) throw failure;
  } finally {
    cancelled.abort();
    signal.removeEventListener('abort', abort);
    await execution;
  }
}
