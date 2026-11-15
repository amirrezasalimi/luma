/** session-restoration: runtime implementation. */
import { useRuntimeSettings } from "../settings";
import { clearSessionStage, refreshSessionList, restoreLabels, saveSession, sessionPlain, sessionRequest, sessionStatus, commitSession, sessionsState, stopSessionWork } from './sessions';
import { sceneFoundationState } from './scene-foundation';
import { objectRendererState } from './object-renderer';
import { holoApply, hologramControlsState, lblAct, logM, trimMainLogs } from './hologram-controls';
import { profilesContextState } from './profiles-context';
import { logAdd, sceneHudState } from './scene-hud';
import { addObj } from './scene-objects';
import { addPanel, fitPanel, layoutPanels, movePanel, panelWidget, sizePanel } from './panels-widgets';
import { addGui, gfail, guiNodesState, mkAct, setStageBackground } from './gui-nodes';
import { voicePipelineState } from './voice-pipeline';
import { mainOrchestratorState } from './main-orchestrator';
import { refreshUI, renderAg, renderInsp, workspaceUiState } from './workspace-bridge';
import { setTalk } from './agent-conversations';
import { build } from './script-lifecycle';
import { mkApi } from './script-api';
import { loadUndo } from './workspace-history';
import { spawn } from './agent-orchestrator';

