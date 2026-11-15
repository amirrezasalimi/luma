/** scene-objects: runtime implementation. */
import { profilesContextState } from './profiles-context';
import { attach, scriptLifecycleState } from './script-lifecycle';
import { refreshUI } from './workspace-bridge';

interface Position { x: number; y: number; z: number; x2: number; y2: number; z2: number; size: number }
interface SceneObject {
  id: string; kind: string; by: string; fx: number; a: number; dying: number; r: number; spin: number; p: number;
  n: number; head: boolean; vis: boolean; parent: string; vars: Record<string, unknown>; scripts: Array<{name: string; src: string; by: string}>;
  text: string; from: string; to: string; t: Position; fillA: number; bw: number; fs: number; color: string; border: string; fill: string;
  [key: string]: unknown;
}
interface ObjectPatch { [key: string]: unknown; kind?: string; shape?: string; id?: string; scripts?: Record<string, string>; parent?: string; keep?: boolean | number }

interface ModuleState {
  NUMP: string[];
  OWN: string[];
  KNOWN: Set<string>;
  xv: (object: SceneObject, patch: ObjectPatch) => void;
  rmap: (kind: string, patch: ObjectPatch) => ObjectPatch;
  kids: (object: SceneObject) => SceneObject[];
  RA: (object: SceneObject) => number;
}

export const sceneObjectsState = {} as ModuleState;

export
// target world position of an object (local offsets rotated by parent chain)
function W3(o: SceneObject): [number, number, number] {
  const Q = profilesContextState.O.get(o.parent) as SceneObject | undefined;
  if (!Q) return [o.t.x, o.t.y, o.t.z];
  const p = W3(Q), a = sceneObjectsState.RA(Q), c = Math.cos(a), s = Math.sin(a);
  return [p[0] + o.t.x * c + o.t.z * s, p[1] + o.t.y, p[2] - o.t.x * s + o.t.z * c];
}
export function setPar(o: SceneObject, id: string | SceneObject | null | undefined, keep = false): void {
  id = id ? String(typeof id === 'object' ? id.id : id) : '';
  let Q = profilesContextState.O.get(id) as SceneObject | undefined;
  if (!Q || id === o.id) id = '';else for (let c: SceneObject | undefined = Q; c; c = profilesContextState.O.get(c.parent) as SceneObject | undefined) if (c === o) return;
  if (id === o.parent) return;
  const w: any = keep && profilesContextState.O.get(o.id) === o ? W3(o) : null;
  o.parent = id;
  if (w) {
    const Q2 = profilesContextState.O.get(id) as SceneObject | undefined;
    if (Q2) {
      const p = W3(Q2), a = sceneObjectsState.RA(Q2), c = Math.cos(a), s = Math.sin(a), dx = w[0] - p[0], dz = w[2] - p[2];
      Object.assign(o.t, {
        x: dx * c - dz * s,
        z: dx * s + dz * c,
        y: w[1] - p[1]
      });
    } else Object.assign(o.t, {
      x: w[0],
      y: w[1],
      z: w[2]
    });
  }
}
export function setObj(o: SceneObject, p: ObjectPatch): void {
  const t = o.t;
  for (const k of ['x', 'z', 'x2', 'z2'] as const) if (p[k] != null) t[k] = profilesContextState.num(p[k], -8, 8, t[k]);
  for (const k of ['y', 'y2'] as const) if (p[k] != null) t[k] = profilesContextState.num(p[k], -4, 6, t[k]);
  if (p.size != null) t.size = profilesContextState.num(p.size, .2, 5, t.size);
  if (p.fillA != null) o.fillA = profilesContextState.num(p.fillA, 0, 1, o.fillA);
  if (p.bw != null) o.bw = profilesContextState.num(p.bw, 0, 10, o.bw);
  if (p.fs != null) o.fs = profilesContextState.num(p.fs, 8, 64, o.fs);
  if (p.n != null) o.n = Math.round(profilesContextState.num(p.n, 3, 12, o.n));
  if (p.spin != null) o.spin = profilesContextState.num(p.spin, -3, 3, o.spin);
  if (p.rot != null) o.r = +p.rot || 0;
  if (p.vis != null) o.vis = !!p.vis;
  for (const k of ['color', 'border', 'fill']) if (p[k] != null) o[k] = profilesContextState.col(p[k], o[k]);
  if (p.text != null) o.text = String(p.text).slice(0, 160);
  if (p.from != null) o.from = String(p.from);
  if (p.to != null) o.to = String(p.to);
  if (p.head != null) o.head = !!p.head;
  if (p.vars && typeof p.vars === 'object') Object.assign(o.vars, p.vars);
  if (p.parent !== undefined) setPar(o, p.parent, p.keep !== false && p.keep !== 0);
}
export function addObj(p: ObjectPatch = {}, by = 'user'): SceneObject {
  const kind = profilesContextState.KINDS.includes(p.kind || p.shape) ? p.kind || p.shape : 'cube';
  const n = profilesContextState.O.size;
  let id = p.id ? String(p.id).replace(/\s/g, '_').slice(0, 16) : '';
  if (!id || profilesContextState.O.has(id)) id = 'o' + ++profilesContextState.oid;
  const o = {
    id,
    kind,
    by: by || 'user',
    fx: by && by !== 'user' ? 1 : 0,
    a: 0,
    dying: 0,
    r: Math.random() * 6,
    spin: kind === 'node' ? 0 : .5,
    p: 0,
    n: 5,
    head: true,
    vis: true,
    parent: '',
    vars: {},
    scripts: [],
    text: kind === 'text' ? 'TEXT' : '',
    from: '',
    to: '',
    ...profilesContextState.DEF,
    t: {
      x: (n % 5 - 2) * 2.2,
      y: 1 + (n / 5 | 0) % 2 * 1.3,
      z: 0,
      x2: 1.5,
      y2: 1.8,
      z2: 0,
      size: profilesContextState.DEF.size
    },
    sx: 0,
    sy: 0,
    sr: 20
  };
  if (kind === 'arrow') o.t.x = -1.5;
  if (kind === 'node') o.r = 0;
  setObj(o, {
    ...p,
    keep: 0
  });
  sceneObjectsState.xv(o, p);
  const t = o.t;
  Object.assign(o, {
    x: t.x,
    y: t.y + 1.4,
    z: t.z,
    x2: t.x2,
    y2: t.y2,
    z2: t.z2,
    size: t.size * .4
  });
  profilesContextState.O.set(id, o);
  if (p.scripts && typeof p.scripts === 'object') for (const k in p.scripts) attach(o, k, p.scripts[k], by || 'user');
  refreshUI();
  return o;
}
export function delObj(id: string): boolean {
  const o: any = profilesContextState.O.get(String(id));
  if (!o) return false;
  if (!o.dying) {
    o.dying = 1;
    scriptLifecycleState.unmount(o);
    for (const l of profilesContextState.O.values()) if (l.parent === o.id || l.kind === 'link' && (l.from === o.id || l.to === o.id)) delObj(l.id);
  }
  return true;
}
export function delAll(by?: string): void {
  for (const o of profilesContextState.O.values()) if (!by || o.by === by) delObj(o.id);
}

