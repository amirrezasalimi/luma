import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalMcpHandler } from './src/server/services/local-mcp';

let base: string;
let oldEnabled: string | undefined;
let handler: ReturnType<typeof createLocalMcpHandler>;
let config: { name: string; command: string; args: string[] };
const call = (body: unknown) => handler(new Request('http://localhost:3000/api/mcp/local', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
beforeEach(async () => {
  oldEnabled = process.env.LUMA_LOCAL_MCP;
  delete process.env.LUMA_LOCAL_MCP;
  base = await mkdtemp(join(tmpdir(), 'luma-mcp-'));
  const executable = join(base, 'Native MCP with spaces');
  await symlink(process.execPath, executable);
  config = { name: 'native', command: executable, args: ['-e', `
    import { createInterface } from 'node:readline';
    createInterface({ input: process.stdin }).on('line', line => {
      const message = JSON.parse(line);
      if (message.id !== undefined) console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { method: message.method, args: process.argv.slice(1) } }));
    });
  `, 'literal; no shell', 'argument with spaces'] };
  handler = createLocalMcpHandler();
});
afterEach(async () => {
  await call({ action: 'stop', config });
  if (oldEnabled === undefined) delete process.env.LUMA_LOCAL_MCP;
  else process.env.LUMA_LOCAL_MCP = oldEnabled;
  await rm(base, { recursive: true, force: true });
});

test('absolute executable paths support spaces, literal arguments and JSON-RPC ids', async () => {
  const response = await call({ action: 'request', config, body: { jsonrpc: '2.0', id: 42, method: 'initialize' } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 42, result: {
    method: 'initialize', args: ['literal; no shell', 'argument with spaces'],
  } });
  const status = await (await call({ action: 'status', config })).json();
  expect(status.session.state).toBe('running');
  expect((await call({ action: 'stop', config })).status).toBe(200);
  expect((await (await call({ action: 'status', config })).json()).session).toBeNull();
});

test('local execution defaults to enabled and supports explicit opt-out', async () => {
  expect(await (await call({ action: 'status' })).json()).toEqual({ enabled: true, supported: true });
  process.env.LUMA_LOCAL_MCP = '0';
  expect(await (await call({ action: 'status' })).json()).toEqual({ enabled: false, supported: true });
  expect((await call({ action: 'request', config, body: { jsonrpc: '2.0', id: 1, method: 'initialize' } })).status).toBe(403);
  delete process.env.LUMA_LOCAL_MCP;
});

test('rejects relative paths, other bare commands, NULs and invalid arguments', async () => {
  for (const command of ['node', './server', '../server', '', '/bin/echo\0bad']) {
    expect((await call({ action: 'status', config: { ...config, command } })).status).toBe(400);
  }
  expect((await call({ action: 'status', config: { ...config, args: [123] } })).status).toBe(400);
  for (const command of ['bun', 'bunx']) {
    expect((await call({ action: 'status', config: { ...config, command } })).status).toBe(200);
  }
});

test('missing absolute executable reports a launch error', async () => {
  const response = await call({ action: 'request', config: { ...config, command: join(base, 'missing') }, body: { jsonrpc: '2.0', id: 1, method: 'initialize' } });
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('Executable not found or not executable');
});

test('JSON importer accepts MixMusic config and preserves exportable stdio settings', async () => {
  const { addMcps } = await import('./src/shared/services/runtime/integrations');
  const { validLocalMcpCommand } = await import('./src/shared/utils/mcp');
  const connected: unknown[] = [];
  const add = new Function('validLocalMcpCommand', 'mcpConnect', `
    const integrationsState = { MC: [], MS: new Map(), validLocalMcpCommand, saveMC() {} };
    const renderMcp = () => {}, stopLocalMcp = () => {};
    const addMcps = ${addMcps.toString()};
    return input => ({ count: addMcps(input), configs: integrationsState.MC });
  `)(validLocalMcpCommand, (entry: unknown) => connected.push(entry));
  const mixmusic = { command: '/Applications/MixMusic.app/Contents/MacOS/MixMusic', args: ['--mcp'] };
  const result = add({ mcpServers: { mixmusic } });
  expect(result.count).toBe(1);
  expect(result.configs[0]).toMatchObject({ name: 'mixmusic', ...mixmusic, env: {}, on: true });
  expect(connected).toHaveLength(1);
  expect(() => add({ mcpServers: { invalid: { command: './app', args: [] } } })).toThrow('absolute executable path');
  expect(add([{ name: 'disabled', ...mixmusic, on: false }]).count).toBe(1);
  expect(connected).toHaveLength(1);
});
