import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createCodeAgentService } from './code-agent';
import { codeAgentEnabled } from './code-settings';

/** Host access uses the saved Code Agent switch and the host user's OS permissions. */
export function createPiHostTools(enabled: boolean, workspace: string): ToolDefinition[] {
  if (!enabled) return [];
  const execute = createCodeAgentService({ enabled, workspace, fullAccess: true });
  return [{
    name: 'jarvis_host', label: 'Jarvis host',
    description: 'Full host file list/read/write/edit/delete and Bash execution, subject to OS user permissions. Absolute paths may address files outside the workspace; relative paths and default command cwd use the workspace. Not sandboxed. Preserve unrelated work and obtain user approval for destructive actions. Prefer these native operations over browser JavaScript for host work.',
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
