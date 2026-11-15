import { useSettingsStore } from '../../../stores/settings';
import { useEffect, useState, type ChangeEvent } from 'react';
import { Inspector } from './inspector';
import { profilesContextState } from '../../services/runtime/profiles-context';

/** Typed host for the scene inspector while its controls migrate to React in small slices. */
export function BuildTools({ initialStepBack, initialAutoReport }: { initialStepBack: boolean; initialAutoReport: boolean }) {
  const [status] = useState('Tap an object or mini-holo to select');
  const enabled = useSettingsStore(state => state.config.showBuildTools === true);
  const [collapsed, setCollapsed] = useState(innerWidth < 700);
  const [revision, setRevision] = useState(0);
  const [stepBack, setStepBack] = useState(initialStepBack);
  const [autoReport, setAutoReport] = useState(initialAutoReport);
  useEffect(() => {
    const sync = (event: Event) => {
      const extension = (event as CustomEvent<{ step?: boolean; notify?: boolean }>).detail;
      if (extension.step !== undefined) setStepBack(extension.step);
      if (extension.notify !== undefined) setAutoReport(extension.notify);
    };
    document.addEventListener('workspace:settings', sync);
    return () => document.removeEventListener('workspace:settings', sync);
  }, []);
  const saveExtension = (patch: { step?: boolean; notify?: boolean }) => {
    document.dispatchEvent(new CustomEvent('workspace:settings-change', { detail: patch }));
  };
  useEffect(() => {
    const host = document.getElementById('tlp-wrap');
    if (!host) return;
    const refresh = () => setRevision(value => value + 1);
    host.addEventListener('workspace:refresh', refresh);
    return () => host.removeEventListener('workspace:refresh', refresh);
  }, []);
  const objects = [...profilesContextState.O.values()].filter((item: { dying?: number }) => !item.dying) as Array<{ id: string; parent: string; kind: string; text: string }>;
  return <section className={`pn t${collapsed ? ' c' : ''}`} id="tlp-wrap" style={{ display: enabled ? '' : 'none' }}>
    <h4 onClick={() => setCollapsed(value => !value)}><span>BUILD TOOLS</span><span>▾</span></h4>
    <div className="bd"><div className="g" id="workspace-build-tools">{['cube', 'pyramid', 'poly', 'sphere', 'text', 'arrow', 'link', 'node', 'panel'].map(kind => <button type="button" data-k={kind} key={kind}>{kind.toUpperCase()}</button>)}</div>
      <div className="mut" id="tlm">{status}</div><select id="osel" value={(profilesContextState.sel as string) || ''} onChange={event => {
        profilesContextState.sel = event.target.value || null;
        setRevision(value => value + 1);
      }}>
        <option value="">— objects ({objects.length}) —</option>
        {objects.map(object => <option key={object.id} value={object.id}>{object.parent ? '↳ ' : ''}{object.id} · {object.kind}{object.text ? ` · ${object.text.slice(0, 14)}` : ''}</option>)}
      </select>
      <div id="insp"><Inspector key={revision} /></div>
      <div id="scr"><label>SCRIPTS</label></div>
      <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button id="tclr" type="button" onClick={() => document.dispatchEvent(new Event('workspace:clear'))}>CLEAR ALL</button>
        <label className="ck"><input type="checkbox" checked={stepBack} onChange={(event: ChangeEvent<HTMLInputElement>) => saveExtension({ step: event.target.checked })} />STEP BACK</label>
        <label className="ck"><input type="checkbox" checked={autoReport} onChange={(event: ChangeEvent<HTMLInputElement>) => saveExtension({ notify: event.target.checked })} />AUTO-REPORT</label>
      </div>
    </div>
  </section>;
}
