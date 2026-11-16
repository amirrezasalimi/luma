import { useEffect, useRef, useState } from 'react';
import { rpc } from '../../services/rpc';
import { sessionsState } from '../../services/runtime/sessions';
import type { GraphFact } from '../../../server/services/graph-memory';
import { createMemoryGraph } from './memory-graph-canvas';
import './memory-graph.css';
import { Modal } from '../Modal';

export function MemoryGraphButton() {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="memory-graph-launch" onClick={() => setOpen(true)}>◎ MEMORY GRAPH</button>{open && <MemoryGraphModal close={() => setOpen(false)} />}</>;
}

function MemoryGraphModal({ close }: { close: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<ReturnType<typeof createMemoryGraph> | null>(null);
  const [session, setSession] = useState(sessionsState.activeSession?.id || '');
  const [profile, setProfile] = useState('');
  const [profiles, setProfiles] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [cursors, setCursors] = useState<number[]>([0]);
  const [page, setPage] = useState<{ facts: GraphFact[]; total: number; nextAfter: number | null }>({ facts: [], total: 0, nextAfter: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const epoch = useRef(0);
  const currentSession = useRef(session);
  const after = cursors[cursors.length - 1]!;

  useEffect(() => {
    const timer = setInterval(() => {
      const current = sessionsState.activeSession?.id || '';
      if (currentSession.current !== current) {
        currentSession.current = current;
        setSession(current); setProfile(''); setCursors([0]);
      }
    }, 1000);
    return () => { clearInterval(timer); };
  }, []);
  useEffect(() => { const timer = setTimeout(() => setFilter(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!host.current) return;
    try { graph.current = createMemoryGraph(host.current, (entity, pinned) => pinned ? setSelected(entity) : setHovered(entity)); }
    catch (cause) { setError('Graph renderer unavailable: ' + String(cause)); }
    return () => { graph.current?.destroy(); graph.current = null; };
  }, []);
  useEffect(() => { graph.current?.update(page.facts); }, [page.facts]);
  useEffect(() => { graph.current?.select(selected); }, [selected]);
  useEffect(() => {
    let active = true;
    setProfiles([]);
    if (session) void rpc.host.ai.agents({ session }).then(agents => {
      if (active) setProfiles([...new Set(agents.map(agent => agent.name))]);
    }).catch(() => {});
    return () => { active = false; };
  }, [session]);
  useEffect(() => {
    const generation = ++epoch.current;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setPage({ facts: [], total: 0, nextAfter: null }); setSelected(null); setHovered(null); setConfirm(null);
    async function load() {
      if (disposed || !session) return;
      if (document.hidden) { timer = setTimeout(load, 3000); return; }
      setBusy(true);
      try {
        const next = await rpc.graphMemory.page({ session, profile: profile || undefined, query: filter, after });
        if (disposed || generation !== epoch.current) return;
        setPage(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        setError(''); setUpdated(new Date().toLocaleTimeString());
      } catch (cause) { if (!disposed) setError(String(cause)); }
      finally { if (!disposed) { setBusy(false); timer = setTimeout(load, 3000); } }
    }
    void load();
    return () => { disposed = true; clearTimeout(timer); };
  }, [session, profile, filter, after, refresh]);

  async function forget(id: number) {
    if (sessionsState.activeSession?.id !== session) { setError('Session changed. Wait for the graph to reconnect.'); return; }
    const generation = epoch.current;
    setDeleting(true);
    try {
      await rpc.graphMemory.forget({ session, profile: profile || undefined, id });
      if (epoch.current !== generation) return;
      setConfirm(null); setRefresh(value => value + 1);
    } catch (cause) { if (epoch.current === generation) setError(String(cause)); }
    finally { setDeleting(false); }
  }
  const entity = confirm !== null ? selected : hovered || selected;
  const entities = [...new Set(page.facts.flatMap(fact => [fact.subject, fact.object]))];
  const visible = entity ? page.facts.filter(fact => fact.subject === entity || fact.object === entity) : page.facts;
  return <Modal className="memory-graph-modal" aria-labelledby="memory-graph-title" onClose={close}>
    <div className="memory-graph-shell">
      <header><h2 id="memory-graph-title">MEMORY <span>{page.total}</span></h2><span className={`memory-graph-live ${error ? 'fault' : ''}`} title={updated ? `Last synced ${updated}` : 'Connecting'}>{error ? 'Sync error' : busy ? 'Syncing' : '● Live'}</span><button autoFocus onClick={close} aria-label="Close memory graph">✕</button></header>
      <div className="memory-graph-toolbar">
        <div className="memory-graph-navigation"><button aria-label="Zoom out" onClick={() => graph.current?.zoomBy(.8)}>−</button><button aria-label="Reset graph view" onClick={() => graph.current?.reset()}>Fit</button><button aria-label="Zoom in" onClick={() => graph.current?.zoomBy(1.25)}>+</button></div>
        <select aria-label="Workspace agent memory scope, shared across sessions" title="Workspace memory · shared across sessions" value={profile} disabled={deleting} onChange={event => { setProfile(event.target.value); setCursors([0]); }}><option value="">Luma · workspace</option>{profiles.map(name => <option key={name} value={name}>{name}</option>)}</select>
        <input aria-label="Search memory" placeholder="Search memory…" maxLength={300} value={query} onChange={event => { setQuery(event.target.value); setCursors([0]); }} />
        <button aria-label="Refresh memory" title="Refresh" onClick={() => setRefresh(value => value + 1)} disabled={busy}>↻</button>
      </div>
      {error && <p role="alert" className="memory-graph-error">{error}</p>}
      <div className="memory-graph-body">
        <div className="memory-graph-viewport"><div ref={host} className="memory-graph-canvas" />{!page.facts.length && <div className="memory-graph-empty">{!session ? 'Select a session' : busy ? 'Loading…' : filter ? 'No matches' : 'No saved facts'}<small>Factual memory · separate from Soul</small></div>}<div className="memory-graph-hint">Hover to inspect · Click to pin</div></div>
        <aside aria-label="Memory details"><div className="memory-graph-detail-heading"><h3>{entity || 'Connections'}</h3>{selected && <button aria-label="Unpin entity" onClick={() => { setSelected(null); setHovered(null); }}>✕</button>}</div>
          <select aria-label="Select entity" value={selected || ''} onChange={event => { setSelected(event.target.value || null); setHovered(null); setConfirm(null); }}><option value="">All entities</option>{entities.map(name => <option key={name}>{name}</option>)}</select>
          {visible.map(fact => <article key={fact.id} className="memory-graph-fact"><div className="memory-graph-triple"><button onClick={() => setSelected(fact.subject)}>{fact.subject}</button><span>→ {fact.predicate} →</span><button onClick={() => setSelected(fact.object)}>{fact.object}</button></div><details><summary>Details <small>{Math.round(fact.confidence * 100)}%</small></summary><blockquote>{fact.evidence}</blockquote><p>Source <span>{fact.source}</span></p><small>{new Date(fact.recorded_at).toLocaleString()} · #{fact.id} · confidence is agent supplied</small></details>
            {confirm === fact.id ? <div className="memory-graph-confirm"><p>Remove from recall? Historical evidence is retained. This is not secure erasure.</p><button disabled={deleting} onClick={() => void forget(fact.id)}>{deleting ? 'FORGETTING…' : 'CONFIRM FORGET'}</button><button disabled={deleting} onClick={() => setConfirm(null)}>CANCEL</button></div> : <button className="memory-graph-forget" disabled={deleting} onClick={() => { setSelected(entity); setHovered(null); setConfirm(fact.id); }}>FORGET CONNECTION</button>}
          </article>)}
        </aside>
      </div>
      <footer><span>{page.facts.length} connections · {entities.length} entities</span>{(cursors.length > 1 || page.nextAfter !== null) && <div><button disabled={cursors.length === 1 || busy} onClick={() => setCursors(values => values.slice(0, -1))}>←</button><span>Page {cursors.length}</span><button disabled={page.nextAfter === null || busy} onClick={() => setCursors(values => [...values, page.nextAfter!])}>→</button></div>}</footer>
    </div>
  </Modal>;
}
