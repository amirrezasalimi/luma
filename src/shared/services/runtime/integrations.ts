import { host } from '../host';
import { readPreference, writePreference } from '../persistence';
import { settingsChanged } from '../settings';
import { tryParseJson } from '../../utils/json';
import { cleanAesthetics, profilesContextState } from './profiles-context';
import { scriptApiState } from './script-api';
import { holoApply } from './hologram-controls';

export const integrationsState = {} as {
  SK: any[]; MC: any[]; MS: Map<string, any>;
  saveSK: () => void; saveMC: () => Promise<void>;
  skillText: (name: string) => string; mcpList: (server?: string) => any[];
  extraCtx: () => string; jtry: typeof tryParseJson;
};

export function parseSkill(text: any): any {
  const source = String(text).replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  const field = (key: string) => new RegExp('^' + key + ':\\s*(.*)$', 'mi').exec(match?.[1] || '')?.[1].trim().replace(/^["']|["']$/g, '') || '';
  return { name: field('name'), description: field('description'), body: (match?.[2] || source).trim() };
}

export function addSkills(list: any[]): number {
  let count = 0;
  for (const value of list) {
    if (!value || typeof value !== 'object') continue;
    const name = String(value.name || '').trim();
    const body = String(value.body ?? value.instructions ?? value.content ?? '').trim();
    if (!name || !body) continue;
    integrationsState.SK = integrationsState.SK.filter(skill => skill.name.toLowerCase() !== name.toLowerCase());
    integrationsState.SK.push({ name, body, description: String(value.description || name), on: value.on !== false });
    count++;
  }
  integrationsState.saveSK();
  renderSk();
  return count;
}

/** Only a configuration view: Pi sessions own all MCP connections and tool calls. */
function applyMcps(servers: Record<string, Record<string, any>>) {
  integrationsState.MC = Object.entries(servers).map(([name, config]) => ({ ...config, name, on: config.enabled !== false }));
  integrationsState.MS.clear();
  for (const config of integrationsState.MC) integrationsState.MS.set(config.name, { status: config.on ? 'Pi managed' : 'off', tools: [] });
  renderMcp();
}

export async function refreshMcps(): Promise<void> {
  applyMcps((await host.mcp.list()).servers);
}

export async function addMcps(input: any, onlyMissing = false): Promise<number> {
  const source = input?.mcpServers || input?.servers || input;
  const entries = Array.isArray(source) ? source.map(value => [value.name, value])
    : source?.url || source?.command ? [[source.name, source]] : Object.entries(source || {});
  const servers: Record<string, any> = Object.create(null);
  for (const [name, value] of entries) {
    if (!name || !value || typeof value !== 'object') continue;
    const { name: _name, on, token, bearer, bearerToken, authorization_token, serverUrl, ...config } = value;
    if (!config.command && !config.url && !serverUrl) continue;
    if (serverUrl && !config.url) config.url = serverUrl;
    config.headers = typeof config.headers === 'string' ? JSON.parse(config.headers || '{}') : config.headers;
    const key = token || bearer || bearerToken || authorization_token;
    if (key) config.headers = { ...config.headers, Authorization: 'Bearer ' + String(key).replace(/^Bearer\s+/i, '') };
    if (on !== undefined) config.enabled = on !== false;
    servers[name] = config;
  }
  const count = Object.keys(servers).length;
  if (count) applyMcps((await host.mcp.manage({ action: 'import', servers, onlyMissing })).servers);
  return count;
}

export async function setPiMcp(name: string, enabled: boolean): Promise<void> {
  applyMcps((await host.mcp.manage({ action: 'enable', name, enabled })).servers);
}
export async function deletePiMcp(name: string): Promise<void> {
  applyMcps((await host.mcp.manage({ action: 'delete', name })).servers);
}

// Explicit errors for old saved scene scripts: never recreate a parallel MCP runtime.
export async function mcpCall(..._args: unknown[]): Promise<never> {
  throw new Error('MCP tools are native Pi tools now. Ask the agent to call them directly through Pi codemode or tool_search, not browser mcp_call().');
}
export function renderSk(): void { settingsChanged(); }
export function renderMcp(): void { settingsChanged(); }

export function connectIntegrations(): void {
  integrationsState.SK = [];
  integrationsState.MC = [];
  integrationsState.MS = new Map();
  try { integrationsState.SK = JSON.parse(readPreference('luma-skills') || '[]'); } catch { /* Keep defaults. */ }
  integrationsState.saveSK = () => writePreference('luma-skills', JSON.stringify(integrationsState.SK));
  integrationsState.saveMC = refreshMcps;
  integrationsState.skillText = name => {
    const skill = integrationsState.SK.find(value => value.on && value.name.toLowerCase() === String(name).toLowerCase());
    if (!skill) throw new Error('No enabled skill ' + name);
    return skill.body;
  };
  integrationsState.mcpList = () => [];
  integrationsState.extraCtx = () => {
    const skills = integrationsState.SK.filter(value => value.on);
    let context = skills.length ? '\nSKILLS (read with await skill("name")):\n' + skills.map(value => '- ' + value.name + ': ' + value.description).join('\n') : '';
    context += '\nMCP tools are provided natively by Pi. Use the Pi MCP tools, codemode and tool_search, not browser JavaScript mcp_call/mcp_tools.\n';
    if (profilesContextState.ext.code && scriptApiState.codeHost?.enabled) context += '\nUse the native luma_host tool for host file and shell operations. Read before editing, preserve unrelated work and never perform destructive actions without user authorization. Shell commands run as the host user, not in a sandbox.\n';
    return context;
  };
  integrationsState.jtry = tryParseJson;
  void refreshMcps().catch(error => console.error('Pi MCP configuration:', error));
  try { holoApply(cleanAesthetics(profilesContextState.mainProfile.aesthetics, null)); }
  catch (error) { console.warn('Saved main aesthetics:', error); }
}
