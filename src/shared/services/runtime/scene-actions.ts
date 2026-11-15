/** scene-actions: runtime implementation. */
import { profilesContextState } from './profiles-context';
import { addObj, delAll, delObj, sceneObjectsState, setObj } from './scene-objects';
import { addPanel, delPanel, updPanel } from './panels-widgets';
import { mainOrchestratorState } from './main-orchestrator';
import { tell } from './agent-orchestrator';
import { scriptLifecycleState } from './script-lifecycle';
import { guiNodesState } from './gui-nodes';

export function act(action: any, by?: string, agent?: any): string {
  const op = String(action.op || '').toLowerCase();
  if (op === 'arrow' || op === 'link') action = { ...action, kind: op };
  if (['add', 'shape', 'arrow', 'link'].includes(op)) {
    if (!profilesContextState.KINDS.includes(action.kind)) return 'err unknown kind';
    if (action.kind === 'link' && (!profilesContextState.O.has(String(action.from)) || !profilesContextState.O.has(String(action.to)))) return 'err link needs existing from/to ids';
    return 'added ' + addObj(sceneObjectsState.rmap(action.kind, action), by).id;
  }
  if (op === 'update' || op === 'set') {
    const object = profilesContextState.O.get(String(action.id));
    if (!object) return 'err no object ' + action.id;
    setObj(object, sceneObjectsState.rmap(object.kind, action));
    if (by && by !== 'user') object.fx = 1;
    return 'updated ' + object.id;
  }
  if (op === 'delete' || op === 'del') return delObj(action.id) ? 'deleted ' + action.id : 'err no object ' + action.id;
  if (op === 'clear') { delAll(by === 'user' ? '' : by); return 'cleared'; }
  if (op === 'panel') return 'panel ' + addPanel(action, by);
  if (op === 'panel_update') return updPanel(String(action.id), action) ? 'panel updated' : 'err no panel';
  if (op === 'panel_delete') return delPanel(String(action.id)) ? 'panel deleted' : 'err no panel';
  if (op === 'tell_peer' || op === 'peer') {
    if (!agent?.peers?.size) return 'err peer communication not authorized by Jarvis';
    const target = mainOrchestratorState.findA(action.to || action.agent || action.id);
    if (!target) return 'err peer not found: ' + (action.to || action.agent);
    if (!agent.peers.has('*') && !agent.peers.has(target.name.toLowerCase()) && !agent.peers.has(target.id)) return 'err not authorized to talk to ' + target.name;
    tell(target, 'PEER MESSAGE from ' + agent.name + ': ' + String(action.text || action.msg || ''));
    agent.beamTo = target.id; agent.beamT = 1.2;
    return 'told peer ' + target.name;
  }
  return 'err unknown op ' + op;
}

export function scene(): any {
  const r: any = [...profilesContextState.O.values()].filter((o?: any): any => !o.dying).slice(0, 40).map((o?: any): any => o.id + ':' + o.kind + (o.text ? ' "' + o.text.slice(0, 24) + '"' : '') + (o.kind === 'link' ? ' ' + o.from + '->' + o.to : ' @' + [o.t.x, o.t.y, o.t.z].map((v?: any): any => +v.toFixed(1)).join(',')) + (o.parent ? ' <' + o.parent : '') + (Object.keys(o.vars).length ? ' vars' + JSON.stringify(o.vars).slice(0, 60) : '') + (o.scripts.length ? ' [' + o.scripts.map((s?: any): any => s.name + (s.err ? ' ERR ' + scriptLifecycleState.errTxt(s.err).slice(0, 100) : '')).join(',') + ']' : '') + ' by ' + o.by);
  const p: any = [...profilesContextState.PN.values()].map((q?: any): any => {
    const l: any = [...guiNodesState.GU.values()].filter((g?: any): any => g.panel === q.id).slice(0, 14);
    return q.id + ' "' + profilesContextState.$$('.pt', q.node).textContent.slice(0, 20) + '" by ' + q.by + ' size:' + q.size + (q.widget ? ' HTML_WIDGET (read/edit with get_panel_widget/update_panel_widget; reuse this panel id)' : '') + (q.corner ? ' @' + q.corner : '') + ': ' + profilesContextState.$$('.pb', q.node).innerText.slice(0, 60) + (l.length ? ' gui[' + l.map((g?: any): any => g.id + ':' + g.type + (g.p.text ? ' "' + String(g.p.text).slice(0, 16) + '"' : '') + (g.err ? ' ERR' : '')).join(',') + ']' : '');
  });
  return (r.join('; ') || 'empty') + (p.length ? ' | PANELS ' + p.join('; ') : '');
}

// ---------------- 12f. Pixel-raster rendering & materials ----------------
export function dumpObject(o?: any): any {
  return o && {
    id: o.id,
    kind: o.kind,
    by: o.by,
    parent: o.parent || undefined,
    x: +o.t.x.toFixed(2),
    y: +o.t.y.toFixed(2),
    z: +o.t.z.toFixed(2),
    size: o.t.size,
    ...(o.kind === 'arrow' ? {
      x2: o.t.x2,
      y2: o.t.y2,
      z2: o.t.z2
    } : {}),
    ...(o.kind === 'link' ? {
      from: o.from,
      to: o.to
    } : {}),
    text: o.text,
    color: o.color,
    border: o.border,
    fill: o.fill,
    fillA: o.fillA,
    bw: o.bw,
    fs: o.fs,
    n: o.n,
    spin: o.spin,
    rot: +o.r.toFixed(2),
    vis: o.vis,
    vars: o.vars,
    scripts: o.scripts.map((s?: any): any => ({
      name: s.name,
      err: s.err ? scriptLifecycleState.errTxt(s.err) : null
    }))
  };
}
