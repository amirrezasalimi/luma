import { useEffect, useState } from 'react';
import type { JarvisConfig } from '../../../stores/settings';
import { useRuntimeSettings, type SettingsServices, type VoiceOption } from '../../services/settings';
import { Action, Field, ReasoningOptions, Select, Toggle } from './controls';

export function VoiceSettings({ services, draft, patch }: {
  services: SettingsServices; draft: JarvisConfig; patch(values: Partial<JarvisConfig>): void;
}) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [text, setText] = useState('Hello. I am Jarvis, ready when you are.');
  const status = useRuntimeSettings(state => state.voiceStatus);
  const busy = useRuntimeSettings(state => state.voiceBusy);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try { setVoices(await services.loadVoices()); useRuntimeSettings.setState({ voiceStatus: 'Voices loaded. Review your selection, then Save.' }); }
    catch (error) { useRuntimeSettings.setState({ voiceStatus: String(error) }); }
    finally { setLoading(false); }
  }
  return <>
    <h3>VOICE · LOCAL</h3>
    <Field label="TTS model (phonon-tts)" value={draft.tts} onChange={tts => patch({ tts })} />
    <Select label="TTS voice" value={draft.voice} onChange={voice => patch({ voice })}>
      <option value="">Model default</option>
      {draft.voice && !voices.some(v => v.value === draft.voice) && <option value={draft.voice}>{draft.voice} (saved)</option>}
      {voices.map(voice => <option key={voice.value} value={voice.value}>{voice.label}</option>)}
    </Select>
    <Action onClick={() => void load()} disabled={loading}>LOAD VOICES</Action>
    <Field label="Demo text" value={text} onChange={setText} />
    <div className="r">
      <Action disabled={busy} onClick={() => { void services.testVoice({ tts: draft.tts, dev: draft.dev, voice: draft.voice, text }).catch(error => useRuntimeSettings.setState({ voiceStatus: String(error) })); }}>TEST VOICE</Action>
      <Action disabled={!busy} onClick={() => { services.stopVoice(); useRuntimeSettings.setState({ voiceStatus: 'Demo stopped.' }); }}>STOP</Action>
    </div>
    <p role="status">{status}</p>
    <p className="mut">Models and the voice catalog load from bundled local files. Preview uses these draft settings; Save applies them to conversations.</p>
    <Select label="STT engine" value={draft.sttMode} onChange={sttMode => patch({ sttMode })}>
      <option value="whistle">Whistle WebGPU (local)</option><option value="browser">Browser (Web Speech API)</option>
    </Select>
    <Field label="STT model" value={draft.stt} onChange={stt => patch({ stt })} />
    <Select label="Device" value={draft.dev} onChange={dev => patch({ dev })}><option value="webgpu">webgpu</option><option value="wasm">wasm</option></Select>
  </>;
}

export function AgentSettings({ services }: { services: SettingsServices }) {
  const revision = useRuntimeSettings(state => state.revision);
  const { agents, context } = services.snapshot();
  const [error, setError] = useState('');
  void revision;
  function run(action: () => void) { try { action(); setError(''); } catch (cause) { setError(String(cause)); } }
  return <>
    <h3>SUB-AGENTS</h3><p className="mut">These settings save immediately.</p>
    <Field label="Sub-agent model (blank = main)" value={agents.am} onChange={am => run(() => services.setAgentDefaults({ am: am.trim() }))} />
    <Select label="Sub-agent reasoning effort" value={agents.ar} onChange={ar => run(() => services.setAgentDefaults({ ar }))}><ReasoningOptions /></Select>
    <Field label="Endpoint override" value={agents.ae} onChange={ae => run(() => services.setAgentDefaults({ ae }))} />
    <Field label="API key override" type="password" value={agents.ak} onChange={ak => run(() => services.setAgentDefaults({ ak }))} />
    <Field label="Max steps per agent" type="number" value={agents.max} onChange={max => run(() => services.setAgentDefaults({ max: Math.min(40, Math.max(2, Number(max) || 14)) }))} />
    <h3>CONTEXT MANAGEMENT · MAIN & SUB-AGENTS</h3>
    <Select label="Strategy" value={context.strategy} onChange={strategy => run(() => services.setContext({ ...context, strategy }))}>
      <option value="paging">Paging — last N messages</option><option value="auto">Auto-compact</option><option value="full">Full history</option>
    </Select>
    <Field label="Model context capacity (estimated tokens)" type="number" value={context.maxTokens} onChange={value => run(() => services.setContext({ ...context, maxTokens: Number(value) }))} />
    <Field label="Auto-compact threshold (%)" type="number" value={context.threshold} onChange={value => run(() => services.setContext({ ...context, threshold: Number(value) }))} />
    <Field label="Recent messages to retain" type="number" value={context.lastN} onChange={value => run(() => services.setContext({ ...context, lastN: Number(value) }))} />
    <p className="mut">Estimates are not model token counts. Auto-compact makes extra paid LLM requests; full history can exceed provider limits.</p>
    {error && <p role="alert">{error}</p>}
  </>;
}

export function CodeSettings({ services, active }: { services: SettingsServices; active: boolean }) {
  const revision = useRuntimeSettings(state => state.revision);
  const [status, setStatus] = useState('');
  const [checking, setChecking] = useState(false);
  void revision;
  async function check() {
    setChecking(true);
    try { const result = await services.checkCodeHost(); setStatus(result.enabled ? `Server ready · workspace: ${result.workspace}` : result.error || 'Server tools disabled. Restart with JARVIS_CODE_AGENT=1.'); }
    catch (cause) { setStatus(String(cause)); } finally { setChecking(false); }
  }
  useEffect(() => { if (active) void check(); }, [active, services]);
  return <>
    <h3>CODE AGENT · HOST ACCESS</h3>
    <Toggle label="Enable host coding tools for main and sub-agents" checked={!!services.snapshot().agents.code} onChange={code => {
      if (code && !confirm('Enable host filesystem and Bash tools? Bash is NOT sandboxed and runs with your full user permissions.')) return;
      services.setAgentDefaults({ code }); void check();
    }} />
    <p className="mut">Tools can read, write and delete workspace files and execute Bash. Bash is NOT sandboxed. File contents and output are sent to your LLM provider. Disabling cancels active requests best-effort, but does not undo completed changes. This toggle saves immediately; the server flag must also be enabled.</p>
    <p role="status">{status}</p><Action disabled={checking} onClick={() => void check()}>CHECK SERVER</Action>
  </>;
}
