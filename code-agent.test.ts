import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CODE_LIMITS, createCodeAgentHandler } from './code-agent';
import { createServerHandler } from './server';

let base: string, workspace: string;
let handler: ReturnType<typeof createCodeAgentHandler>;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'jarvis-code-'));
  workspace = join(base, 'workspace');
  await mkdir(workspace);
  handler = createCodeAgentHandler({ enabled: true, workspace });
});
afterEach(async () => { await rm(base, { recursive: true, force: true }); });
const request = (body: unknown, signal?: AbortSignal) => new Request('http://localhost:3000/api/code', {
  method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3000' }, body: JSON.stringify(body), signal,
});
const call = (body: unknown) => handler(request(body));

describe('file operations', () => {
  test('write, read, list, exact edit and delete', async () => {
    expect((await call({ op: 'write', path: 'hello.txt', content: 'hello world' })).status).toBe(200);
    expect(await (await call({ op: 'read', path: 'hello.txt' })).json()).toEqual({ path: 'hello.txt', content: 'hello world' });
    expect((await (await call({ op: 'list' })).json()).entries).toEqual([{ name: 'hello.txt', type: 'file' }]);
    expect((await call({ op: 'edit', path: 'hello.txt', oldText: 'world', newText: 'Bun' })).status).toBe(200);
    expect(await readFile(join(workspace, 'hello.txt'), 'utf8')).toBe('hello Bun');
    expect((await call({ op: 'delete', path: 'hello.txt' })).status).toBe(200);
    expect((await call({ op: 'read', path: 'hello.txt' })).status).toBe(404);
  });
  test('rejects missing, empty, repeated and overlapping edit matches', async () => {
    await writeFile(join(workspace, 'file'), 'aaa');
    for (const oldText of ['', 'missing', 'a', 'aa']) {
      expect((await call({ op: 'edit', path: 'file', oldText, newText: 'x' })).status).toBe(oldText ? 409 : 400);
    }
    expect(await readFile(join(workspace, 'file'), 'utf8')).toBe('aaa');
  });
  test('root deletion prohibited and directory deletion explicitly recursive', async () => {
    await mkdir(join(workspace, 'dir'));
    await writeFile(join(workspace, 'dir/file'), 'test');
    expect((await call({ op: 'delete', path: '.', recursive: true })).status).toBe(403);
    expect((await call({ op: 'delete', path: 'dir' })).status).toBe(400);
    expect((await call({ op: 'delete', path: 'dir', recursive: 'true' })).status).toBe(400);
    expect((await call({ op: 'delete', path: 'dir', recursive: true })).status).toBe(200);
  });
  test('rejects absolute, sibling-prefix and traversal escapes', async () => {
    for (const path of ['../outside', base, workspace + '-other/file']) {
      for (const op of ['read', 'write', 'delete', 'list']) {
        expect((await call({ op, path, content: 'bad' })).status).toBe(403);
      }
    }
    expect((await call({ op: 'bash', command: 'pwd', cwd: '..' })).status).toBe(403);
  });
  test('rejects escaping symlinks, write parents, dangling links and transient traversal', async () => {
    await writeFile(join(base, 'secret'), 'secret');
    await symlink(base, join(workspace, 'outside'));
    await symlink(join(base, 'secret'), join(workspace, 'link'));
    await symlink(join(base, 'missing'), join(workspace, 'dangling'));
    for (const path of ['link', 'outside/secret', 'outside/workspace/anything', 'outside/new']) {
      expect((await call({ op: 'write', path, content: 'bad' })).status).toBe(403);
    }
    expect((await call({ op: 'read', path: 'link' })).status).toBe(403);
    expect((await call({ op: 'delete', path: 'outside', recursive: true })).status).toBe(403);
    expect((await call({ op: 'write', path: 'dangling', content: 'bad' })).status).toBe(404);
    expect((await call({ op: 'bash', command: 'pwd', cwd: 'outside' })).status).toBe(403);
    expect(await readFile(join(base, 'secret'), 'utf8')).toBe('secret');
    await symlink(workspace, join(workspace, 'root-link'));
    expect((await call({ op: 'delete', path: 'root-link', recursive: true })).status).toBe(403);
  });
  test('allows internal symlinks and rejects missing write parents', async () => {
    await mkdir(join(workspace, 'dir'));
    await symlink(join(workspace, 'dir'), join(workspace, 'alias'));
    expect((await call({ op: 'write', path: 'alias/file', content: 'ok' })).status).toBe(200);
    expect(await readFile(join(workspace, 'dir/file'), 'utf8')).toBe('ok');
    expect((await call({ op: 'write', path: 'missing/file', content: 'no' })).status).toBe(404);
  });
  test('directory listings are capped', async () => {
    await Promise.all(Array.from({ length: CODE_LIMITS.listEntries + 1 }, (_, i) =>
      writeFile(join(workspace, `entry-${i}`), '')));
    const result = await (await call({ op: 'list' })).json();
    expect(result.entries).toHaveLength(CODE_LIMITS.listEntries);
    expect(result.truncated).toBe(true);
  });
  test('bounds file sizes for reads, writes and edits', async () => {
    await writeFile(join(workspace, 'large'), 'a'.repeat(CODE_LIMITS.fileBytes + 1));
    expect((await call({ op: 'read', path: 'large' })).status).toBe(413);
    expect((await call({ op: 'write', path: 'new', content: 'a'.repeat(CODE_LIMITS.fileBytes + 1) })).status).toBe(413);
    await writeFile(join(workspace, 'small'), 'ab');
    expect((await call({ op: 'edit', path: 'small', oldText: 'a', newText: 'x'.repeat(CODE_LIMITS.fileBytes) })).status).toBe(413);
  });
});

