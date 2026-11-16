/** workspace-input: runtime implementation. */
import { cameraInputState } from './camera-input';
import { profilesContextState } from './profiles-context';
import { refreshUI, renderAg, renderInsp, workspaceUiState } from './workspace-bridge';
import { setTalk } from './agent-conversations';
import { sceneFoundationState } from './scene-foundation';
import { tap } from './microphone';
import { addObj, delObj } from './scene-objects';

export function bindWorkspaceInput(): void {
  // ---------------- 16b. Pointer selection (objects + mini-holos) & keyboard ----------------
  cameraInputState.V.addEventListener('pointerup', (e?: any): any => {
    if (cameraInputState.moved >= 6 || e.lumaAgentSelected) return;
    const r: any = cameraInputState.V.getBoundingClientRect(),
      k: any = cameraInputState.V.width / r.width,
      x: any = (e.clientX - r.left) * k,
      y: any = (e.clientY - r.top) * k;
    for (const a of profilesContextState.AG.values()) {
      if (Math.hypot(x - a.sx, y - a.sy) < a.sr) {
        a.open = true;
        workspaceUiState.agp.classList.remove('c');
        renderAg();
        setTalk(a.id);
        if (sceneFoundationState.mode === 'idle') tap();
        return;
      }
    }
    let best: any = null,
      bd: any = 1e9;
    for (const o of profilesContextState.O.values()) {
      if (o.dying || o.vis === false) continue;
      const dd: any = Math.hypot(x - o.sx, y - o.sy);
      if (dd < o.sr && dd < bd) {
        best = o;
        bd = dd;
      }
    }
    if (best) {
      if (profilesContextState.linkFrom && profilesContextState.linkFrom !== best.id) {
        addObj({
          kind: 'link',
          from: profilesContextState.linkFrom,
          to: best.id
        }, 'user');
        workspaceUiState.msg('Linked ' + profilesContextState.linkFrom + ' → ' + best.id);
        profilesContextState.linkFrom = null;
      } else {
        profilesContextState.sel = best.id;
        renderInsp();
        refreshUI();
      }
    } else if (profilesContextState.sel) {
      profilesContextState.sel = null;
      renderInsp();
      refreshUI();
    }
  });
  addEventListener('keydown', (e?: any): any => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && profilesContextState.sel) {
      delObj(profilesContextState.sel);
      profilesContextState.sel = null;
      renderInsp();
      refreshUI();
    }
  });
  // ---------------- IndexedDB session snapshots (global settings/souls stay separate) ----------------
}
