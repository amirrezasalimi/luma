import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createCodeAgentService } from './code-agent';
import { codeAgentEnabled } from './code-settings';

/** Reuse Jarvis's confined, bounded host operations; never expose Pi's unrestricted defaults. */
export function createPiHostTools(enabled: boolean, workspace: string): ToolDefinition[] {
  if (!enabled) return [];
  const execute = createCodeAgentService({ enabled, workspace });
  return [{
    name: 'jarvis_host', label: 'Jarvis host',
    description: 'Work with files in the Jarvis workspace or run a trusted shell command. Shell access is not an OS sandbox. Prefer these native operations over generating browser JavaScript for host work.',
    parameters: Type.Object({
      op: Type.Union(['list', 'read', 'write', 'edit', 'delete', 'bash'].map(value => Type.Literal(value))),
      path: Type.Optional(Type.String()), content: Type.Optional(Type.String()),
      oldText: Type.Optional(Type.String()), newText: Type.Optional(Type.String()),
      recursive: Type.Optional(Type.Boolean()), command: Type.Optional(Type.String()),
      cwd: Type.Optional(Type.String()), timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 120000 })),
    }),
    async execute(_id, params, signal) {
      if (!codeAgentEnabled()) throw new Error('Code Agent is disabled in Settings');
      const response = await execute(params as Record<string, unknown>, signal || new AbortController().signal);
      if (response.status >= 400) throw new Error('error' in response.data ? response.data.error?.message : 'Host operation failed');
      return { content: [{ type: 'text', text: JSON.stringify(response.data) }], details: response.data };
    },
  }];
}
