import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createPiMcpConfigStore } from './src/server/services/pi-mcp';
import { createPiHostTools } from './src/server/services/pi-tools';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { RPCHandler } from '@orpc/server/fetch';
import { SignalSyncHandlerPlugin } from '@orpc/server/plugins';
import type { RouterClient } from '@orpc/server';
import { hostRouter } from './src/server/host-router';

let agentDir: string;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
beforeAll(async () => {
  agentDir = await mkdtemp('/private/tmp/opencode/pi-agent-');
  process.env.PI_CODING_AGENT_DIR = agentDir;
});
afterAll(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

test('Pi MCP config preserves entries and migrates only missing names', async () => {
  const store = createPiMcpConfigStore(() => agentDir);
  await store.mutate({ action: 'import', servers: { docs: { url: 'https://example.com/mcp', enabled: false } }, onlyMissing: false });
  await store.mutate({ action: 'import', servers: { docs: { url: 'https://wrong.example/mcp' }, local: { command: 'node', args: ['server.js'], enabled: false } }, onlyMissing: true });
  expect((await store.list()).servers.docs.url).toBe('https://example.com/mcp');
  await store.mutate({ action: 'enable', name: 'docs', enabled: true });
  expect((await store.list()).servers.docs.enabled).toBe(true);
  await store.mutate({ action: 'delete', name: 'docs' });
  expect((await store.list()).servers.docs).toBeUndefined();
  await store.mutate({ action: 'delete', name: 'local' });
});

function client() {
  const handler = new RPCHandler({ host: hostRouter }, { plugins: [new SignalSyncHandlerPlugin()] });
  return createORPCClient<RouterClient<{ host: typeof hostRouter }>>(new RPCLink({
    url: 'http://localhost/rpc',
    fetch: async (request, init) => {
      const req = new Request(request, init);
      const { response } = await handler.handle(req, { prefix: '/rpc', context: { request: req } });
      return response!;
    },
  }));
}

describe('Pi backend validation', () => {
  test('rejects unsupported endpoints through oRPC', async () => {
    await expect(client().host.ai.chat({ endpoint: 'file:///etc/passwd', model: 'test', messages: [{ role: 'user', content: 'Hello' }] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  test('requires history to end with user input', async () => {
    await expect(client().host.ai.chat({ endpoint: 'http://localhost:1234/v1', model: 'test', messages: [{ role: 'assistant', content: 'Hello' }] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('Pi execution', () => {
  test('native Pi MCP discovers and executes a server tool without a Luma transport', async () => {
    const store = createPiMcpConfigStore(() => agentDir);
    let called = false;
    const mcp = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      const message: any = await request.json();
      if (!message.id) return new Response(null, { status: 202 });
      let result: unknown = {};
      if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } };
      if (message.method === 'tools/list') result = { tools: [{ name: 'hello', description: 'Say hello', inputSchema: { type: 'object', properties: {} } }] };
      if (message.method === 'tools/call') { called = true; result = { content: [{ type: 'text', text: 'native MCP result' }] }; }
      return Response.json({ jsonrpc: '2.0', id: message.id, result });
    } });
    let calls = 0;
    const model = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
      const body: any = await request.json();
      const chunk = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
      calls++;
      if (calls === 1) {
        const tool = body.tools.find((entry: any) => entry.function.name.includes('hello'));
        if (!tool) return new Response(chunk({ role: 'assistant', content: 'MCP missing' }) + chunk({}, 'stop') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
        return new Response(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'mcp_call', type: 'function', function: { name: tool.function.name, arguments: '{}' } }] }) + chunk({}, 'tool_calls') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      }
      expect(JSON.stringify(body.messages)).toContain('native MCP result');
      return new Response(chunk({ role: 'assistant', content: 'MCP complete' }) + chunk({}, 'stop') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    try {
      await store.mutate({ action: 'import', onlyMissing: false, servers: { test: { url: `http://127.0.0.1:${mcp.port}/mcp`, exposure: 'direct' } } });
      const iterator = await client().host.ai.chat({ endpoint: `http://127.0.0.1:${model.port}/v1`, model: 'test', messages: [{ role: 'user', content: 'Call hello' }] });
      const events = [];
      for await (const event of iterator) events.push(event);
      expect(called).toBe(true);
      expect(events).toContainEqual({ type: 'complete', text: 'MCP complete' });
    } finally {
      await store.mutate({ action: 'delete', name: 'test' });
      mcp.stop(true); model.stop(true);
    }
  });
  test('Pi executes a native host call and continues with its result', async () => {
    const dir = await mkdtemp('/private/tmp/opencode/pi-loop-');
    const previousRoot = process.env.LUMA_CODE_ROOT;
    const previousEnabled = process.env.LUMA_CODE_AGENT;
    process.env.LUMA_CODE_ROOT = dir;
    process.env.LUMA_CODE_AGENT = '1';
    let calls = 0;
    let continuation: any;
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
      const body: any = await request.json();
      calls++;
      const chunk = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
      if (calls === 1) return new Response(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_read', type: 'function', function: { name: 'luma_host', arguments: JSON.stringify({ op: 'read', path: 'hello.txt' }) } }] }) + chunk({}, 'tool_calls') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      continuation = body;
      return new Response(chunk({ role: 'assistant', content: 'Read successfully' }) + chunk({}, 'stop') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    try {
      await writeFile(join(dir, 'hello.txt'), 'native result');
      const iterator = await client().host.ai.chat({ endpoint: `http://127.0.0.1:${server.port}/v1`, model: 'test', host_tools: true, messages: [{ role: 'user', content: 'Read hello.txt' }] });
      const events = [];
      for await (const event of iterator) events.push(event);
      expect(events).toContainEqual({ type: 'complete', text: 'Read successfully' });
      expect(calls).toBe(2);
      expect(JSON.stringify(continuation.messages)).toContain('native result');
      expect(events.some(event => event.type === 'pi' && event.event.type === 'tool_execution_end' && !event.event.isError)).toBe(true);
    } finally {
      server.stop(true);
      if (previousRoot === undefined) delete process.env.LUMA_CODE_ROOT; else process.env.LUMA_CODE_ROOT = previousRoot;
      if (previousEnabled === undefined) delete process.env.LUMA_CODE_AGENT; else process.env.LUMA_CODE_AGENT = previousEnabled;
      await rm(dir, { recursive: true, force: true });
    }
  });
  test('restores history and streams a real SDK response from a mock provider', async () => {
    let received: any;
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
      received = await request.json();
      const chunk = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
      return new Response(chunk({ role: 'assistant', content: 'Hello from Pi' }) + chunk({}, 'stop') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    try {
      const iterator = await client().host.ai.chat({
        endpoint: `http://127.0.0.1:${server.port}/v1`, model: 'test',
        messages: [{ role: 'system', content: 'Be helpful' }, { role: 'user', content: 'Earlier' }, { role: 'assistant', content: 'Remembered' }, { role: 'user', content: 'Hello' }],
      });
      const events = [];
      for await (const event of iterator) events.push(event);
      expect(JSON.stringify(received.messages)).toContain('Remembered');
      expect(JSON.stringify(received.messages)).toContain('Be helpful');
      expect((received.tools || []).some((tool: any) => ['read', 'bash', 'write', 'edit', 'luma_host'].includes(tool.function.name))).toBe(false);
      expect(events).toContainEqual({ type: 'text', text: 'Hello from Pi' });
      expect(events).toContainEqual({ type: 'complete', text: 'Hello from Pi' });
    } finally { server.stop(true); }
  });

  test('native host tools honor enablement and workspace confinement', async () => {
    expect(createPiHostTools(false, process.cwd())).toHaveLength(0);
    const dir = await mkdtemp('/private/tmp/opencode/pi-host-');
    try {
      await writeFile(join(dir, 'hello.txt'), 'hello');
      const tool = createPiHostTools(true, dir)[0];
      const result = await tool.execute('read', { op: 'read', path: 'hello.txt' }, undefined, undefined, {} as never);
      expect(JSON.stringify(result.content)).toContain('hello');
      await expect(tool.execute('escape', { op: 'read', path: '../outside' }, undefined, undefined, {} as never)).rejects.toThrow('outside');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