// ---------------- 12d. Info panels ----------------
export function prepareSceneObjects(): void {
  sceneObjectsState.NUMP = ['x', 'y', 'z', 'x2', 'y2', 'z2', 'size'];
  sceneObjectsState.OWN = ['fillA', 'bw', 'fs', 'n', 'spin', 'color', 'border', 'fill', 'text', 'head', 'from', 'to', 'vis'];
  sceneObjectsState.KNOWN = new Set([...sceneObjectsState.NUMP, ...sceneObjectsState.OWN, 'rot', 'parent', 'vars', 'keep', 'id', 'kind', 'shape', 'scripts', 'op', 'by', 'paint', 'labelColor']);
  sceneObjectsState.xv = (o?: any, p?: any): any => {
    for (const k in p) if (!sceneObjectsState.KNOWN.has(k)) o.vars[k] = p[k];
  };
  sceneObjectsState.rmap = (kind?: any, p?: any): any => {
    if (!p || typeof p !== 'object') return p;
    const q: any = {
        ...p
      },
      body: any = kind === 'arrow' || kind === 'link' ? 'border' : 'fill';
    if ('paint' in q) {
      const v: any = q.paint;
      delete q.paint;
      if (kind === 'text') q.color = v;else q[body] = v;
    }
    if (kind !== 'text' && 'color' in q) {
      if (!(body in q)) q[body] = q.color;
      delete q.color;
    }
    if ('labelColor' in q) {
      q.color = q.labelColor;
      delete q.labelColor;
    }
    return q;
  };
  sceneObjectsState.kids = (o?: any): any => [...profilesContextState.O.values()].filter((c?: any): any => c.parent === o.id && !c.dying);
  sceneObjectsState.RA = (o?: any): any => {
    let a: any = 0;
    for (; o; o = profilesContextState.O.get(o.parent)) if (o.kind === 'node') a += o.r;
    return a;
  };
}
