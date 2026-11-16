import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Action, Field, Select } from './controls';
import { useRuntimeSettings, type SettingsServices } from '../../services/settings';

export function WorkspaceSettings({ services, active }: { services: SettingsServices; active: boolean }) {
  const revision = useRuntimeSettings(state => state.revision);
  const sessionStatus = useRuntimeSettings(state => state.sessionStatus);
  const [sessions, setSessions] = useState<Array<{ id: string; name: string; updatedAt: number }>>([]);
  const [selected, setSelected] = useState('');
  const [url, setUrl] = useState(services.snapshot().background);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void services.listSessions().then(rows => { if (!cancelled) { setSessions(rows); setSelected(previous => rows.some(row => row.id === previous) ? previous : rows[0]?.id || ''); } }).catch(error => { if (!cancelled) setStatus(String(error)); });
    return () => { cancelled = true; };
  }, [active, revision, services]);
  useEffect(() => { if (active) setUrl(services.snapshot().background); }, [active, services]);
  async function run(action: () => unknown | Promise<unknown>, message: string) {
    setBusy(true);
    try { await action(); setStatus(message); } catch (cause) { setStatus(String(cause)); } finally { setBusy(false); }
  }
  return <>
    <h3>SESSIONS · SQLITE</h3><p role="status">{sessionStatus}</p>
    <Select label="Saved sessions" value={selected} onChange={setSelected}><option value="">Select a session</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.name} · {new Date(session.updatedAt).toLocaleString()}</option>)}</Select>
    <div className="r">
      <Action disabled={busy || !selected} onClick={() => { void run(() => services.loadSession(selected), 'Session loaded'); }}>LOAD SESSION</Action>
      <Action disabled={busy} onClick={() => useRuntimeSettings.setState({ newSessionRequested: true })}>NEW SESSION (N)</Action>
      <Action disabled={busy} onClick={() => { void run(() => services.saveSession(), 'Session saved'); }}>SAVE NOW</Action>
    </div>
    <p className="mut">Snapshots preserve scene data, scripts, panels, conversations and camera. Running agents restore paused. Browser closures, live timers, subprocesses and media streams cannot be snapshotted. Resume saved scripts explicitly. Souls and connection settings stay shared across sessions.</p>
    <Action onClick={() => { void run(() => services.resumeScripts(), 'Saved scripts/actions resumed'); }}>RESUME SAVED SCRIPTS / ACTIONS</Action>
    <div className="r"><Action disabled={busy} onClick={() => { void run(() => services.undo(), 'Undo applied'); }}>UNDO</Action><Action disabled={busy} onClick={() => { void run(() => services.redo(), 'Redo applied'); }}>REDO</Action></div>
    <h3>STAGE BACKGROUND & PANELS</h3>
    <Field label="Background image URL" value={url} onChange={setUrl} />
    <p className="mut">Cover-cropped at full resolution, fixed as the camera moves. Remote hosts must allow CORS. Saved per session.</p>
    <div className="r"><Action disabled={busy} onClick={() => { void run(() => services.setBackground(url), 'Background applied'); }}>SET IMAGE</Action><Action disabled={busy} onClick={() => { void run(async () => { await services.setBackground(''); setUrl(''); }, 'Background removed'); }}>REMOVE IMAGE</Action><Action onClick={() => services.arrangePanels()}>ARRANGE PANELS</Action></div>
    <p role="status">{status}</p>
  </>;
}

export function NewSessionDialog() {
  const requested = useRuntimeSettings(state => state.newSessionRequested);
  const services = useRuntimeSettings(state => state.services);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (requested) {
      setName('Session ' + new Date().toLocaleString()); setError('');
    }
  }, [requested]);
  return <Modal open={requested} className="gimage-lightbox" aria-labelledby="new-session-title"
    onClose={() => { if (!busy) useRuntimeSettings.setState({ newSessionRequested: false }); }}>
    <h2 id="new-session-title">Start a new session?</h2>
    <p>The current objects, panels and history will be saved. Active agents and tool requests stop. Background, hologram appearance, floor settings, Souls and connection settings stay shared.</p>
    <Field label="Session name" maxLength={100} value={name} onChange={setName} />
    <p role="alert">{error}</p>
    <div className="r"><Action disabled={busy} onClick={() => useRuntimeSettings.setState({ newSessionRequested: false })}>CANCEL</Action><Action disabled={busy || !services} onClick={() => {
      if (!services) return;
      setBusy(true);
      void services.newSession(name).then(() => useRuntimeSettings.setState({ newSessionRequested: false })).catch(cause => setError(String(cause))).finally(() => setBusy(false));
    }}>SAVE & START NEW</Action></div>
  </Modal>;
}