export function restoreSession(s?: any): any {
  sessionsState.sessionRestoring = true;
  try {
    clearSessionStage();
    Object.assign(sceneFoundationState.cam, s.cameraVersion === 2 ? s.camera : {
      yaw: 0,
      zoom: 1,
      px: 0,
      py: 0
    });
    objectRendererState.stepped = false;
    objectRendererState.base = null;
    objectRendererState.tw = null;
    holoApply(s.hologram || {
      x: 0,
      y: 3.7,
      z: 0,
      radius: 2.8,
      floorRadius: 6.4,
      floorGrid: 1.2,
      color: '#ffb400',
      speakingColor: '#44e0e8',
      ringColor: '#ffb400',
      ringSpeakingColor: '#44e0e8',
      floorColor: '#4a5a9e'
    });
    sceneFoundationState.HX = sceneFoundationState.HT.x;
    sceneFoundationState.HY = sceneFoundationState.HT.y;
    sceneFoundationState.HQ = sceneFoundationState.HT.z;
    sceneFoundationState.HR = sceneFoundationState.HT.r;
    sceneFoundationState.SR = sceneFoundationState.HT.sr;
    Object.assign(profilesContextState.DEF, s.sceneDefaults || {});
    if (s.palettes) for (const [key, arr] of Object.entries<any>({
      P: sceneFoundationState.P,
      HZ: sceneFoundationState.HZ,
      GR: sceneHudState.GR,
      CYr: sceneHudState.CYr,
      GH: sceneHudState.GH,
      CHz: sceneHudState.CHz
    })) if (Array.isArray(s.palettes[key])) arr.splice(0, arr.length, ...s.palettes[key]);
    for (const row of s.agents || []) {
      const a: any = {
        ...row,
        log: (row.log || []).slice(-80),
        logArchive: (row.logArchive || []).slice(-200),
        tm: 0,
        E: 0,
        spawnA: 0,
        onlineSince: Date.now(),
        ctl: null,
        running: false,
        think: false,
        status: row.status === 'running' ? 'stopped' : row.status,
        tms: new Set(),
        waiters: [],
        peers: new Set(row.peers || []),
        labels: new Map(),
        fin: null,
        finIdle: false
      };
      profilesContextState.AG.set(a.id, a);
      restoreLabels(row.labels, a);
    }
    for (const row of s.objects || []) {
      const {
          scripts,
          parent,
          ...p
        }: any = row,
        o: any = addObj({
          ...p,
          keep: 0
        }, row.by);
      o.parent = parent || '';
      o.x = o.t.x;
      o.y = o.t.y;
      o.z = o.t.z;
      o.size = o.t.size;
      o.scripts = (scripts || []).map((v?: any): any => ({
        ...v,
        tm: new Set(),
        h: {},
        fns: {},
        dead: {},
        suspended: true
      }));
    }
    for (const p of s.panels || []) {
      addPanel({
        id: p.id,
        title: p.title,
        text: p.text,
        side: p.side,
        size: p.size || '2x2'
      }, p.by);
      const q: any = profilesContextState.PN.get(p.id);
      q.node.classList.toggle('c', !!p.collapsed);
      if (p.floating) {
        q.node.classList.add('fl');
        sizePanel(q, p.size || '2x2');
        if (q.node.parentElement !== document.body) document.body.append(q.node);
        if (p.corner) movePanel(p.id, p.corner, {
          dur: 0
        });else fitPanel(q.node, p.left, p.top);
      } else layoutPanels({
        ids: [p.id]
      });
      if (p.widget) panelWidget(p.id, p.widget);
      q.node.querySelector('.bd').scrollTop = p.scroll || 0;
    }
    for (const row of s.gui || []) {
      const g: any = addGui({
        ...row.p,
        id: row.id,
        type: row.type,
        panel: row.panel,
        parent: row.parent
      }, row.by);
      g.vars = row.vars || {};
      g.actions = row.actions || {};
      g.err = row.err;
      g.pendingActions = Object.keys(g.actions).length > 0;
    }
    restoreLabels(s.labels, null);
    for (const id of s.hiddenLabels || []) sceneFoundationState.HLH.add(id);
    for (const [k, v] of s.labelText || []) sceneFoundationState.HLT.set(k, v);
    for (const message of s.history || []) voicePipelineState.hist.push(message);
    profilesContextState.mainContextState = s.mainContextState || {};
    for (const entry of (s.main?.log || []).slice(-120)) hologramControlsState.MAIN.log.push(entry);
    for (const entry of (s.main?.archiveJSON ? JSON.parse(s.main.archiveJSON) : s.main?.archive || []).slice(-200)) hologramControlsState.MAIN.archive.push(entry);
    hologramControlsState.mainArchiveCache.source = null;
    trimMainLogs();
    hologramControlsState.MAIN.open = s.main?.open ?? true;
    for (const row of s.transcript || []) (mainOrchestratorState._la || logAdd)(row.role || 'ai', String(row.text || ''));
    [workspaceUiState.agp, workspaceUiState.tlp].forEach((n?: any, i?: any): any => n.classList.toggle('c', s.ui?.panels?.[i]?.collapsed ?? n === workspaceUiState.tlp));
    profilesContextState.oid = Math.max(profilesContextState.oid, s.counters?.oid || 0);
    profilesContextState.pid = Math.max(profilesContextState.pid, s.counters?.pid || 0);
    profilesContextState.aid = Math.max(profilesContextState.aid, s.counters?.aid || 0);
    guiNodesState.gid = Math.max(guiNodesState.gid, s.counters?.gid || 0);
    hologramControlsState.hlid = Math.max(hologramControlsState.hlid, s.counters?.hlid || 0);
    if (s.preferences) {
      voicePipelineState.muted = !!s.preferences.muted;
      voicePipelineState.nf = s.preferences.nf ?? voicePipelineState.nf;
      voicePipelineState.vc = s.preferences.vc ?? voicePipelineState.vc;
    }
    profilesContextState.sel = profilesContextState.O.has(s.selection) ? s.selection : null;
    setTalk(profilesContextState.AG.has(s.talkTo) ? s.talkTo : null);
    renderAg();
    refreshUI();
    renderInsp();
    if (s.background?.src) setStageBackground(s.background.src, s.background).catch((e?: any): any => logM('Background restore failed: ' + e.message, true));
    for (const o of profilesContextState.O.values()) for (const s of o.scripts) if (s.autoResume) {
      try {
        build(o, s);
      } catch (e: any) {
        s.suspended = true;
        console.error('Script restore failed:', e);
      }
    }
  } finally {
    sessionsState.sessionRestoring = false;
  }
}
export function resumeSessionScripts(): any {
  if (!confirm('Run saved scripts and actions? They may have side effects, including host tool calls if enabled. Function closures may need to be recreated by an agent.')) return;
  for (const o of profilesContextState.O.values()) for (const s of o.scripts) if (s.suspended) {
    s.suspended = false;
    build(o, s);
  }
  for (const g of guiNodesState.GU.values()) if (g.pendingActions) {
    for (const [k, a] of Object.entries<any>(g.actions)) try {
      g.fn[k] = a.function ? new Function('J', 'with(J){return (' + a.source + ')}')(mkApi({
        by: g.by,
        tm: g.tm
      })) : mkAct(g, a.source);
    } catch (e: any) {
      gfail(g, k, e);
    }
    g.pendingActions = false;
  }
  for (const a of [null, ...profilesContextState.AG.values()]) for (const h of (a ? a.labels : sceneFoundationState.HLB).values()) if (h.pendingAction) {
    try {
      const by: any = a?.name || 'jarvis',
        v: any = h.actionFunction ? new Function('J', 'with(J){return (' + h.actionSource + ')}')(mkApi({
          by,
          tm: new Set()
        })) : h.actionSource;
      h.fn = lblAct(v, by, h.id);
      h.pendingAction = false;
    } catch (e: any) {
      logM('Label action restore failed: ' + e.message, true);
    }
  }
  sessionStatus('Saved scripts/actions resumed; closures cannot be restored exactly');
}
export async function loadSession(id?: any): Promise<any> {
  if (!sessionsState.sessionReady) return;
  try {
    const row: any = await sessionRequest('sessions', id);
    if (!row) throw new Error('Session not found');
    if (!confirm('Save the current session and switch? Active agents will be stopped.')) return;
    stopSessionWork();
    await saveSession(true);
    sessionsState.activeSession = row;
    restoreSession(row.snapshot);
    void loadUndo();
    sessionsState.lastSnapshot = '';
    await saveSession(true);
    await refreshSessionList();
  } catch (e: any) {
    sessionStatus(e.message);
  }
}
export function askNewSession(): any {
  if (!sessionsState.sessionReady) {
    sessionStatus('Session storage is not ready');
    return;
  }
  useRuntimeSettings.setState({
    newSessionRequested: true
  });
}
export async function createNewSession(name?: any): Promise<any> {
  if (!sessionsState.sessionReady) throw new Error('Session storage is not ready');
  stopSessionWork();
  await saveSession(true);
  const next: any = {
    id: crypto.randomUUID(),
    name: name.trim() || 'New session',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const blank: any = {
    ...sessionPlain(sessionsState.initialSessionDefaults),
    version: 1,
    agents: [],
    objects: [],
    panels: [],
    gui: []
  };
  await commitSession({ ...next, snapshot: blank });
  sessionsState.activeSession = next;
  restoreSession(blank);
  void loadUndo();
  for (const p of Object.values<any>(profilesContextState.souls.agents)) if (p.autoload && p.soul.trim()) spawn(p.name, '', null, true, null, {
    idle: true,
    unlimited: p.unlimited
  });
  sessionsState.lastSnapshot = '';
  await saveSession(true);
  await refreshSessionList();
}
export async function initSessions(): Promise<any> {
  let phase: any = 'opening IndexedDB';
  try {
    sessionsState.sessionDB = true; // Server-backed repository is available after startup hydration.
    const meta: any = await sessionRequest('meta', 'active'),
      row: any = meta?.id ? await sessionRequest('sessions', meta.id) : null;
    phase = 'restoring the saved session';
    if (row) {
      sessionsState.activeSession = row;
      restoreSession(row.snapshot);
    } else {
      sessionsState.activeSession = {
        id: crypto.randomUUID(),
        name: 'Session ' + new Date().toLocaleString(),
        createdAt: Date.now()
      };
      for (const p of Object.values<any>(profilesContextState.souls.agents)) if (p.autoload) try {
        spawn(p.name, '', null, true, null, {
          idle: true,
          unlimited: p.unlimited
        });
      } catch (e: any) {
        console.error('Idle profile restore failed:', p.name, e);
      }
    }
    sessionsState.sessionReady = true;
    phase = 'restoring undo history';
    void loadUndo();
    phase = 'saving the restored session';
    await saveSession(true);
    phase = 'loading the session list';
    await refreshSessionList();
    setInterval((): any => saveSession().catch((): any => {}), 5000);
  } catch (e: any) {
    console.error('Session initialization failed during ' + phase, e);
    sessionStatus('Session initialization failed while ' + phase + ': ' + e.message + ' — existing saved data has not been deleted. ' + (sessionsState.sessionReady ? 'Saving will be retried.' : 'This page is not being saved.'));
    if (sessionsState.sessionReady) setInterval((): any => saveSession().catch((): any => {}), 5000);
  }
}
// ---------------- On-demand runtime diagnostics ----------------
export function bindSessionShortcut(): void {
  addEventListener('keydown', (e?: any): any => {
    if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing || e.composedPath().some((n?: any): any => n instanceof Element && (n.matches('input,textarea,select') || (n instanceof HTMLElement && n.isContentEditable))) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    askNewSession();
  });
}
