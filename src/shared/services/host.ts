import { rpc } from './rpc';

type Envelope = { status: number; headers: Record<string, string>; body: string };
export function hostResponse(value: Envelope): Response {
  return new Response([204, 205, 304].includes(value.status) ? null : value.body, { status: value.status, headers: value.headers });
}

export const host = {
  codeStatus: () => rpc.host.code.status(),
  codeExecute: (input: Record<string, unknown>, signal?: AbortSignal) => rpc.host.code.execute(input, { signal }),
  marketplace: (input: { kind: 'mcp' | 'skills'; q: string; cursor?: string }) => rpc.host.marketplace(input),
  localMcp: (input: Record<string, unknown>) => rpc.host.mcp.local(input),
  remoteMcp: async (input: { url: string; headers: Record<string, string>; body: Record<string, unknown> }) => hostResponse(await rpc.host.mcp.remote(input)),
};