describe('protocol and shell', () => {
  test('JSON validation and actual streaming request size limit', async () => {
    expect((await handler(new Request('http://localhost/api/code', { method: 'POST', body: '{}' }))).status).toBe(415);
    expect((await handler(new Request('http://localhost/api/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).status).toBe(400);
    expect((await call([])).status).toBe(400);
    expect((await call({ op: 'unknown' })).status).toBe(400);
    expect((await call({ op: 'read', path: 3 })).status).toBe(400);
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(CODE_LIMITS.requestBytes + 1)); controller.close();
    } });
    expect((await handler(new Request('http://localhost/api/code', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: stream,
    }))).status).toBe(413);
  });
  test('shell output, exit status, cwd and output cap', async () => {
    const result = await (await call({ op: 'bash', command: 'printf hello; printf error >&2; exit 7' })).json();
    expect(result).toMatchObject({ stdout: 'hello', stderr: 'error', exitCode: 7, timedOut: false, truncated: false });
    await mkdir(join(workspace, 'sub'));
    const cwdResult = await (await call({ op: 'bash', command: 'pwd', cwd: 'sub' })).json();
    expect(cwdResult.stdout.trim()).toBe(await import('node:fs/promises').then(fs => fs.realpath(join(workspace, 'sub'))));
    const large = await (await call({ op: 'bash', command: 'yes x | /usr/bin/head -c 400000' })).json();
    expect(Buffer.byteLength(large.stdout) + Buffer.byteLength(large.stderr)).toBeLessThanOrEqual(CODE_LIMITS.outputBytes);
    expect(large.truncated).toBe(true);
  });
  test('abort kills descendants, including after the parent shell exits', async () => {
    for (const ending of ['wait', 'exit 0']) {
      const controller = new AbortController();
      const ready = ending === 'wait' ? 'ready-wait' : 'ready-exit';
      const marker = `${ready}-escaped`;
      const pending = handler(request({
        op: 'bash',
        command: `(printf ready > ${ready}; sleep 0.5; printf escaped > ${marker}) & ${ending}`,
        timeoutMs: 5000,
      }, controller.signal));
      try {
        const deadline = Date.now() + 2000;
        while (!await Bun.file(join(workspace, ready)).exists() && Date.now() < deadline) await Bun.sleep(10);
        expect(await Bun.file(join(workspace, ready)).exists()).toBe(true);
        controller.abort();
        const response = await pending;
        expect(response.status).toBe(499);
        expect(await response.json()).toMatchObject({
          exitCode: null, signal: 'SIGKILL', timedOut: false, aborted: true,
          error: { code: 'SHELL_ABORTED', message: 'Shell request was aborted' },
        });
        await Bun.sleep(650);
        expect(await Bun.file(join(workspace, marker)).exists()).toBe(false);
      } finally {
        controller.abort();
        await pending;
      }
    }
  });
  test('pre-aborted shell requests do not run commands', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await handler(request({ op: 'bash', command: 'printf escaped > marker' }, controller.signal));
    expect(response.status).toBe(499);
    expect(await response.json()).toMatchObject({ aborted: true, timedOut: false, signal: null, error: { code: 'SHELL_ABORTED' } });
    expect(await Bun.file(join(workspace, 'marker')).exists()).toBe(false);
  });
  test('normal completion removes the abort listener and clears the timer', async () => {
    const controller = new AbortController();
    const req = request({ op: 'bash', command: 'printf done', timeoutMs: 100 }, controller.signal);
    const { spyOn } = await import('bun:test');
    const removed = spyOn(req.signal, 'removeEventListener');
    try {
      const response = await handler(req);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ stdout: 'done', timedOut: false, aborted: false });
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
      controller.abort();
      await Bun.sleep(150);
    } finally { removed.mockRestore(); }
  });
  test('Bun default server body limit permits the full 2 MiB application limit', async () => {
    // Match server.ts: no maxRequestBodySize override. Always stop this test server.
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler });
    try {
      const prefix = '{"op":"list","padding":"';
      const body = prefix + 'x'.repeat(CODE_LIMITS.requestBytes - Buffer.byteLength(prefix) - 2) + '"}';
      expect(Buffer.byteLength(body)).toBe(CODE_LIMITS.requestBytes);
      const response = await fetch(`http://127.0.0.1:${server.port}/api/code`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
      });
      expect(response.status).toBe(200);
      await response.json();
      const oversized = await fetch(`http://127.0.0.1:${server.port}/api/code`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: body + ' ',
      });
      expect(oversized.status).toBe(413);
      expect(await oversized.json()).toMatchObject({ error: { code: 'REQUEST_TOO_LARGE' } });
    } finally { await server.stop(true); }
  });
  test('timeout kills the shell process group including descendants', async () => {
    const response = await call({ op: 'bash', command: '(sleep 0.5; printf escaped > marker) & wait', timeoutMs: 100 });
    expect(response.status).toBe(408);
    expect(await response.json()).toMatchObject({ timedOut: true, error: { code: 'SHELL_TIMEOUT' } });
    await Bun.sleep(650);
    expect(await Bun.file(join(workspace, 'marker')).exists()).toBe(false);
    for (const timeoutMs of [0, -1, 120001, 1.5, '100']) {
      expect((await call({ op: 'bash', command: 'true', timeoutMs })).status).toBe(400);
    }
  });
});

