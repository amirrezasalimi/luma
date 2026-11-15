/** workspace-ui: runtime implementation. */
import { addPanel, panelsWidgetsState } from './panels-widgets';
import { sceneFoundationState } from './scene-foundation';
import { profilesContextState, saveSouls } from './profiles-context';
import { addObj, delAll } from './scene-objects';
import { scriptLifecycleState } from './script-lifecycle';
import { hologramControlsState } from './hologram-controls';
import { openScriptManager } from './script-api';
import { cancelTurn, userText } from './voice-pipeline';
import { agentOrchestratorState, grantPeers, logA, spawn, tell } from './agent-orchestrator';
import { awaitAgentConversation, setTalk } from './agent-conversations';
import { tap } from './microphone';
import { mountAgentsPanel, mountBuildTools } from '../../components/workspace/mount';
import { registerWorkspace } from './workspace-bridge';

interface ModuleState {
  agp: HTMLElement;
  tlp: HTMLElement;
  msg: (message: string) => void;
  SCR_TPL: string;
  rqT: ReturnType<typeof setTimeout>;
  executionOpen: Set<number>;
  mainRow: () => string;
}

export const workspaceUiState = {} as ModuleState;

registerWorkspace(workspaceUiState, refreshUI, renderAg, renderInsp);

export function renderInsp(): any {
  const host = document.getElementById('tlp-wrap');
  host?.dispatchEvent(new Event('workspace:refresh'));
  renderScr();
}
export function renderScr(): any {
  const o: any = profilesContextState.O.get(profilesContextState.sel),
    b: any = profilesContextState.$$('#scr');
  if (!b) return;
  if (!o) {
    b.innerHTML = '';
    delete b.dataset.rendered;
    profilesContextState.scrSel = null;
    return;
  }
  if (o.id !== profilesContextState.scrSel) {
    profilesContextState.scrSel = o.id;
    profilesContextState.scrName = 'main';
    profilesContextState.scrSrc = workspaceUiState.SCR_TPL;
  }
  const markup: any = '<label>SCRIPTS</label>' + o.scripts.map((s?: any): any => '<div class="ar" data-sn="' + profilesContextState.esc(s.name) + '"><div class="rh"><b>' + profilesContextState.esc(s.name) + '</b><i>' + (s.err ? '✖ error' : '✓ ok') + ' · by ' + profilesContextState.esc(s.by) + '</i></div>' + (s.err ? '<div class="err-box">' + profilesContextState.esc(scriptLifecycleState.errTxt(s.err)) + '</div>' : '') + '<div class="bt"><button data-sa="edit">EDIT</button><button data-sa="del">REMOVE</button></div></div>').join('') + '<input id="sname" placeholder="script name" value="' + profilesContextState.esc(profilesContextState.scrName) + '"><textarea id="ssrc" rows="8" spellcheck="false">' + profilesContextState.esc(profilesContextState.scrSrc) + '</textarea><button id="ssave">ATTACH / UPDATE</button><label>VARS (JSON, Enter to apply)</label><textarea id="svars" rows="2" spellcheck="false">' + profilesContextState.esc(JSON.stringify(o.vars)) + '</textarea>';
  if (b.dataset.rendered !== markup) {
    const scrolls: any = Array.from(b.querySelectorAll('textarea')).map((t?: any): any => ({
      id: t.id,
      top: t.scrollTop,
      left: t.scrollLeft
    }));
    b.innerHTML = markup;
    b.dataset.rendered = markup;
    for (const saved of scrolls) {
      const textarea: any = sceneFoundationState.$(saved.id);
      if (textarea) {
        textarea.scrollTop = saved.top;
        textarea.scrollLeft = saved.left;
      }
    }
  }
  profilesContextState.scrDirty = 0;
}
export function refreshUI(): any {
  const s: any = profilesContextState.$$('#osel');
  if (!s) return;
  if (document.activeElement === s) return;
  s.innerHTML = '<option value="">— objects (' + [...profilesContextState.O.values()].filter((o?: any): any => !o.dying).length + ') —</option>' + [...profilesContextState.O.values()].filter((o?: any): any => !o.dying).map((o?: any): any => '<option value="' + o.id + '"' + (o.id === profilesContextState.sel ? ' selected' : '') + '>' + (o.parent ? '↳ ' : '') + o.id + ' · ' + o.kind + (o.text ? ' · ' + profilesContextState.esc(o.text.slice(0, 14)) : '') + '</option>').join('');
  const activeElement = document.activeElement;
  const f = activeElement instanceof HTMLElement && workspaceUiState.tlp.contains(activeElement) && (/INPUT|TEXTAREA|SELECT/.test(activeElement.tagName) || activeElement.isContentEditable);
  if (!f) renderInsp();else if (profilesContextState.scrDirty && !profilesContextState.$$('#scr').contains(document.activeElement)) renderScr();
}
export function rq(): any {
  clearTimeout(workspaceUiState.rqT);
  workspaceUiState.rqT = setTimeout((): any => renderAg(), 120);
}
export function renderExecutionLogs(logs?: any): any {
  return logs.map((l?: any): any => l.execution ? '<details data-execution="' + l.t + '" ' + (workspaceUiState.executionOpen.has(l.t) ? 'open' : '') + '><summary>' + profilesContextState.esc(l.text) + '</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">' + profilesContextState.esc(l.execution.code) + '\n\nRESULT:\n' + profilesContextState.esc(JSON.stringify({
    result: l.execution.result,
    output: l.execution.output,
    error: l.execution.error
  }, null, 2)) + '</pre></details>' : '<div>' + profilesContextState.esc(l.text) + '</div>').join('');
}
export function renderAg(): any {
  const box: any = profilesContextState.$$('#agl');
  if (!box) return;
  if (document.activeElement && box.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  profilesContextState.$$('#agn').textContent = profilesContextState.AG.size;
  const scrollState: any = Array.from(box.querySelectorAll('.ar[data-id]')).map((row?: any): any => ({
      id: row.dataset.id,
      logs: row.querySelector('.lg')?.scrollTop || 0
    })),
    body: any = workspaceUiState.agp.querySelector('.bd'),
    bodyScroll: any = body.scrollTop;
  const markup: any = workspaceUiState.mainRow() + ([...profilesContextState.AG.values()].map((a?: any): any => {
    const last: any = a.log.length ? a.log[a.log.length - 1].text : '';
    const peerBadge: any = a.peers.size ? '<span class="peer-tag" title="Authorized Peers">⇄ ' + profilesContextState.esc([...a.peers].join(',')) + '</span>' : '';
    return '<div class="ar' + (a.status === 'running' ? ' run' : '') + '" data-id="' + a.id + '"><div class="rh" data-a="tog"><span class="dot ' + a.status + '" style="background:' + (a.status === 'error' ? '#ff2a38' : a.pal.hex) + '"></span><b style="color:' + a.pal.hex + '">' + profilesContextState.esc(a.name) + '</b>' + peerBadge + '<i>' + profilesContextState.esc(a.model) + ' · ' + a.step + '/' + (a.unlimited ? '∞' : profilesContextState.agentLimit(a)) + ' ' + (a.open ? '▾' : '▸') + '</i></div>' + '<div class="sy" data-a="tog">' + (a.think ? '<span class="th">thinking…</span> ' : '') + profilesContextState.esc(last) + '</div>' + (a.lastErr ? '<div class="err-box"><b>FAILED:</b> ' + profilesContextState.esc(a.lastErr) + '</div>' : '') + (a.open ? '<div class="tl">' + a.tasks.map((t?: any): any => '<div>' + (t.st === 'run' ? '▶' : t.st === 'done' ? '✓' : '■') + ' ' + profilesContextState.esc(t.text) + '</div>').join('') + '</div><div class="lg">' + renderExecutionLogs(a.log.slice(-16)) + '</div><div class="bt">' + (a.status === 'running' ? '<button data-a="stop">STOP</button>' : '<button data-a="run">RETRY / RESUME</button>') + '<button data-a="scripts">SCRIPTS</button><button data-a="talk">TALK</button><button data-a="turns">MAX TURNS</button><button data-a="limit">' + (a.unlimited ? 'UNLIMITED ✓' : 'LIMITED') + '</button><button data-a="peer">' + (a.peers.has('*') ? 'ISOLATE' : 'SHARE PEERS') + '</button><button data-a="clr">CLEAR WORK</button><button data-a="kill">REMOVE HOLO</button></div><input data-t="' + a.id + '" placeholder="message ' + profilesContextState.esc(a.name) + ' + Enter">' : '') + '</div>';
  }).join('') || '<div class="mut">No sub-agents yet. Ask Jarvis for something big, or launch one above.</div>');
  if (box.innerHTML !== markup) {
    box.innerHTML = markup;
    for (const state of scrollState) {
      const row: any = Array.from(box.querySelectorAll('.ar[data-id]')).find((row?: any): any => row.dataset.id === state.id),
        logs: any = row?.querySelector('.lg');
      if (logs) logs.scrollTop = state.logs;
    }
    body.scrollTop = bodyScroll;
  }
}
export function createWorkspaceControls(): void {
  workspaceUiState.agp = document.getElementById('agents-panel-host')!;
  mountAgentsPanel(workspaceUiState.agp);
  workspaceUiState.tlp = document.getElementById('build-tools-host')!;
  mountBuildTools(workspaceUiState.tlp, profilesContextState.ext.step, profilesContextState.ext.notify);
  if (innerWidth < 700) workspaceUiState.tlp.classList.add('c');
  workspaceUiState.msg = (t?: any): any => profilesContextState.$$('#tlm').textContent = t;
  workspaceUiState.tlp.addEventListener('click', (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#tclr')) { delAll(); workspaceUiState.msg('Cleared'); return; }
    const kind = target?.closest<HTMLElement>('[data-k]')?.dataset.k;
    if (!kind) return;
    if (kind === 'link') {
      if (!profilesContextState.sel) { workspaceUiState.msg('Select the first object, then press LINK'); return; }
      profilesContextState.linkFrom = profilesContextState.sel;
      workspaceUiState.msg('Now tap the target object');
    } else if (kind === 'panel') addPanel({ title: 'NOTES', text: 'Edit me', side: 'right' });
    else { profilesContextState.sel = addObj({ kind }).id; renderInsp(); refreshUI(); }
  });
  document.addEventListener('workspace:settings-change', event => {
    const patch = (event as CustomEvent<{ step?: boolean; notify?: boolean }>).detail;
    Object.assign(profilesContextState.ext, patch);
    profilesContextState.saveExt();
  });
  // script editor
  workspaceUiState.SCR_TPL = 'exportVars({speed:1});\nfunction mount(){}\nfunction update(dt){self.rot+=dt*self.speed}\nfunction onClick(e){self.animate("pulse")}\nfunction unmount(){}';
  setInterval(refreshUI, 900);
  workspaceUiState.executionOpen = new Set();
  document.addEventListener('toggle', (e?: any): any => {
    if (e.target.dataset?.execution) {
      const id: any = +e.target.dataset.execution;
      if (e.target.open) workspaceUiState.executionOpen.add(id);else workspaceUiState.executionOpen.delete(id);
    }
  }, true);
  workspaceUiState.mainRow = (): any => {
    const last: any = hologramControlsState.MAIN.log.length ? hologramControlsState.MAIN.log[hologramControlsState.MAIN.log.length - 1].text : '';
    return '<div class="ar' + (sceneFoundationState.mode !== 'idle' ? ' run' : '') + '" data-id="main"><div class="rh" data-a="tog"><span class="dot" style="background:#ffb400"></span><b style="color:#ffb400">JARVIS</b><span class="peer-tag">main</span><i>' + profilesContextState.esc(sceneFoundationState.cfg.model) + ' · ' + profilesContextState.esc(sceneFoundationState.mode) + (sceneFoundationState.talkTo ? ' · talk>' + profilesContextState.esc(sceneFoundationState.talkName) : '') + ' ' + (hologramControlsState.MAIN.open ? '▾' : '▸') + '</i></div><div class="sy" data-a="tog">' + profilesContextState.esc(last) + '</div>' + (hologramControlsState.MAIN.open ? '<div class="lg">' + renderExecutionLogs(hologramControlsState.MAIN.log.slice(-18)) + '</div><div class="bt"><button data-a="scripts">SCRIPTS</button><button data-a="stop">STOP</button><button data-a="clr">CLEAR LOG</button></div><input data-t="main" placeholder="message JARVIS + Enter">' : '') + '</div>';
  };
  renderAg();
  refreshUI();
}

export function installAgentPanelHandlers(panelRoot: HTMLElement): () => void {
  const click = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.ar')?.getAttribute('data-id') === 'main') {
      const el = target.closest<HTMLElement>('[data-a]');
      const b = el?.dataset.a;
      if (!b) return;
      if (b === 'scripts') {
        openScriptManager('jarvis');
        return;
      }
      if (b === 'tog') hologramControlsState.MAIN.open = !hologramControlsState.MAIN.open;else if (b === 'stop') cancelTurn();else if (b === 'clr') hologramControlsState.MAIN.log.length = 0;
      renderAg();
      return;
    }
    const el = target.closest<HTMLElement>('[data-a]');
    const b = el?.dataset.a;
    const agentRow = target.closest<HTMLElement>('.ar');
    const a = agentRow ? profilesContextState.AG.get(agentRow.dataset.id) : undefined;
    if (!b || !a) return;
    if (b === 'scripts') {
      openScriptManager(a.name);
      return;
    }
    if (b === 'tog') a.open = !a.open;else if (b === 'stop') agentOrchestratorState.stopA(a);else if (b === 'run') tell(a, 'retry and continue task');else if (b === 'talk') {
      setTalk(a.id);
      if (sceneFoundationState.mode === 'idle') tap();
    } else if (b === 'turns') {
      const v: any = prompt('Maximum turns per run (1–100000)', String(a.maxTurns || profilesContextState.ext.max));
      if (v !== null) a.maxTurns = Math.round(profilesContextState.num(v, 1, 100000, profilesContextState.ext.max));
    } else if (b === 'limit') {
      a.unlimited = !a.unlimited;
      const p: any = profilesContextState.soulProfile(a.name);
      if (p) {
        p.unlimited = a.unlimited;
        saveSouls();
      }
      logA(a, a.unlimited ? 'unlimited steps enabled' : 'step limit enabled');
    } else if (b === 'peer') {
      if (a.peers.has('*')) {
        a.peers.clear();
        logA(a, 'isolated from peers');
      } else grantPeers(a, 'all');
    } else if (b === 'clr') delAll(a.name);else if (b === 'kill') agentOrchestratorState.killA(a);
    renderAg();
  };
  const keydown = (event: KeyboardEvent): void => {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    if (event.key !== 'Enter' || !target?.dataset.t) return;
    if (target.dataset.t === 'main') {
      const v = target.value.trim();
      if (v) {
        target.value = '';
        userText(v, true);
      }
      target.blur();
      return;
    }
    const a = profilesContextState.AG.get(target.dataset.t);
    const v = target.value.trim();
    if (a && v) {
      target.value = '';
      target.blur();
      setTalk(a.id);
      if (sceneFoundationState.mode === 'idle') awaitAgentConversation(a, v);else userText(v);
      renderAg();
    }
  };
  const launch = (): void => {
    const t: any = profilesContextState.$$('#at').value.trim(),
      s: any = profilesContextState.$$('#asoul').value,
      n: any = profilesContextState.$$('#an').value.trim();
    try {
      spawn(n, t, profilesContextState.$$('#am').value.trim(), true, profilesContextState.$$('#ap').value.trim(), {
        ...(s.trim() ? {
          soul: s
        } : {}),
        ...(sceneFoundationState.$('avoice').value ? {
          voice: sceneFoundationState.$('avoice').value
        } : {}),
        ...(sceneFoundationState.$('amuted').checked ? {
          muted: true
        } : {}),
        ...(sceneFoundationState.$('aaesthetics').value.trim() ? {
          aesthetics: JSON.parse(sceneFoundationState.$('aaesthetics').value)
        } : {}),
        ...(profilesContextState.$$('#amaxturns').value ? {
          maxTurns: profilesContextState.$$('#amaxturns').value
        } : {}),
        unlimited: profilesContextState.$$('#aunlimited').checked || !profilesContextState.$$('#amaxturns').value
      });
      profilesContextState.$$('#at').value = '';
      profilesContextState.$$('#an').value = '';
      profilesContextState.$$('#ap').value = '';
      profilesContextState.$$('#asoul').value = '';
      sceneFoundationState.$('avoice').value = '';
      sceneFoundationState.$('amuted').checked = false;
      sceneFoundationState.$('aaesthetics').value = '';
      profilesContextState.$$('#aunlimited').checked = false;
      profilesContextState.$$('#agnew').open = false;
      renderAg();
    } catch (e: any) {
      workspaceUiState.msg(e.message);
    }
  };
  const launchButton = panelRoot.querySelector<HTMLButtonElement>('#ago');
  panelRoot.addEventListener('click', click);
  panelRoot.addEventListener('keydown', keydown);
  launchButton?.addEventListener('click', launch);
  return () => {
    panelRoot.removeEventListener('click', click);
    panelRoot.removeEventListener('keydown', keydown);
    launchButton?.removeEventListener('click', launch);
  };
}
