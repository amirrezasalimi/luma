import { lstat, realpath, open, opendir, writeFile, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

export const CODE_LIMITS = {
  requestBytes: 2 * 1024 * 1024,
  fileBytes: 1024 * 1024,
  outputBytes: 256 * 1024,
  listEntries: 1000,
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 120_000,
} as const;

type Options = { enabled: boolean; workspace: string };
class CodeError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new CodeError(status, code, message); };
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

async function inputJSON(req: Request): Promise<Record<string, unknown>> {
  const length = req.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > CODE_LIMITS.requestBytes)) {
    fail(413, 'REQUEST_TOO_LARGE', 'JSON request exceeds 2 MiB');
  }
  if (!req.body) fail(400, 'INVALID_JSON', 'Expected a JSON object');
  const reader = req.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CODE_LIMITS.requestBytes) {
        void reader.cancel().catch(() => {});
        fail(413, 'REQUEST_TOO_LARGE', 'JSON request exceeds 2 MiB');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { return fail(400, 'INVALID_JSON', 'Expected a JSON object'); }
}

function text(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string') return fail(400, 'INVALID_INPUT', `${key} must be a string`);
  return value;
}
function within(root: string, path: string) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}

// Check every existing ancestor, including symlinks and the parent of a new file.
// This is path confinement, not an OS sandbox; concurrent host filesystem changes
// and shell commands must still be trusted.
async function confined(root: string, value: unknown, allowMissing = false): Promise<string> {
  if (typeof value !== 'string' || value.includes('\0')) {
    return fail(400, 'INVALID_PATH', 'path/cwd must be a string without NUL bytes');
  }
  const path = resolve(root, value);
  if (!within(root, path)) return fail(403, 'PATH_ESCAPE', 'Path is outside the workspace');
  let current = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try { await lstat(current); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && allowMissing) return path;
      throw e;
    }
    const canonical = await realpath(current);
    if (!within(root, canonical)) return fail(403, 'PATH_ESCAPE', 'Symlink resolves outside the workspace');
  }
  return path;
}

async function readLimited(path: string): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) return fail(400, 'NOT_FILE', 'Expected a regular file');
  if (info.size > CODE_LIMITS.fileBytes) return fail(413, 'FILE_TOO_LARGE', 'File exceeds 1 MiB');
  // Read at most the limit plus one byte even if the file grows after stat.

  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(CODE_LIMITS.fileBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > CODE_LIMITS.fileBytes) return fail(413, 'FILE_TOO_LARGE', 'File exceeds 1 MiB');
    return buffer.subarray(0, size).toString('utf8');
  } finally { await file.close(); }
}
function checkContent(content: string) {
  if (Buffer.byteLength(content) > CODE_LIMITS.fileBytes) fail(413, 'FILE_TOO_LARGE', 'Content exceeds 1 MiB');
}

function bash(command: string, cwd: string, timeoutMs: number, abortSignal: AbortSignal): Promise<Response> {
  if (abortSignal.aborted) return Promise.resolve(json({
    stdout: '', stderr: '', exitCode: null, signal: null, timedOut: false, aborted: true, truncated: false,
    error: { code: 'SHELL_ABORTED', message: 'Shell request was aborted' },
  }, 499));
  return new Promise((resolveResponse, reject) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let bytes = 0, truncated = false, settled = false;
    const capture = (chunks: Buffer[], data: Buffer) => {
      const remaining = CODE_LIMITS.outputBytes - bytes;
      if (data.length > remaining) truncated = true;
      if (remaining > 0) {
        const kept = data.subarray(0, remaining);
        chunks.push(Buffer.from(kept));
        bytes += kept.length;
      }
    };
    child.stdout.on('data', data => capture(stdout, data));
    child.stderr.on('data', data => capture(stderr, data));
    const cleanup = () => {
      clearTimeout(timer);
      abortSignal.removeEventListener('abort', onAbort);
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const finish = (exitCode: number | null, signal: string | null, timedOut: boolean, aborted = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveResponse(json({
        stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode, signal, timedOut, aborted, truncated,
        ...(aborted ? { error: { code: 'SHELL_ABORTED', message: 'Shell request was aborted' } }
          : timedOut ? { error: { code: 'SHELL_TIMEOUT', message: `Shell exceeded ${timeoutMs} ms` } } : {}),
      }, aborted ? 499 : timedOut ? 408 : 200));
    };
    const terminate = (aborted: boolean) => {
      if (settled) return;
      // A detached POSIX child leads its own process group. Kill descendants too,
      // even when the shell has exited but a descendant still holds the pipes.
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited or unavailable. */ }
      try { child.kill('SIGKILL'); } catch { /* Best-effort fallback. */ }
      finish(null, 'SIGKILL', !aborted, aborted);
    };
    const onAbort = () => terminate(true);
    const timer = setTimeout(() => terminate(false), timeoutMs);
    child.once('error', e => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e);
    });
    child.once('close', (code, signal) => finish(code, signal, false));
    abortSignal.addEventListener('abort', onAbort, { once: true });
    // Cover cancellation between the pre-spawn check and listener registration.
    if (abortSignal.aborted) onAbort();
  });
}

