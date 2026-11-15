import { act } from './scene-actions';
import { grantPeers, spawn } from './agent-orchestrator';
import { profilesContextState } from './profiles-context';
import { HD, anim, attach, detach, twn } from './script-lifecycle';
import { execCode } from './script-execution';
import { holoH, resetHologramSetting } from './hologram-controls';
import { addSkills, addMcps } from './integrations';

export function exposeScriptApi(): void {
  window.JARVIS = {
    act,
    spawn,
    O: profilesContextState.O,
    AG: profilesContextState.AG,
    PN: profilesContextState.PN,
    grantPeers,
    attach,
    detach,
    twn,
    anim,
    exec: execCode,
    node: (id?: any): any => profilesContextState.O.get(id) && HD(profilesContextState.O.get(id), 'user'),
    hologram: (t?: any): any => holoH(t, {
      ag: null
    }, 'user'),
    reset_hologram_setting: (t?: any): any => resetHologramSetting(t, {
      ag: null
    }, 'user'),
    addSkills: (q?: any): any => addSkills(Array.isArray(q) ? q : Array.isArray(q && q.skills) ? q.skills : [q]),
    addMcps
  };
}
