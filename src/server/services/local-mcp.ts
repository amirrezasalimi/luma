import { result as serviceResult, resultResponse, type ServiceResult } from './result';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

// SECURITY: this is host code execution, NOT a sandbox. Enabled by default;
// set JARVIS_LOCAL_MCP=0 to disable. Accept only browser-user-confirmed configurations.
// Executables, scripts and packages inherit the server user's filesystem/network
// permissions (and environment). Never expose this handler without the RPC route's
// loopback authority and same-origin checks. Confirmation belongs to the caller;
// a JSON flag cannot prove that a human approved execution.
//
// POST application/json { action: 'request'|'stop'|'status', config?: {
//   name: string, command: 'bun'|'bunx'|absolutePath, args: string[], env?: Record<string,string>
// }, body?: JSONRPC }. config is required except for capability-only status.
// Request -> raw JSON-RPC response (original id preserved); notifications and
// client responses -> 202 { ok: true }. No implicit initialize/initialized calls:
// callers own the handshake, and initialize results pass through unchanged.
// Status -> { enabled, supported, session?, messages? }; messages drains a bounded
// queue of server notifications/requests. Reply to server requests using request.
// Stop -> { ok: true }; kills and forgets the session, allowing a later restart.
// Exits/timeouts/idle eviction leave a tombstone until stop (no silent respawn).

const REQUEST_LIMIT = 1024 * 1024;
const LINE_LIMIT = 4 * 1024 * 1024;
const OUTPUT_LIMIT = 64 * 1024 * 1024; // Total stdout + stderr per process lifetime.
const STDERR_LIMIT = 16 * 1024;
const MESSAGE_LIMIT = 1024 * 1024;
const PROCESS_LIMIT = 8;
const SESSION_LIMIT = 64; // Includes exited tombstones; stop releases a slot.
const PENDING_LIMIT = 128;
const TIMEOUT = 120_000;
const IDLE_TIMEOUT = 15 * 60_000;

type Config = { name: string; command: string; args: string[]; env: Record<string, string> };
type RPC = Record<string, unknown>;
type Child = Bun.Subprocess<'pipe', 'pipe', 'pipe'>;
type Pending = { resolve: (value: RPC) => void; reject: (error: Error) => void };
type Session = {
  key: string;
  child: Child;
  state: 'running' | 'exited';
  reason?: string;
  exitCode?: number;
  stderr: string;
  outputBytes: number;
  messages: RPC[];
  messageBytes: number;
  pending: Map<string, Pending>;
  nextId: number;
  inFlight: number;
  lastActivity: number;
  idleTimer?: ReturnType<typeof setTimeout>;
  writeTail: Promise<void>;
};

const allSessions = new Set<Session>();
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store' },
});
class LocalMcpError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function parseConfig(value: unknown): Config {
  if (!object(value) || typeof value.name !== 'string' || !value.name.trim()
      || value.name.length > 256 || typeof value.command !== 'string'
      || value.command.includes('\0') || value.command.length > 4096
      || (!['bun', 'bunx'].includes(value.command) && !isAbsolute(value.command))
      || !Array.isArray(value.args) || value.args.length > 256
      || value.args.some(arg => typeof arg !== 'string' || arg.includes('\0'))
      || (value.env !== undefined && (!object(value.env) || Object.entries(value.env).some(
        ([key, val]) => !key || key.includes('=') || key.includes('\0') || typeof val !== 'string' || val.includes('\0'),
      )))) {
    throw new LocalMcpError('Expected config { name, command: bun|bunx|absolute executable path, args: string[], env?: string record }. Subprocesses have full host-user permissions; use only user-confirmed configurations.', 400);
  }
  return { name: value.name, command: value.command as Config['command'], args: value.args as string[], env: (value.env ?? {}) as Record<string, string> };
}

function parseRPC(value: unknown): RPC {
  if (!object(value) || value.jsonrpc !== '2.0'
      || (value.id !== undefined && value.id !== null && typeof value.id !== 'string'
        && !(typeof value.id === 'number' && Number.isFinite(value.id)))
      || (typeof value.method === 'string'
        ? !value.method || (value.params !== undefined && !object(value.params) && !Array.isArray(value.params))
        : value.method !== undefined || value.id === undefined
          || (Object.hasOwn(value, 'result') === Object.hasOwn(value, 'error')))) {
    throw new LocalMcpError('Expected a single JSON-RPC 2.0 request, notification, or response (no batches)', 400);
  }
  return value;
}