export function createCodeAgentHandler({ enabled, workspace }: Options) {
  workspace = resolve(workspace);
  return async (req: Request): Promise<Response> => {
    try {
      if (req.method === 'GET') return json({ enabled, workspace, shellAvailable: true });
      if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST');
      if (!enabled) return fail(403, 'DISABLED', 'Coding backend is disabled');
      if (req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return fail(415, 'EXPECTED_JSON', 'Expected application/json');
      }
      const input = await inputJSON(req);
      const op = text(input, 'op');
      if (!['list', 'read', 'write', 'edit', 'delete', 'bash'].includes(op)) {
        return fail(400, 'INVALID_OPERATION', 'Unknown coding operation');
      }
      const root = await realpath(workspace);
      if (op === 'bash') {
        const command = text(input, 'command');
        if (!command.trim() || command.includes('\0')) return fail(400, 'INVALID_COMMAND', 'command must be nonempty and contain no NUL bytes');
        const timeout = input.timeoutMs ?? CODE_LIMITS.defaultTimeoutMs;
        if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 1 || timeout > CODE_LIMITS.maxTimeoutMs) {
          return fail(400, 'INVALID_TIMEOUT', 'timeoutMs must be an integer from 1 to 120000');
        }
        const cwd = await confined(root, input.cwd ?? '.');
        if (!(await stat(cwd)).isDirectory()) return fail(400, 'NOT_DIRECTORY', 'cwd must be a directory');
        return await bash(command, cwd, timeout, req.signal);
      }
      const path = await confined(root, input.path ?? (op === 'list' ? '.' : undefined), op === 'write');
      if (op === 'list') {

        const entries: { name: string; type: string }[] = [];
        let truncated = false;
        const dir = await opendir(path);
        for await (const entry of dir) {
          if (entries.length === CODE_LIMITS.listEntries) { truncated = true; break; }
          entries.push({ name: entry.name, type: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' });
        }
        return json({ path: relative(root, path) || '.', entries, truncated });
      }
      if (op === 'read') return json({ path: relative(root, path), content: await readLimited(path) });
      if (op === 'delete') {
        if (path === root || await realpath(path) === root) return fail(403, 'ROOT_DELETE', 'Cannot delete the workspace root');
        if (input.recursive !== undefined && typeof input.recursive !== 'boolean') return fail(400, 'INVALID_INPUT', 'recursive must be a boolean');
        if ((await lstat(path)).isDirectory() && input.recursive !== true) return fail(400, 'RECURSIVE_REQUIRED', 'Directory deletion requires recursive: true');
        await rm(path, { recursive: input.recursive === true });
        return json({ ok: true, path: relative(root, path) });
      }
      let content: string;
      if (op === 'edit') {
        const oldText = text(input, 'oldText'), newText = text(input, 'newText');
        if (!oldText.length) return fail(400, 'EMPTY_OLD_TEXT', 'oldText must not be empty');
        const original = await readLimited(path);
        const index = original.indexOf(oldText);
        if (index === -1 || original.indexOf(oldText, index + 1) !== -1) {
          return fail(409, 'EDIT_MATCH', 'oldText must match exactly once');
        }
        content = original.slice(0, index) + newText + original.slice(index + oldText.length);
      } else { content = text(input, 'content'); }
      checkContent(content);
      // Recheck the parent and target immediately before writing. Do not create parents.
      await confined(root, relative(root, dirname(path)));
      await confined(root, relative(root, path), true);
      try {
        if (!(await stat(path)).isFile()) return fail(400, 'NOT_FILE', 'Expected a regular file');
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      await writeFile(path, content, 'utf8');
      return json({ ok: true, path: relative(root, path), bytes: Buffer.byteLength(content) });
    } catch (e) {
      if (e instanceof CodeError) return json({ error: { code: e.code, message: e.message } }, e.status);
      const code = (e as NodeJS.ErrnoException).code;
      const status = code === 'ENOENT' ? 404 : ['EACCES', 'EPERM', 'ELOOP'].includes(code || '') ? 403
        : ['ENOTDIR', 'EISDIR', 'EINVAL', 'ENOTEMPTY'].includes(code || '') ? 400 : 500;
      return json({ error: { code: code || 'INTERNAL_ERROR', message: status === 500 ? 'Coding operation failed' : 'Filesystem operation failed' } }, status);
    }
  };
}
