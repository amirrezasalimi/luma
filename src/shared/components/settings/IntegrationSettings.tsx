import { useState } from 'react';
import { useSettingsConfirm } from './ConfirmDialog';
import { Action, Field, Toggle } from './controls';
import { useRuntimeSettings, type SettingsServices } from '../../services/settings';

export function IntegrationSettings({ services, kind }: { services: SettingsServices; kind: 'skills' | 'mcp' }) {
  const confirm = useSettingsConfirm();
  const revision = useRuntimeSettings(state => state.revision);
  const snapshot = services.snapshot();
  const [input, setInput] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [token, setToken] = useState('');
  const [headers, setHeaders] = useState('{}');
  void revision;
  async function run(action: () => unknown | Promise<unknown>, message: string) {
    try { await action(); setStatus(message); } catch (cause) { setStatus(String(cause)); }
  }
  async function importMcp(input: unknown) {
    if (JSON.stringify(input).includes('"command"') && !await confirm('Import local MCP commands? Enabled entries execute with your full host-user permissions. Review the configuration first.')) return;
    await services.importMcps(input);
  }
  return <>
    <h3>{kind === 'skills' ? 'SKILLS' : 'MCP SERVERS · REMOTE & LOCAL'}</h3>
    {kind === 'skills' ? snapshot.skills.map(skill => <article className="ar" key={skill.name}>
      <Toggle label={skill.name} checked={skill.on} onChange={enabled => { void run(() => services.setSkill(skill.name, enabled), 'Skill updated'); }} />
      <p className="mut">{skill.description}</p>
      <details><summary>Review instructions</summary><pre className="settings-json">{skill.body}</pre></details>
      <Action onClick={() => { void run(() => services.deleteSkill(skill.name), 'Skill deleted'); }}>DELETE</Action>
    </article>) : snapshot.mcps.map(mcp => <article className="ar" key={mcp.name}>
      <Toggle label={mcp.name} checked={mcp.on !== false} onChange={async enabled => {
        if (enabled && mcp.command && !await confirm(`Start ${mcp.name}? Local commands run with your full user permissions and may download code.`)) return;
        void run(() => services.setMcp(mcp.name, enabled), 'MCP updated');
      }} />
      <p className="mut">{mcp.status} · {mcp.tools} tools · {mcp.command ? [mcp.command, ...(mcp.args || [])].join(' ') : mcp.url}</p>
      {mcp.error && <p className="err-box">{mcp.error}</p>}
      <div className="r">
        <Action onClick={() => { const { status: _status, tools: _tools, error: _error, ...config } = mcp; setInput(JSON.stringify({ mcpServers: { [mcp.name]: { ...config, on: false } } }, null, 2)); setStatus('Edit JSON below and import. Configuration starts disabled for review.'); }}>EDIT JSON</Action>
        <Action onClick={() => { void run(() => services.reconnectMcp(mcp.name), 'Pi configuration refreshed; changes apply to new requests'); }}>REFRESH</Action>
        <Action onClick={() => { void run(() => services.deleteMcp(mcp.name), 'MCP deleted'); }}>DELETE</Action>
      </div>
    </article>)}
    <details><summary>{kind === 'skills' ? '+ ADD SKILL' : '+ ADD REMOTE MCP'}</summary>
      <Field label="Name" value={name} onChange={setName} />
      {kind === 'skills' ? <>
        <Field label="Description (when to use)" value={description} onChange={setDescription} />
        <Field label="Instructions (markdown)" multiline value={body} onChange={setBody} />
        <Action onClick={() => { void run(() => { services.importSkills(JSON.stringify([{ name, description, body }])); setName(''); setDescription(''); setBody(''); }, 'Skill added'); }}>ADD</Action>
      </> : <>
        <Field label="Streamable HTTP endpoint" value={url} onChange={setUrl} />
        <Field label="Bearer token (optional)" type="password" value={token} onChange={setToken} />
        <Field label="Extra headers JSON" multiline value={headers} onChange={setHeaders} />
        <Action onClick={() => { void run(() => services.importMcps([{ name, url, token, headers: JSON.parse(headers), on: true }]), 'MCP saved in Pi; available on the next request'); }}>ADD TO PI</Action>
      </>}
    </details>
    {kind === 'skills' && <>
      <Field label="Raw SKILL.md URL (CORS required)" value={url} onChange={setUrl} />
      <Action onClick={() => { void run(async () => { const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(30000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); setInput(await response.text()); }, 'File loaded below. Review, then import.'); }}>LOAD URL</Action>
      <label>Load a local SKILL.md or JSON file <input type="file" accept=".md,.txt,.json" onChange={event => {
        const file = event.target.files?.[0]; if (file) void run(async () => setInput(await file.text()), 'File loaded below. Review, then import.'); event.target.value = '';
      }} /></label>
    </>}
    <Field label={kind === 'skills' ? 'Import / export JSON or SKILL.md' : 'Import / export MCP JSON (remote or local stdio)'} multiline value={input} onChange={setInput} />
    <div className="r">
      <Action onClick={() => { void run(() => kind === 'skills' ? services.importSkills(input) : importMcp(JSON.parse(input)), 'Imported. Review configuration and enable as appropriate.'); }}>IMPORT</Action>
      <Action onClick={() => {
        setInput(JSON.stringify(kind === 'skills' ? snapshot.skills : { mcpServers: Object.fromEntries(snapshot.mcps.map(({ status: _status, tools: _tools, error: _error, name, ...config }) => [name, config])) }, null, 2));
        setStatus('Exported below. Configuration can contain secrets.');
      }}>EXPORT JSON</Action>
    </div>
    <p role="status">{status}</p>
    {kind === 'mcp' && <p className="mut">Servers are saved in Pi’s native mcp.json. Pi manages connections, authentication and tool execution. Changes apply to new conversation requests. Tokens and environment values are included in exports. Local programs run with full host-user permissions.</p>}
  </>;
}