async function readInput(req: Request): Promise<unknown> {
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > REQUEST_LIMIT)) {
    throw new LocalMcpError('JSON body exceeds 1 MiB or has invalid Content-Length', 413);
  }
  if (!req.body) throw new LocalMcpError('Expected JSON body', 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, TIMEOUT);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > REQUEST_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new LocalMcpError('JSON body exceeds 1 MiB', 413);
      }
      chunks.push(value);
    }
    if (timedOut) throw new LocalMcpError('JSON body read exceeded 120 seconds', 408);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof LocalMcpError) throw error;
    throw new LocalMcpError('Invalid JSON body', 400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function terminate(session: Session, reason: string) {
  if (session.state === 'exited') return;
  session.state = 'exited';
  session.reason = reason;
  clearTimeout(session.idleTimer);
  for (const pending of session.pending.values()) pending.reject(new LocalMcpError(reason));
  session.pending.clear();
  // Kill the direct child, without a shell. Descendants created by arbitrary
  // packages are not sandboxed or guaranteed to be terminated with their parent.
  try { session.child.kill('SIGKILL'); } catch { /* Already exited. */ }
}

function touch(session: Session) {
  session.lastActivity = Date.now();
  clearTimeout(session.idleTimer);
  if (session.state !== 'running') return;
  session.idleTimer = setTimeout(() => {
    if (session.inFlight) touch(session);
    else terminate(session, 'Session idle for 15 minutes; send stop before restarting');
  }, IDLE_TIMEOUT);
  session.idleTimer.unref();
}

function accountOutput(session: Session, size: number) {
  session.outputBytes += size;
  if (session.outputBytes > OUTPUT_LIMIT) throw new Error('Process exceeded its 64 MiB output budget');
}

function receive(session: Session, line: string) {
  if (!line.trim()) return;
  const message = parseRPC(JSON.parse(line));
  // Server responses must match a live transport id. Unmatched late responses
  // are ignored rather than consuming the unsolicited-message queue.
  if (message.method === undefined) {
    const pending = typeof message.id === 'string' ? session.pending.get(message.id) : undefined;
    if (pending) {
      session.pending.delete(message.id as string);
      pending.resolve(message);
    }
    return;
  }
  const size = Buffer.byteLength(line);
  if (session.messages.length >= 128 || session.messageBytes + size > MESSAGE_LIMIT) {
    throw new Error('Server notification/request queue overflow; poll status to drain messages');
  }
  session.messages.push(message);
  session.messageBytes += size;
}

async function readStdout(session: Session) {
  const reader = session.child.stdout.getReader();
  let buffered = Buffer.alloc(0);
  try {
    while (session.state === 'running') {
      const { done, value } = await reader.read();
      if (done) {
        if (buffered.length) throw new Error('Process closed stdout with an incomplete JSON-RPC line');
        terminate(session, 'Process closed stdout; send stop before restarting');
        break;
      }
      accountOutput(session, value.byteLength);
      buffered = Buffer.concat([buffered, value]);
      let newline: number;
      while ((newline = buffered.indexOf(10)) !== -1) {
        if (newline > LINE_LIMIT) throw new Error('JSON-RPC output line exceeds 4 MiB');
        receive(session, buffered.subarray(0, newline).toString('utf8'));
        buffered = buffered.subarray(newline + 1);
      }
      if (buffered.length > LINE_LIMIT) throw new Error('JSON-RPC output line exceeds 4 MiB');
    }
  } catch (error) {
    terminate(session, `Invalid MCP stdout: ${error instanceof Error ? error.message : 'read failure'}`);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readStderr(session: Session) {
  const reader = session.child.stderr.getReader();
  let tail = Buffer.alloc(0);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      tail = Buffer.concat([tail, value]).subarray(-STDERR_LIMIT);
      session.stderr = tail.toString('utf8');
      accountOutput(session, value.byteLength);
    }
  } catch (error) {
    terminate(session, error instanceof Error ? error.message : 'Stderr read failed');
  } finally {
    reader.releaseLock();
  }
}

function startSession(key: string, config: Config): Session {
  if (allSessions.size >= SESSION_LIMIT || [...allSessions].filter(s => s.child.exitCode === null).length >= PROCESS_LIMIT) {
    throw new LocalMcpError('Local MCP session/process limit reached; stop unused sessions', 429);
  }
  // Absolute paths (including spaces) are passed as one executable, never shell text.
  // Resolve using the backend PATH, not an env override supplied by the browser.
  const executable = Bun.which(config.command);
  if (!executable) throw new LocalMcpError(`Executable not found or not executable: ${config.command} (bare bun/bunx use the server PATH)`, 503);
  let child: Child;
  try {
    child = Bun.spawn({ cmd: [executable, ...config.args], stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...config.env } });
  } catch {
    throw new LocalMcpError('Could not spawn local MCP executable. Execution requires host-user permissions.');
  }
  const session: Session = {
    key, child, state: 'running', stderr: '', outputBytes: 0, messages: [], messageBytes: 0,
    pending: new Map(), nextId: 0, inFlight: 0, lastActivity: Date.now(), writeTail: Promise.resolve(),
  };
  allSessions.add(session);
  touch(session);
  void readStdout(session);
  void readStderr(session);
  void child.exited.then(code => {
    session.exitCode = code;
    terminate(session, `Local MCP process exited (${code}); send stop before restarting`);
  }, () => terminate(session, 'Local MCP process failed; send stop before restarting'));
  return session;
}