describe('server security and disabled status', () => {
  test('disabled GET works, disabled POST is forbidden', async () => {
    const server = createServerHandler({ port: 3000, codeEnabled: false, codeRoot: workspace });
    const response = await server(new Request('http://localhost:3000/api/code', { headers: { host: 'localhost:3000' } }));
    expect(await response.json()).toEqual({ enabled: false, workspace, shellAvailable: true });
    const disabled = await server(request({ op: 'bash', command: 'true' }));
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: 'DISABLED' } });
  });
  test('environment gate requires exactly 1 and uses the configured workspace', async () => {
    const previousEnabled = Bun.env.JARVIS_CODE_AGENT, previousRoot = Bun.env.JARVIS_CODE_ROOT;
    try {
      Bun.env.JARVIS_CODE_ROOT = workspace;
      for (const value of ['0', 'true', '1']) {
        Bun.env.JARVIS_CODE_AGENT = value;
        const server = createServerHandler({ port: 3000 });
        const response = await server(new Request('http://localhost:3000/api/code', { headers: { host: 'localhost:3000' } }));
        expect(await response.json()).toEqual({ enabled: value === '1', workspace, shellAvailable: true });
        expect((await server(request({ op: 'write', path: 'env-test', content: 'ok' }))).status).toBe(value === '1' ? 200 : 403);
      }
    } finally {
      if (previousEnabled === undefined) delete Bun.env.JARVIS_CODE_AGENT;
      else Bun.env.JARVIS_CODE_AGENT = previousEnabled;
      if (previousRoot === undefined) delete Bun.env.JARVIS_CODE_ROOT;
      else Bun.env.JARVIS_CODE_ROOT = previousRoot;
    }
  });
  test('only exact loopback hosts and configured ports, with same-origin checks', async () => {
    const server = createServerHandler({ port: 3000, codeEnabled: true, codeRoot: workspace });
    for (const host of ['evil.example:3000', 'localhost', 'localhost:3001', '127.0.0.1.evil:3000', '[::1]:3000']) {
      expect((await server(new Request('http://localhost:3000/api/code', { headers: { host } }))).status).toBe(403);
    }
    expect((await server(new Request('http://evil.example:3000/api/code', { headers: { host: 'localhost:3000' } }))).status).toBe(403);
    for (const extra of [{ origin: 'http://evil.example' }, { 'sec-fetch-site': 'cross-site' }]) {
      expect((await server(new Request('http://localhost:3000/api/code', { headers: { host: 'localhost:3000', ...extra } }))).status).toBe(403);
    }
    for (const host of ['localhost:3000', '127.0.0.1:3000']) {
      expect((await server(new Request(`http://${host}/api/code`, { headers: { host, origin: `http://${host}` } }))).status).toBe(200);
    }
    expect((await server(new Request('http://localhost:3000/api/code', { method: 'PUT', headers: { host: 'localhost:3000' } }))).status).toBe(405);
  });
});
