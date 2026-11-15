import { host } from '../../services/host';
import { useState } from 'react';
import { Action, Field, Select } from './controls';
import type { SettingsServices } from '../../services/settings';

interface MarketRow {
  name: string; description?: string; source?: string; rawSkillUrl?: string; url?: string;
  package?: { launchSupported?: boolean; command?: string; args?: string[] };
}

export function MarketplaceSettings({ services }: { services: SettingsServices }) {
  const [kind, setKind] = useState('mcp');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState({ kind: 'mcp', query: '' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('bunx');
  const [args, setArgs] = useState('[]');
  const [env, setEnv] = useState('{}');
  async function run(action: () => Promise<void>) {
    setBusy(true); try { await action(); } catch (cause) { setStatus(String(cause)); } finally { setBusy(false); }
  }
  async function browse(more: boolean) {
    const current = more ? search : { kind, query };
    if (!more) { setSearch(current); setRows([]); setCursor(null); }
    const result = await host.marketplace({ kind: current.kind as 'mcp' | 'skills', q: current.query, ...(more && cursor ? { cursor } : {}) });
    setRows(previous => more ? [...previous, ...result.rows] : result.rows);
    setCursor(result.nextCursor || null); setStatus('Results loaded. Review sources and requirements before installing.');
  }
  async function install(row: MarketRow) {
    if (row.rawSkillUrl) {
      if (!confirm(`Import instructions for ${row.name}? Review untrusted skill content before enabling.`)) return;
      const response = await fetch(row.rawSkillUrl, { credentials: 'omit', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text(); if (new Blob([text]).size > 262144) throw new Error('Skill exceeds 256 KiB');
      // Import disabled regardless of upstream frontmatter.
      services.importSkills(JSON.stringify([{ name: row.name, description: row.description || row.name, body: text, on: false }]));
      setStatus('Imported disabled. Review instructions in Skills, then enable.');
    } else if (row.url && !/[{}]/.test(row.url)) {
      if (!confirm(`Save ${row.name} disabled? Review endpoint and credentials before enabling.`)) return;
      services.importMcps([{ name: row.name, url: row.url, on: false }]); setStatus('MCP saved disabled. Review in MCP Servers.');
    } else if (row.package?.launchSupported && row.package.command) {
      setName(row.name); setCommand(row.package.command); setArgs(JSON.stringify(row.package.args || [])); setEnv('{}');
      setStatus('Review the local command below, then Save Disabled.');
    } else { setStatus('This entry needs manual configuration. Review its metadata and import JSON in MCP Servers.'); }
  }
  return <>
    <h3>SKILLS & MCP MARKETPLACE</h3>
    <p className="mut">Search the official MCP Registry and skill repositories. Imports require review and start disabled. Skills import instructions only, not scripts or assets.</p>
    <Select label="Resource" value={kind} onChange={setKind}><option value="mcp">MCP servers</option><option value="skills">Agent skills</option></Select>
    <Field label="Search name or topic" value={query} onChange={setQuery} />
    <div className="r"><Action disabled={busy} onClick={() => { void run(() => browse(false)); }}>SEARCH</Action><Action disabled={busy || !cursor} onClick={() => { void run(() => browse(true)); }}>MORE</Action></div>
    {rows.map((row, index) => <article className="ar" key={`${row.name}-${index}`}><b>{row.name}</b><p className="mut">{row.description || row.source}</p><Action disabled={busy} onClick={() => { void run(() => install(row)); }}>REVIEW / INSTALL</Action><details><summary>Source & configuration</summary><pre className="settings-json">{JSON.stringify(row, null, 2)}</pre></details></article>)}
    <h3>LOCAL MCP · STDIO</h3>
    <p className="mut">Commands run with your full host-user permissions. Packages may download dependencies. Only enable trusted commands. Environment values are stored in server SQLite and included in exports.</p>
    <Field label="Name" value={name} onChange={setName} />
    <Field label="Command (bun, bunx or absolute executable path)" value={command} onChange={setCommand} />
    <Field label="Arguments JSON string array (no shell syntax)" multiline value={args} onChange={setArgs} />
    <Field label="Environment JSON (optional secrets)" multiline value={env} onChange={setEnv} />
    <div className="r"><Action disabled={busy} onClick={() => { void run(async () => {
      const response = await host.localMcp({ action: 'status' });
      const result = response.data; if (response.status >= 400) throw new Error(String(result.error));
      setStatus(result.enabled ? 'Local stdio execution enabled.' : 'Host disabled. Remove JARVIS_LOCAL_MCP=0 and restart the Bun host.');
    }); }}>CHECK HOST</Action><Action disabled={busy} onClick={() => { void run(async () => {
      const parsedArgs: unknown = JSON.parse(args), parsedEnv: unknown = JSON.parse(env);
      if (!name.trim() || !Array.isArray(parsedArgs) || !parsedArgs.every(value => typeof value === 'string') || !parsedEnv || typeof parsedEnv !== 'object' || Array.isArray(parsedEnv) || !Object.values(parsedEnv).every(value => typeof value === 'string')) throw new Error('Enter a name, string argument array and string-valued environment object');
      services.importMcps([{ name: name.trim(), command, args: parsedArgs, env: parsedEnv, on: false }]); setStatus('Saved disabled. Review in MCP Servers before enabling.');
    }); }}>SAVE DISABLED</Action></div>
    <p role="status">{status}</p>
  </>;
}
