import { useEffect, useRef } from 'react';
import { updateScriptUI, useRuntimeUI, type ScriptRow } from '../../../stores/runtime-ui';

export function ScriptManager() {
  const state = useRuntimeUI(s => s.scripts);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (state.open && !dialog.current?.open) dialog.current?.showModal();
    else if (!state.open && dialog.current?.open) dialog.current.close();
  }, [state.open]);

  const action = async (run: (api: typeof import('../../services/runtime/script-api')) => unknown) => {
    try { await run(await import('../../services/runtime/script-api')); }
    catch (error) { updateScriptUI({ status: error instanceof Error ? error.message : String(error) }); }
  };
  const control = (row: ScriptRow, command: string) => {
    if (command === 'edit') { updateScriptUI({ name: row.name, source: row.source, editNode: row.nodeId }); return; }
    void action(api => {
      api.controlAgentScript(state.owner, row.nodeId, row.name, command);
      api.renderScriptManager();
    });
  };
  return <dialog ref={dialog} className="gimage-lightbox" aria-labelledby="scriptManagerTitle" onClose={() => updateScriptUI({ open: false })}>
    <h2 id="scriptManagerTitle">{state.owner} · SCRIPTS</h2>
    <div>
      <p className="mut">Loose command callbacks: {state.callbacks} (frame: {state.frames}, intervals: {state.intervals}). These closures are not restored; use a named script for persistence.</p>
      {state.rows.map(row => <section className="ar" key={`${row.nodeId}:${row.name}`}>
        <b>{row.name}</b> · {row.status} · {row.callbacks} callbacks · {row.autoResume ? 'auto-resume' : 'manual resume'}
        <div className="bt">{['edit', 'stop', 'start', 'remove'].map(command => <button key={command} type="button" disabled={state.saving} onClick={() => control(row, command)}>{command.toUpperCase()}</button>)}</div>
        <details><summary>Source{row.error ? ' · ERROR' : ''}</summary><pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 240 }}>{row.source}{row.error ? `\nERROR: ${row.error}` : ''}</pre></details>
      </section>)}
    </div>
    <h3>CREATE / REPLACE NAMED SCRIPT</h3>
    <input aria-label="Script name" placeholder="Script name" value={state.name} disabled={state.saving} onChange={e => updateScriptUI({ name: e.target.value })} />
    <textarea aria-label="Script source" rows={10} spellCheck={false} placeholder="function update(delta) { }" value={state.source} disabled={state.saving} onChange={e => updateScriptUI({ source: e.target.value })} />
    <p role="status">{state.status}</p>
    <div className="r">
      <button className="b" disabled={state.saving} onClick={() => void action(api => api.saveScriptFromManager())}>{state.saving ? 'SAVING…' : 'SAVE & RUN'}</button>
      <button className="b" onClick={() => void action(api => api.stopManagerCallbacks())}>STOP LOOSE CALLBACKS</button>
      <button className="b" onClick={() => updateScriptUI({ open: false })}>CLOSE</button>
    </div>
  </dialog>;
}
