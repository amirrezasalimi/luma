/** gui-nodes: runtime implementation. */
import * as PIXI from 'pixi.js';
import { mkApi } from './script-api';
import { mkErr, scriptLifecycleState } from './script-lifecycle';
import { mainOrchestratorState } from './main-orchestrator';
import { logA, notifyJarvis, tell } from './agent-orchestrator';
import { hologramControlsState } from './hologram-controls';
import { captureUndoAction, finishUndoAction } from './workspace-history';
import { HG } from './gui-handles';
import { clearStageBackgroundSprite, fitStageBackground, sceneFoundationState } from './scene-foundation';
import { profilesContextState } from './profiles-context';
import { backgroundImageFilter } from './frame-renderer';
import { useRuntimeUI, type RuntimeImage } from '../../../stores/runtime-ui';
import { mountRuntimeImage } from '../../components/workspace/RuntimeImage';

interface ModuleState {
  GU: any;
  gid: number;
  GTAG: any;
  GCONT: any;
  GFORM: any;
  GEV: any;
  GTXT: any;
  GD: any;
  GKNOWN: any;
  un: any;
  rmapG: any;
  setGui: any;
  gval: any;
  clearGui: any;
}

export const guiNodesState = {} as ModuleState;

export function applyGui(g?: any, ch?: any): any {
  const e: any = g.el,
    p: any = g.p,
    s: any = e.style,
    t: any = g.type,
    d: any = guiNodesState.GD[t] || {},
    v: any = (k?: any): any => p[k] !== undefined ? p[k] : d[k],
    has: any = (k?: any): any => !ch || ch.includes(k),
    cont: any = guiNodesState.GCONT.includes(t);
  const bw: any = v('bw') || 0,
    sz: any = ['bt', 'br', 'bb', 'bl'].map((k?: any): any => p[k] !== undefined ? p[k] : bw),
    rd: any = v('radius');
  s.boxSizing = 'border-box';
  s.margin = '0';
  s.borderStyle = 'solid';
  s.borderWidth = sz.map((n?: any): any => (+n || 0) + 'px').join(' ');
  s.borderColor = v('border') || 'var(--line)';
  s.borderRadius = Array.isArray(rd) ? rd.map(guiNodesState.un).join(' ') : rd == null ? '0' : guiNodesState.un(rd);
  s.background = v('bg') || 'transparent';
  s.color = v('color') || 'var(--fg)';
  s.fontSize = (v('fs') || 11) + 'px';
  s.fontWeight = p.bold ? 'bold' : 'normal';
  s.opacity = p.opacity ?? 1;
  s.padding = v('pad') != null ? guiNodesState.un(v('pad')) : '0';
  s.display = p.vis === false ? 'none' : cont || t === 'toggle' || t === 'image' || t === 'gallery' ? 'flex' : '';
  if (cont) {
    s.minWidth = '0';
    s.maxWidth = '100%';
    s.flexDirection = t === 'row' || p.dir === 'row' ? 'row' : 'column';
    s.gap = (p.gap ?? 6) + 'px';
    s.flexWrap = p.wrap ? 'wrap' : 'nowrap';
    s.alignItems = p.align || 'stretch';
    s.justifyContent = p.justify || 'flex-start';
  }
  if (v('w') != null) s.width = guiNodesState.un(v('w'));else if (!cont && !guiNodesState.GTXT.includes(t) && t !== 'toggle') s.width = '100%';
  if (v('h') != null) s.height = guiNodesState.un(v('h'));
  if (p.grow != null) s.flexGrow = p.grow;
  if (p.align && !cont) s.alignSelf = p.align;
  if (guiNodesState.GTXT.includes(t) && has('text')) e.textContent = p.text ?? '';
  if (t === 'toggle') {
    if (has('text')) e.lastChild.textContent = p.text ?? '';
    if (has('checked')) e.firstChild.checked = !!p.checked;
  }
  if (t === 'select' && has('options')) e.replaceChildren(...(p.options || []).map((o?: any): any => typeof o === 'object' ? new Option(o.label ?? o.value, o.value) : new Option(o, o)));
  if (guiNodesState.GFORM.includes(t)) {
    if (t === 'slider') for (const k of ['min', 'max', 'step']) if (p[k] != null) e[k] = p[k];
    if (t === 'textarea' && p.rows) e.rows = p.rows;
    if (p.placeholder != null) e.placeholder = p.placeholder;
    if (has('value') || has('options')) e.value = p.value ?? (t === 'select' ? e.value : '');
  }
  if (t === 'progress') {
    const lo: any = p.min ?? 0,
      hi: any = p.max ?? 1,
      b: any = e.firstChild;
    b.style.width = Math.max(0, Math.min(100, ((p.value ?? 0) - lo) / (hi - lo || 1) * 100)) + '%';
    b.style.background = p.bar || '#2fe38a';
  }
  if (t === 'image' || t === 'gallery') {
    s.minWidth = '0';
    s.maxWidth = '100%';
    s.flexShrink = '1';
    s.height = p.h == null ? 'auto' : guiNodesState.un(p.h);
    syncGuiImage(g, ch);
  }
  e.disabled = !!p.disabled;
  if (p.tip != null) e.title = p.tip;
}
export function mkAct(g?: any, v?: any): any {
  if (v == null || v === false) return null;
  if (typeof v === 'function') return v;
  if (typeof v === 'string') {
    return (e?: any, h?: any): any => {
      const f: any = new Function('J', 'self', 'e', 'with(J){' + v + '\n}\n//# sourceURL=jv_gui' + g.id.replace(/\W/g, ''));
      return f(mkApi({ by: g.by, tm: g.tm }), h, e);
    };
  }
  throw new TypeError('gui action must be a function or a source string');
}
export function setGuiProps(g?: any, p?: any): any {
  p = guiNodesState.rmapG(g.type, p);
  const ch: any = [];
  for (const k in p) {
    const v: any = p[k];
    if (guiNodesState.GEV.includes(k)) {
      g.actions = g.actions || {};
      g.actions[k] = typeof v === 'function' ? {
        source: v.toString(),
        function: true
      } : {
        source: v,
        function: false
      };
      g.fn[k] = mkAct(g, v);
      continue;
    }
    if (['panel', 'parent', 'id', 'type', 'kind', 'by', 'children'].includes(k)) continue;
    if (guiNodesState.GKNOWN.has(k)) {
      g.p[k] = v;
      ch.push(k);
    } else g.vars[k] = v;
  }
  return ch;
}
export function gfail(g?: any, ev?: any, e?: any): any {
  const er: any = mkErr(ev, e, null),
    msg: any = 'gui "' + g.id + '" action ' + ev + ' ' + scriptLifecycleState.errTxt(er);
  console.warn('[JARVIS]', msg);
  g.err = msg;
  g.el.style.outline = '2px solid #ff3b56';
  g.el.title = msg;
  const a: any = mainOrchestratorState.findA(g.by);
  if (a) {
    a.errq.push(msg);
    logA(a, '✖ ' + msg, true);
    if (a.status !== 'running' && (a.fix = (a.fix || 0) + 1) <= 3) tell(a, 'GUI ERROR: ' + msg + '. Fix it with getGui(id).set({' + ev + ':...}).');
  } else if (g.by === 'jarvis') notifyJarvis({
    name: g.id,
    id: g.id,
    task: 'gui action'
  }, 'FAILED', msg);
}
export function fireG(g?: any, k?: any, ev?: any): any {
  const f: any = g.fn[k];
  if (!f || g.p.disabled) return;
  const action: any = hologramControlsState.undoReady ? captureUndoAction('GUI ' + g.id + ' ' + k) : null;
  const t: any = g.type,
    v: any = guiNodesState.gval(g);
  if (guiNodesState.GFORM.includes(t) || t === 'toggle') g.p[t === 'toggle' ? 'checked' : 'value'] = v;
  const E: any = {
    id: g.id,
    value: v,
    checked: t === 'toggle' ? v : undefined,
    target: HG(g, g.by),
    native: ev
  };
  try {
    const r: any = f(E, E.target);
    if (r && typeof r.then === 'function') {
      Promise.resolve(r).then((): any => {
        if (g.err) {
          g.err = null;
          g.el.style.outline = '';
          g.el.title = g.p.tip || '';
        }
      }, (er?: any): any => gfail(g, k, er)).finally((): any => {
        if (action) finishUndoAction(action);
      });
    } else if (action) finishUndoAction(action);
    if (g.err) {
      g.err = null;
      g.el.style.outline = '';
      g.el.title = g.p.tip || '';
    }
  } catch (er: any) {
    gfail(g, k, er);
    if (action) finishUndoAction(action);
  }
}
// Image sources are validated before ever reaching an img element; data SVG is deliberately excluded.
export function guiImageURL(src?: any): any {
  if (typeof src !== 'string' || !src.trim()) return '';
  src = src.trim();
  if (/[\u0000-\u001f\u007f]/.test(src)) return '';
  if (/^data:/i.test(src)) return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);base64,[a-z0-9+/=\s]+$/i.test(src) ? src : '';
  try {
    const u: any = new URL(src, location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('//') && u.origin === location.origin) return u.href;
  } catch (e: any) {}
  return '';
}
export async function setStageBackground(src?: any, options: any = {}): Promise<any> {
  const epoch: any = ++sceneFoundationState.stageBackground.epoch;
  if (!src) {
    clearStageBackgroundSprite();
    sceneFoundationState.stageBackground.config = {};
    sceneFoundationState.stageBackground.image = null;
    sceneFoundationState.stageBackground.colors = [];
    return {
      removed: true
    };
  }
  const url: any = guiImageURL(src);
  if (!url) throw new Error('Invalid background image URL');
  const config: any = {
      src: url,
      x: profilesContextState.num(options.x, -40, 40, 0),
      y: profilesContextState.num(options.y, .1, 30, 4),
      z: profilesContextState.num(options.z, -40, 40, -7),
      width: profilesContextState.num(options.width, 1, 80, 18),
      height: profilesContextState.num(options.height, 1, 50, 10),
      opacity: profilesContextState.num(options.opacity, 0, 1, 1),
      light: profilesContextState.num(options.light, 0, 2, .5)
    },
    workspace: any = hologramControlsState.workspaceEpoch,
    image: any = new Image();
  image.crossOrigin = 'anonymous';
  // Persist the requested background independently of its downloaded/rendered image.
  // Restoration is asynchronous; autosave must not replace it with an empty config.
  sceneFoundationState.stageBackground.config = config;
  await new Promise((resolve?: any, reject?: any): any => {
    const timer: any = setTimeout((): any => {
      image.src = '';
      reject(new Error('Background image load timed out'));
    }, 15000);
    image.onload = (): any => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = (): any => {
      clearTimeout(timer);
      reject(new Error('Background image failed to load; check URL and CORS permissions'));
    };
    image.src = url;
  });
  const canvas: any = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 1;
  const ctx: any = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, 8, 1);
  const pixels: any = ctx.getImageData(0, 0, 8, 1).data,
    colors: any = Array.from({
      length: 8
    }, (_?: any, i?: any): any => [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);
  if (epoch !== sceneFoundationState.stageBackground.epoch || workspace !== hologramControlsState.workspaceEpoch) return {
    cancelled: true
  };
  const texture: any = new PIXI.Texture(new PIXI.BaseTexture(image, {
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      mipmap: PIXI.MIPMAP_MODES.ON
    })),
    sprite: any = new PIXI.Sprite(texture);
  sprite.anchor.set(.5);
   // Shader filters are WebGL-only; Canvas still displays the source image.
   if (sceneFoundationState.app.renderer.type === PIXI.RENDERER_TYPE.WEBGL) {
     sprite.filters = [backgroundImageFilter()];
   }
  sprite.filterArea = sceneFoundationState.app.screen;
  clearStageBackgroundSprite();
  Object.assign(sceneFoundationState.stageBackground, {
    config,
    image,
    colors,
    sprite
  });
  sceneFoundationState.app.stage.addChildAt(sprite, 0);
  fitStageBackground();
  return {
    ...config
  };
}
export function guiImageItems(g?: any): any {
  const p: any = g.p,
    raw: any = p.images != null ? p.images : p.src;
  return (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map((v?: any): any => typeof v === 'string' ? {
    src: v
  } : v && typeof v === 'object' ? v : {
    src: ''
  });
}
export function stepGuiImage(g?: any, delta?: any): any {
  if (g.p.disabled) return;
  const n: any = guiImageItems(g).length;
  if (n < 2) return;
  g.p.index = (g.p.index + delta + n) % n;
  syncGuiImage(g, ['index']);
}
export function closeGuiImage(g?: any): any {
  const image = useRuntimeUI.getState().images[g.id];
  if (image?.open) useRuntimeUI.setState(state => ({ images: { ...state.images, [g.id]: { ...image, open: false } } }));
}
export function openGuiImage(g?: any): any {
  const image = useRuntimeUI.getState().images[g.id];
  if (!image || image.disabled || image.open || !image.url) return;
  useRuntimeUI.setState(state => ({ images: { ...state.images, [g.id]: { ...image, open: true } } }));
}
export function mkGuiImage(g?: any, e?: any): any {
  e.className = 'gimage';
  const unmount = mountRuntimeImage(e, g.id, { step: delta => stepGuiImage(g, delta), open: () => openGuiImage(g), close: () => closeGuiImage(g) });
  g.tm.add({ c: unmount });
}
export function syncGuiImage(g?: any, ch?: any): any {
  if (ch && ch.includes('src') && !ch.includes('images')) g.p.images = undefined;
  const n: any = guiImageItems(g).length,
    i: any = Number(g.p.index);
  g.p.index = n ? Math.max(0, Math.min(n - 1, Number.isFinite(i) ? Math.trunc(i) : 0)) : 0;
  const item = guiImageItems(g)[g.p.index] || {};
  const image: RuntimeImage = {
    url: guiImageURL(item.src), alt: String(item.alt ?? g.p.alt ?? ''), caption: String(item.caption ?? g.p.caption ?? ''),
    index: g.p.index, count: n, disabled: !!g.p.disabled,
    open: !g.p.disabled && g.p.vis !== false && !!useRuntimeUI.getState().images[g.id]?.open,
    fit: ['contain', 'cover', 'fill', 'none', 'scale-down'].includes(g.p.fit) ? g.p.fit : 'contain',
    height: g.p.h === 'auto' ? 'auto' : g.p.h != null ? 'fixed' : 'default',
  };
  g.el.setAttribute('aria-disabled', String(image.disabled));
  useRuntimeUI.setState(state => ({ images: { ...state.images, [g.id]: image } }));
}
export function mkGuiEl(g?: any): any {
  const t: any = g.type,
    e: any = document.createElement(guiNodesState.GTAG[t]);
  if (t === 'slider') e.type = 'range';
  if (t === 'input') e.type = g.p.inputType || 'text';
  if (t === 'toggle') {
    e.innerHTML = '<input type="checkbox"><span></span>';
    e.style.alignItems = 'center';
    e.style.gap = '6px';
    e.style.cursor = 'pointer';
  }
  if (t === 'progress') {
    e.innerHTML = '<div class="gbar"></div>';
    e.style.overflow = 'hidden';
  }
  if (t === 'image' || t === 'gallery') mkGuiImage(g, e);
  const tg: any = t === 'toggle' ? e.firstChild : e;
  tg.addEventListener('click', (ev?: any): any => fireG(g, 'onClick', ev));
  tg.addEventListener('input', (ev?: any): any => fireG(g, 'onInput', ev));
  tg.addEventListener('change', (ev?: any): any => fireG(g, 'onChange', ev));
  e.addEventListener('mouseenter', (ev?: any): any => fireG(g, 'onEnter', ev));
  e.addEventListener('mouseleave', (ev?: any): any => fireG(g, 'onLeave', ev));
  return e;
}
export function addGui(p?: any, by?: any): any {
  p = p || {};
  const type: any = guiNodesState.GTAG[p.type || p.kind] ? p.type || p.kind : 'label';
  const par: any = p.parent ? guiNodesState.GU.get(String(p.parent)) : null;
  if (p.parent && (!par || !guiNodesState.GCONT.includes(par.type))) throw new Error('gui parent "' + p.parent + '" must be an existing box/row/col gui node');
  const pid: any = par ? par.panel : String(p.panel || ''),
    q: any = profilesContextState.PN.get(pid);
  if (!q) throw new Error('gui needs an existing panel (panel:"id"), got "' + pid + '"');
  let id: any = p.id ? String(p.id).replace(/\s/g, '_').slice(0, 24) : '';
  if (!id || guiNodesState.GU.has(id)) id = 'g' + ++guiNodesState.gid;
  const g: any = {
      id,
      type,
      panel: pid,
      parent: par ? par.id : '',
      by: by || 'user',
      p: {},
      fn: {},
      vars: {},
      tm: new Set(),
      err: null
    },
    {
      children,
      ...rest
    }: any = p;
  guiNodesState.GU.set(id, g);
  try {
    setGuiProps(g, rest);
    g.el = mkGuiEl(g);
    applyGui(g, null);
  } catch (e: any) {
    g.tm.forEach((task: any) => task.c?.());
    guiNodesState.GU.delete(id);
    throw e;
  }
  (par ? par.el : profilesContextState.$$('.gui', q.node)).append(g.el);
  if (Array.isArray(children)) for (const c of children) addGui({
    ...c,
    parent: id
  }, by);
  return g;
}
export function delGui(id?: any): any {
  const g: any = guiNodesState.GU.get(String(id));
  if (!g) return false;
  for (const c of [...guiNodesState.GU.values()]) if (c.parent === g.id) delGui(c.id);
  g.tm.forEach((t?: any): any => t.c && t.c());
  g.el.remove();
  guiNodesState.GU.delete(g.id);
  return true;
}
export function prepareGuiNodes(): void {
  guiNodesState.GU = new Map();
  guiNodesState.gid = 0;
  guiNodesState.GTAG = {
    button: 'button',
    label: 'div',
    text: 'div',
    box: 'div',
    row: 'div',
    col: 'div',
    input: 'input',
    textarea: 'textarea',
    slider: 'input',
    toggle: 'label',
    select: 'select',
    progress: 'div',
    image: 'figure',
    gallery: 'figure'
  };
  guiNodesState.GCONT = ['box', 'row', 'col'];
  guiNodesState.GFORM = ['input', 'textarea', 'slider', 'select'];
  guiNodesState.GEV = ['onClick', 'onChange', 'onInput', 'onEnter', 'onLeave'];
  guiNodesState.GTXT = ['label', 'text', 'button'];
  guiNodesState.GD = {
    button: {
      bg: '#e8541c',
      color: '#ffffff',
      border: '#fff1a0',
      bw: 2,
      pad: '5px 10px'
    },
    input: {
      border: '#4a4590',
      bw: 1,
      pad: '4px 6px'
    },
    textarea: {
      border: '#4a4590',
      bw: 1,
      pad: '4px 6px'
    },
    select: {
      border: '#4a4590',
      bw: 1,
      pad: '4px 6px'
    },
    progress: {
      border: '#4a4590',
      bw: 1,
      h: 12
    }
  };
  guiNodesState.GKNOWN = new Set(['text', 'value', 'placeholder', 'options', 'min', 'max', 'step', 'checked', 'disabled', 'tip', 'inputType', 'rows', 'bar', 'w', 'h', 'pad', 'gap', 'grow', 'align', 'justify', 'dir', 'wrap', 'bg', 'color', 'border', 'radius', 'bw', 'bt', 'bb', 'bl', 'br', 'fs', 'bold', 'opacity', 'vis', 'src', 'images', 'index', 'fit', 'alt', 'caption']);
  guiNodesState.un = (n?: any): any => typeof n === 'number' ? n + 'px' : n;
  guiNodesState.rmapG = (t?: any, p?: any): any => {
    const q: any = {
        ...p
      },
      tx: any = t === 'label' || t === 'text';
    if ('paint' in q) {
      const v: any = q.paint;
      delete q.paint;
      q[tx ? 'color' : 'bg'] = v;
    }
    if (!tx && 'color' in q) {
      if (!('bg' in q)) q.bg = q.color;
      delete q.color;
    }
    if ('textColor' in q) {
      q.color = q.textColor;
      delete q.textColor;
    }
    return q;
  };
  guiNodesState.setGui = (g?: any, p?: any): any => applyGui(g, setGuiProps(g, p || {}));
  guiNodesState.gval = (g?: any): any => g.type === 'toggle' ? g.el.firstChild.checked : g.type === 'slider' ? +g.el.value : guiNodesState.GFORM.includes(g.type) ? g.el.value : g.p.value;
  guiNodesState.clearGui = (by?: any): any => {
    for (const g of [...guiNodesState.GU.values()]) if (!g.parent && (by === 'user' || g.by === by)) delGui(g.id);
  };
}
