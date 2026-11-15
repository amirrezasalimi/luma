import { MAIN_SYSTEM_PROMPT } from '../../prompts/main';
import { SCENE_API_PROMPT } from '../../prompts/scene-api';
/** main-orchestrator: runtime implementation. */
import { agentOrchestratorState, grantPeers, logA, notifyJarvis, spawn, tell } from './agent-orchestrator';
import { getAgentProfile, profilesContextState, soulContext } from './profiles-context';
import { hologramControlsState, logM } from './hologram-controls';
import { captureUndoAction, finishUndoAction, workspaceHistoryState } from './workspace-history';
import { rq } from './workspace-bridge';
import { addObj, delAll, delObj } from './scene-objects';
import { voicePipelineState } from './voice-pipeline';
import { scene } from './scene-actions';
import { integrationsState } from './integrations';
import { execCode } from './script-execution';
import { scriptLifecycleState } from './script-lifecycle';

interface ModuleState {
  strip: any;
  findA: any;
  stateTxt: any;
  _f: any;
  _sp: any;
  _la: any;
}

export const mainOrchestratorState = {} as ModuleState;

export function directives(t?: any): any {
  const action: any = hologramControlsState.undoReady ? captureUndoAction('main directives') : null;
  if (action) queueMicrotask((): any => finishUndoAction(action));
  for (const m of String(t).matchAll(/\[\[\s*(\w+)\s*([^\]]*)\]\]/g)) {
    const c: any = m[1].toLowerCase(),
      a: any = m[2].split('|').map((s?: any): any => s.trim()),
      x: any = mainOrchestratorState.findA(a[0]);
    logM('⚙ ' + c + ' ' + a.join(' | '));
    if (c === 'agent') spawn(a[0], a[1] || '', a[2], false, a[3]);else if (c === 'share') {
      if (a[0]?.toLowerCase() === 'all') for (const ag of profilesContextState.AG.values()) grantPeers(ag, 'all');else if (x) grantPeers(x, a.slice(1).join(',') || 'all');
    } else if (c === 'unshare' && x) {
      x.peers.clear();
      logA(x, 'peer access revoked');
    } else if (c === 'tell' && x) tell(x, a[1] || '');else if (c === 'stop') {
      a[0] === 'all' ? profilesContextState.AG.forEach(agentOrchestratorState.stopA) : x && agentOrchestratorState.stopA(x);
    } else if (c === 'undo') workspaceHistoryState.undoWorkspace().catch((e?: any): any => logM(e.message, true));else if (c === 'redo') workspaceHistoryState.redoWorkspace().catch((e?: any): any => logM(e.message, true));else if (c === 'idle' && x) {
      agentOrchestratorState.stopA(x);
      x.status = 'idle';
      rq();
    } else if (c === 'resume' && x) tell(x, 'resume');else if (c === 'kill') {
      a[0] === 'all' ? [...profilesContextState.AG.values()].forEach(agentOrchestratorState.killA) : x && agentOrchestratorState.killA(x);
    } else if (c === 'clear') delAll();else if (c === 'del') delObj(a[0]);else if (c === 'add') addObj({
      kind: a[0],
      text: a[1],
      border: a[2],
      fill: a[2]
    }, 'jarvis');
  }
}
export function connectMainOrchestrator(): void {
  mainOrchestratorState.strip = (t?: any): any => String(t).replace(/```[\s\S]*?```/g, '').replace(/```[\s\S]*$/, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/ {2,}/g, ' ');
  mainOrchestratorState.findA = (n?: any): any => {
    n = String(n || '').trim().toLowerCase();
    return [...profilesContextState.AG.values()].find((x?: any): any => x.id === n || x.name.toLowerCase() === n);
  };
  mainOrchestratorState.stateTxt = (): any => 'Main profile: ' + JSON.stringify(getAgentProfile(null)) + '\nSaved soul profiles (can spawn idle by name with spawn_agent(name,"",{idle:true})): ' + (Object.values<any>(profilesContextState.souls.agents).map((p?: any): any => p.name + (p.unlimited ? ' [unlimited]' : '')).join(', ') || 'none') + '\nAgents: ' + ([...profilesContextState.AG.values()].map((a?: any): any => `${a.name}(id:${a.id}, color:${a.pal.name}, voice:${voicePipelineState.profileVoice(a) || 'default'}, muted:${!!a.muted}, status:${a.status}, steps:${a.step}/${a.unlimited ? 'unlimited' : profilesContextState.agentLimit(a)}, model:${a.model}, peers:[${[...a.peers].join(',')}], task:"${a.task.slice(0, 60)}"` + (a.lastErr ? `, LAST_ERROR:"${a.lastErr}"` : '') + `, last_log:"${a.log.length ? a.log[a.log.length - 1].text.slice(0, 80) : '-'}")`).join('; ') || 'none') + '\nScene: ' + scene() + '\nWorld: ' + hologramControlsState.worldTxt();
  mainOrchestratorState._f = window.fetch.bind(window);
  const augmentedFetch = (u?: any, i: any = {}): any => {
    try {
      if (/\/chat\/completions$/.test(String(u)) && i.body) {
        const b: any = JSON.parse(i.body);
        if (b.stream && b.messages[0] && b.messages[0].role === 'system') {
          b.messages[0].content += soulContext(null) + '\n\n' + MAIN_SYSTEM_PROMPT + integrationsState.extraCtx() + '\nLIVE STATE:\n' + mainOrchestratorState.stateTxt();
          hologramControlsState.MAIN.debugRequest = {
            at: Date.now(),
            model: b.model,
            messages: b.messages,
            estimatedTokens: profilesContextState.estimateTokens(b.messages)
          };
          i = {
            ...i,
            body: JSON.stringify(b)
          };
        }
      }
    } catch (e: any) {}
    return mainOrchestratorState._f(u, i);
  };
  window.fetch = Object.assign(augmentedFetch, { preconnect: window.fetch.preconnect });
  mainOrchestratorState._sp = window.speak;
  mainOrchestratorState._la = window.logAdd;
  window.speak = (t?: any, s?: any, v?: any, a: any = null): any => {
    const c: any = mainOrchestratorState.strip(t);
    return c.trim() ? mainOrchestratorState._sp(c, s, v, a) : Promise.resolve();
  };
  window.logAdd = (r?: any, t?: any): any => {
    {
      const tx: any = r === 'user' ? String(t).startsWith('[SUB-AGENT EVENT REPORT]') ? '⚡ ' + String(t).split('\n')[1] : 'YOU: ' + t : 'SAY: ' + mainOrchestratorState.strip(t).trim();
      if (tx.trim() && tx !== 'SAY:') logM(tx);
    }
    if (r === 'ai') {
      try {
        directives(String(t).replace(/```[\s\S]*?(```|$)/g, ''));
      } catch (e: any) {
        console.error(e);
      }
      for (const m of String(t).matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)) {
        if (!/^(?:js|javascript)?[ \t]*$/.test(m[1])) continue;
        const epoch: any = hologramControlsState.workspaceEpoch;
        execCode('jarvis', null, m[2]).then((x?: any): any => {
          if (epoch !== hologramControlsState.workspaceEpoch) return;
          if (x.er) notifyJarvis({
            name: 'jarvis-js',
            id: 'js',
            task: 'code'
          }, 'FAILED', scriptLifecycleState.errTxt(x.er));
        });
      }
    }
    if (r === 'user' && String(t).startsWith('[SUB-AGENT EVENT REPORT]')) return mainOrchestratorState._la('user', '⚡ ' + String(t).split('\n')[1]);
    return mainOrchestratorState._la(r, r === 'ai' ? mainOrchestratorState.strip(t).trim() : t);
  };

  // ============================================================================
  // 16. UI: SUB-AGENTS (top-left, Jarvis row first) & BUILD TOOLS + SCRIPT EDITOR (bottom-left)
  // ============================================================================
}