async function send(session: Session, body: RPC, signal: AbortSignal): Promise<ServiceResult<Record<string, unknown>>> {
  if (session.state !== 'running' || session.child.exitCode !== null) {
    terminate(session, 'Local MCP process exited; send stop before restarting');
    throw new LocalMcpError(session.reason ?? 'Session exited; send stop before restarting', 409);
  }
  if (session.inFlight >= PENDING_LIMIT) throw new LocalMcpError('Too many in-flight MCP messages', 429);
  session.inFlight++;
  touch(session);
  const expectsResponse = typeof body.method === 'string' && Object.hasOwn(body, 'id');
  const transportId = `jarvis:${++session.nextId}`;
  // Register before writing: a fast child may respond before stdin.flush resolves.
  const response = expectsResponse ? new Promise<RPC>((resolve, reject) => {
    session.pending.set(transportId, { resolve, reject });
  }) : undefined;
  const abort = () => terminate(session, 'MCP request cancelled; send stop before restarting');
  const timer = setTimeout(() => terminate(session, 'MCP request exceeded 120 seconds; send stop before restarting'), TIMEOUT);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const write = session.writeTail.then(async () => {
    if (session.state !== 'running') throw new LocalMcpError(session.reason ?? 'Session exited');
    session.child.stdin.write(JSON.stringify(expectsResponse ? { ...body, id: transportId } : body) + '\n');
    await session.child.stdin.flush();
  });
  session.writeTail = write.catch(() => {});
  // Race writes too: a child which never reads stdin must not hold HTTP open.
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  const watch = setInterval(() => {
    if (session.state === 'exited') rejectFailure(new LocalMcpError(session.reason ?? 'Session exited'));
  }, 50);
  try {
    const result = await Promise.race([
      Promise.all([write, response]).then(([, reply]) => reply), failure,
    ]);
    return result ? serviceResult({ ...result, id: body.id }) : serviceResult({ ok: true }, 202);
  } catch (error) {
    terminate(session, 'MCP transport failed; send stop before restarting');
    throw error;
  } finally {
    clearInterval(watch);
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    session.pending.delete(transportId);
    session.inFlight--;
    touch(session);
  }
}

export function shutdownLocalMcpSessions() {
  for (const session of allSessions) terminate(session, 'Local MCP backend shutting down');
}
process.once('exit', shutdownLocalMcpSessions);

export function createLocalMcpService() {
  const sessions = new Map<string, Session>();
  return async (input: Record<string, unknown>, signal: AbortSignal): Promise<ServiceResult<Record<string, unknown>>> => {
    const enabled = process.env.JARVIS_LOCAL_MCP !== '0';
    const supported = typeof Bun !== 'undefined' && typeof Bun.spawn === 'function' && typeof Bun.which === 'function';
    try {
      if (Buffer.byteLength(JSON.stringify(input)) > REQUEST_LIMIT) throw new LocalMcpError('Request exceeds limit', 413);
      if (!object(input) || !['request', 'stop', 'status'].includes(input.action as string)) {
        throw new LocalMcpError('Expected action: request, stop, or status', 400);
      }
      if (input.action === 'status' && input.config === undefined) return serviceResult({ enabled, supported });
      if (!enabled || !supported) {
        throw new LocalMcpError('Local MCP execution disabled or unsupported. Requires Bun; JARVIS_LOCAL_MCP=0 disables execution. User-confirmed subprocesses run with full host-user permissions.', 403);
      }
      const config = parseConfig(input.config);
      const key = createHash('sha256').update(JSON.stringify([
        config.name, config.command, config.args, Object.entries(config.env).sort(([a], [b]) => a.localeCompare(b)),
      ])).digest('hex');
      const session = sessions.get(key);
      if (input.action === 'stop') {
        if (session) {
          terminate(session, 'Session stopped');
          sessions.delete(key);
          // Do not release process capacity until the OS confirms the exit.
          void session.child.exited.finally(() => allSessions.delete(session)).catch(() => {});
        }
        return serviceResult({ ok: true });
      }
      if (input.action === 'status') {
        const messages = session?.messages.splice(0) ?? [];
        if (session) session.messageBytes = 0;
        return serviceResult({ enabled, supported, session: session ? {
          id: key, state: session.state, pid: session.child.pid, exitCode: session.exitCode,
          reason: session.reason, stderr: session.stderr, pending: session.pending.size,
          lastActivity: session.lastActivity,
        } : null, messages });
      }
      const body = parseRPC(input.body);
      if (signal.aborted) throw new LocalMcpError('Request cancelled', 400);
      const active = session ?? startSession(key, config);
      if (!session) sessions.set(key, active);
      return await send(active, body, signal);
    } catch (error) {
      return serviceResult({ error: error instanceof Error ? error.message : 'Local MCP request failed' },
        error instanceof LocalMcpError ? error.status : 502);
    }
  };
}

export function createLocalMcpHandler() {
  const execute = createLocalMcpService();
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'Expected application/json' }, 415);
    try {
      return resultResponse(await execute(await readInput(request) as Record<string, unknown>, request.signal));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Local MCP request failed' }, error instanceof LocalMcpError ? error.status : 502);
    }
  };
}
