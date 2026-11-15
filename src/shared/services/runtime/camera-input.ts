/** camera-input: runtime implementation. */
import { sceneFoundationState } from './scene-foundation';
import { proj, rasterPrimitivesState } from './raster-primitives';
import { voicePipelineState } from './voice-pipeline';
import { tapCore } from './microphone';

interface ModuleState {
  ptr: any;
  moved: number;
  pd: number;
  V: any;
  up: any;
}

export const cameraInputState = {} as ModuleState;

export function bindCameraInput(): void {
  cameraInputState.ptr = new Map();
  cameraInputState.moved = 0;
  cameraInputState.pd = 0;
  cameraInputState.V = sceneFoundationState.app.view;
  cameraInputState.V.addEventListener('contextmenu', (e?: any): any => e.preventDefault());
  cameraInputState.V.addEventListener('pointerdown', (e?: any): any => {
    cameraInputState.V.setPointerCapture(e.pointerId);
    cameraInputState.ptr.set(e.pointerId, e);
    cameraInputState.moved = 0;
    cameraInputState.V.style.cursor = 'grabbing';
    if (cameraInputState.ptr.size == 2) {
      const [a, b]: any = [...cameraInputState.ptr.values()];
      cameraInputState.pd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
  });
  cameraInputState.V.addEventListener('pointermove', (e?: any): any => {
    const o: any = cameraInputState.ptr.get(e.pointerId);
    if (!o) return;
    if (cameraInputState.ptr.size == 2) {
      cameraInputState.ptr.set(e.pointerId, e);
      const [a, b]: any = [...cameraInputState.ptr.values()],
        d: any = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      sceneFoundationState.cam.zoom = Math.min(3, Math.max(.4, sceneFoundationState.cam.zoom * d / cameraInputState.pd));
      cameraInputState.pd = d;
      return;
    }
    const dx: any = e.clientX - o.clientX,
      dy: any = e.clientY - o.clientY;
    cameraInputState.moved += Math.abs(dx) + Math.abs(dy);
    cameraInputState.ptr.set(e.pointerId, e);
    if (e.buttons & 2 || e.shiftKey) {
      sceneFoundationState.cam.px += dx;
      sceneFoundationState.cam.py += dy;
    } else if (!sceneFoundationState.dragLock) sceneFoundationState.cam.yaw -= dx * .008;
  });
  cameraInputState.up = (e?: any): any => {
    if (e.type === 'pointerup' && cameraInputState.ptr.has(e.pointerId) && cameraInputState.ptr.size === 1 && cameraInputState.moved < 6 && selectAgentAtPointer(e)) {
      cameraInputState.ptr.delete(e.pointerId);
      cameraInputState.V.style.cursor = 'grab';
      return;
    }
    if (cameraInputState.ptr.has(e.pointerId) && cameraInputState.ptr.size == 1 && cameraInputState.moved < 6) {
      const r: any = cameraInputState.V.getBoundingClientRect(),
        k: any = cameraInputState.V.width / r.width,
        mx: any = (e.clientX - r.left) * k / sceneFoundationState.S,
        my: any = (e.clientY - r.top) * k / sceneFoundationState.S;
      const c: any = proj(sceneFoundationState.HX, sceneFoundationState.HY, sceneFoundationState.HQ);
      {
        const px_: any = (e.clientX - r.left) * k,
          py_: any = (e.clientY - r.top) * k,
          b: any = voicePipelineState.btns.find((b?: any): any => px_ >= b.x0 && px_ <= b.x1 && py_ >= b.y0 && py_ <= b.y1);
        if (b) b.fn();else if (Math.hypot(mx - c[0], my - c[1]) < rasterPrimitivesState.scl() * 1.6 * sceneFoundationState.HSC) tapCore();
      }
    }
    cameraInputState.ptr.delete(e.pointerId);
    cameraInputState.V.style.cursor = 'grab';
  };
  cameraInputState.V.addEventListener('pointerup', cameraInputState.up);
  cameraInputState.V.addEventListener('pointercancel', cameraInputState.up);
  cameraInputState.V.addEventListener('wheel', (e?: any): any => {
    e.preventDefault();
    sceneFoundationState.cam.zoom = Math.min(3, Math.max(.4, sceneFoundationState.cam.zoom * Math.exp(-e.deltaY * .0012)));
  }, {
    passive: false
  });
  cameraInputState.V.addEventListener('dblclick', (): any => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

  // ============================================================================
  // 7. PROJECTION & PIXEL PRIMITIVES
  // ============================================================================
}
import { selectAgentAtPointer } from './agent-conversations';
