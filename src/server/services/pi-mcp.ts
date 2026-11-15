import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// This edits Pi's native configuration only. Pi owns discovery, transport,
// authentication, tool registration, execution and connection cleanup.
const config = z.object({
  command: z.string().min(1).optional(), args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(), cwd: z.string().optional(),
  url: z.url().optional(), headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
  exposure: z.enum(['codemode', 'deferred', 'direct', 'hidden']).optional(),
}).passthrough().refine(value => !!value.command !== !!value.url, 'Provide either command or URL');
export const piMcpMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('import'), servers: z.record(z.string().min(1).max(200), config), onlyMissing: z.boolean().default(false) }),
  z.object({ action: z.literal('enable'), name: z.string().min(1), enabled: z.boolean() }),
  z.object({ action: z.literal('delete'), name: z.string().min(1) }),
]);

export function createPiMcpConfigStore(agentDir: () => string | Promise<string> = async () => (await import('@earendil-works/pi-coding-agent')).getAgentDir()) {
  let pending = Promise.resolve();
  async function read() {
    const path = join(await agentDir(), 'mcp.json');
    let document: Record<string, any>;
    try { document = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      document = {};
    }
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Invalid Pi mcp.json');
    const servers = document.mcpServers || {};
    if (typeof servers !== 'object' || Array.isArray(servers)) throw new Error('Invalid Pi mcpServers');
    return { path, document, servers: servers as Record<string, Record<string, any>> };
  }
  return {
    async list() { const { path, servers } = await read(); return { path, servers }; },
    async mutate(input: z.output<typeof piMcpMutation>) {
      const operation = pending.then(async () => {
        const { path, document, servers } = await read();
        if (input.action === 'import') {
          for (const [name, value] of Object.entries(input.servers)) {
            if (!input.onlyMissing || !Object.hasOwn(servers, name)) Object.defineProperty(servers, name, { value, enumerable: true, configurable: true, writable: true });
          }
        } else if (input.action === 'delete') delete servers[input.name];
        else {
          if (!Object.hasOwn(servers, input.name)) throw new Error('Unknown Pi MCP server');
          servers[input.name] = { ...servers[input.name], enabled: input.enabled };
        }
        await mkdir(await agentDir(), { recursive: true });
        const temporary = `${path}.jarvis-${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify({ ...document, mcpServers: servers }, null, 2) + '\n', { mode: 0o600 });
        await rename(temporary, path);
        return { path, servers };
      });
      pending = operation.then(() => {}, () => {});
      return operation;
    },
  };
}
export const piMcpConfig = createPiMcpConfigStore();
