import { rpc } from './rpc';

export const host = {
  piExtensions: rpc.host.piExtensions,
  codeStatus: () => rpc.host.code.status(),
  codeExecute: (input: Record<string, unknown>, signal?: AbortSignal) => rpc.host.code.execute(input, { signal }),
  marketplace: (input: { kind: 'mcp' | 'skills'; q: string; cursor?: string }) => rpc.host.marketplace(input),
  mcp: rpc.host.mcp,
};
