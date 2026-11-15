import { useEffect, useRef, useState } from 'react';
import { useRuntimeUI } from '../../../stores/runtime-ui';

type Diagnostics = typeof import('../../services/runtime/diagnostics');
const controls = [
  ['lineWidth', 'Line width (raster pixels)', 1, 4, 1], ['lineDensity', 'Line density', 0, 1, .05],
  ['fade', 'Line fade (0 = uniform, 1 = normal)', 0, 1, .05], ['darkShading', 'Main dark shading (0 = off, 1 = normal)', 0, 2, .05],
  ['hueGradient', 'Main color mix (0 = off)', 0, 1, .05], ['mainCoreScale', 'Main core sphere size', .25, 2, .05],
  ['agentCount', 'Sub-agent orbiting particle count', 0, 16, 1],
] as const;

function VisualControls() {
  const [values, setValues] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(true);
  useEffect(() => { void import('../../services/runtime/raster-primitives').then(api => setValues({ ...api.rasterPrimitivesState.holoDebugVisuals })); }, []);
  const change = async (key: string, value: number) => {
    setValues(current => ({ ...current, [key]: value }));
    const api = await import('../../services/runtime/raster-primitives');
    api.rasterPrimitivesState.holoDebugVisuals[key] = value;
    setSaved(api.saveHologramVisuals());
  };
  return <fieldset style={{ border: '1px solid var(--line)', margin: '12px 0', padding: 10 }}>
    <legend>HOLOGRAM VISUALS · {saved ? 'live, saved across reloads' : 'storage unavailable, changes not saved'}</legend>
    {controls.map(([key, label, min, max, step]) => <label key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 35px', gap: 8, alignItems: 'center', margin: '8px 0' }}>
      <span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={values[key] ?? min} onChange={e => void change(key, Number(e.target.value))} /><output>{values[key] ?? min}</output>
    </label>)}
    <p className="mut">Line settings affect main and sub-agent holograms. Core size controls the main sphere; particle count leaves the solid sub-agent core intact. Sub-agent count is an offset from the default of 3, preserving per-agent customization.</p>
    <button className="b" onClick={() => void import('../../services/runtime/raster-primitives').then(api => {
      Object.assign(api.rasterPrimitivesState.holoDebugVisuals, api.rasterPrimitivesState.holoDebugDefaults);
      setValues({ ...api.rasterPrimitivesState.holoDebugVisuals }); setSaved(api.saveHologramVisuals());
    })}>RESET HOLOGRAM VISUALS</button>
  </fieldset>;
}

export function DiagnosticsPanel() {
  const debug = useRuntimeUI(state => state.debug);
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [memoryResult, setMemoryResult] = useState('');
  const [fallback, setFallback] = useState('');
  const output = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (fallback) { output.current?.focus(); output.current?.select(); } }, [fallback]);
  const run = async (action: (api: Diagnostics) => unknown) => {
    try { await action(await import('../../services/runtime/diagnostics')); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  return <section id="debug-panel" hidden={!debug.open} aria-label="Runtime debug panel" style={{ position: 'fixed', right: 14, top: 14, width: 'min(650px,95vw)', maxHeight: 'calc(100dvh - 28px)', overflow: 'auto', zIndex: 20, background: 'var(--card)', color: 'var(--fg)', border: '2px solid var(--acc2)', padding: 14, boxShadow: '4px 4px 0 var(--acc)', font: '11px ui-monospace,monospace' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ fontSize: 14, margin: 0 }}>DEBUG · D</h2><div>
      <button className="b" disabled={copying} onClick={() => void run(async api => {
        setCopying(true); setStatus('Collecting snapshot structure diagnostics…');
        try {
          const text = await api.collectDebugReport();
          try { await navigator.clipboard.writeText(text); setFallback(''); setStatus('Copied debug report. Paste it into the chat.'); }
          catch { setFallback(text); setStatus('Clipboard blocked. Copy the selected report manually.'); }
        } finally { setCopying(false); }
      })}>COPY DEBUG REPORT</button>{' '}
      <button className="b" onClick={() => void run(api => api.toggleDebug(false))}>CLOSE</button>
    </div></div>
    <p role="status" className="mut">{status}</p>
    {fallback && <textarea ref={output} aria-label="Debug report" readOnly value={fallback} style={{ width: '100%', height: 180 }} />}
    {debug.open && <VisualControls />}
    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{debug.metrics}</p>
    <p style={{ marginBottom: 4 }}>Main-thread delay/load proxy — not OS CPU usage</p>
    <canvas id="debugWave" width={600} height={90} style={{ display: 'block', width: '100%', height: 90, border: '1px solid var(--line)' }} />
    <p className="mut">{debug.load}</p><p style={{ whiteSpace: 'pre-wrap' }}>{memoryResult || debug.memory}</p>
    <button className="b" disabled={measuring} onClick={() => void run(async api => {
      setMeasuring(true); try { setMemoryResult(await api.measureDebugMemory()); } finally { setMeasuring(false); }
    })}>MEASURE PAGE MEMORY</button>
    <p className="mut">Heap memory is Chromium-only and excludes GPU/native allocations. Page-memory measurement requires browser support and cross-origin isolation. Actual CPU/process RAM are not available to normal browser JavaScript.</p>
    {debug.agents.map(agent => <details key={agent.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }} onToggle={event => {
      const expanded = event.currentTarget.open;
      void run(api => {
        if (expanded) api.diagnosticsState.debugExpanded.add(agent.id); else api.diagnosticsState.debugExpanded.delete(agent.id);
        if (useRuntimeUI.getState().debug.open) api.renderDebugDetailsOnly();
      });
    }}>
      <summary style={{ cursor: 'pointer' }}>{agent.title}</summary><p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{agent.info}</p>
      {agent.profile && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 340, overflow: 'auto', background: 'rgba(0,0,0,.18)', padding: 8 }}>{agent.profile}</pre>}
      {agent.context && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 340, overflow: 'auto', background: 'rgba(0,0,0,.18)', padding: 8 }}>{agent.context}</pre>}
      {agent.summary && <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{agent.summary}</pre>}
    </details>)}
  </section>;
}
