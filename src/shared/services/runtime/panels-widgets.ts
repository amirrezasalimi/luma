/** panels-widgets: runtime implementation. */
import { profilesContextState } from './profiles-context';
import { dragPanel } from './agent-conversations';
import { addGui, delGui, guiNodesState } from './gui-nodes';
import { sessionPlain, sessionsState } from './sessions';
import { sceneFoundationState } from './scene-foundation';
import { proj } from './raster-primitives';
import { hologramControlsState } from './hologram-controls';
import { mkApi, scriptApiState } from './script-api';
import { dumpObject } from './scene-actions';
import { setObj } from './scene-objects';

interface ModuleState {
  pl: any;
  pr: any;
  CORN: any;
  PANEL_PRESETS: any;
  ECSS: any;
  panelSizes: any;
  WIDGET_UI: any;
  WIDGET_CSS: any;
  widgetInspections: any;
  widgetInspectionId: number;
  WIDGET_COMPONENTS: any;
}

export const panelsWidgetsState = {} as ModuleState;

export function panelDimensions(size: any = '2x2'): any {
  const span: any = panelsWidgetsState.PANEL_PRESETS[size];
  if (!span) throw new Error('Panel size must be 2x2, 3x3, 2x3 or 2x4 (columns x rows)');
  const unit: any = Math.max(32, Math.min(108, (innerWidth - 40) / 3, (innerHeight - 52) / 4));
  return {
    width: span[0] * unit + (span[0] - 1) * 12,
    height: span[1] * unit + (span[1] - 1) * 12
  };
}
export function sizePanel(q?: any, size?: any): any {
  const d: any = panelDimensions(size);
  q.size = size;
  q.node.style.width = d.width + 'px';
  q.node.style.height = d.height + 'px';
  return d;
}
export function resizablePanel(q?: any): any {
  const handle: any = document.createElement('button');
  handle.type = 'button';
  handle.textContent = '◢';
  handle.title = 'Drag to resize; arrow keys change size';
  handle.setAttribute('aria-label', 'Resize panel');
  handle.style.cssText = 'position:absolute;bottom:0;right:0;z-index:2;cursor:nwse-resize;touch-action:none;padding:2px 5px';
  q.node.append(handle);
  handle.onpointerdown = (e?: any): any => {
    e.preventDefault();
    e.stopPropagation();
    stopPanelMove(q);
    const r: any = q.node.getBoundingClientRect();
    q.corner = null;
    q.node.classList.add('fl');
    if (q.node.parentElement !== document.body) document.body.append(q.node);
    fitPanel(q.node, r.left, r.top);
    handle.setPointerCapture(e.pointerId);
    const move: any = (event?: any): any => {
        const width: any = r.width + event.clientX - e.clientX,
          height: any = r.height + event.clientY - e.clientY,
          best: any = Object.keys(panelsWidgetsState.PANEL_PRESETS).sort((a?: any, b?: any): any => {
            const x: any = panelDimensions(a),
              y: any = panelDimensions(b);
            return Math.hypot(x.width - width, x.height - height) - Math.hypot(y.width - width, y.height - height);
          })[0];
        sizePanel(q, best);
        fitPanel(q.node, r.left, r.top);
      },
      end: any = (): any => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
      };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  handle.onkeydown = (e?: any): any => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const sizes: any = ['2x2', '2x3', '3x3', '2x4'],
      i: any = sizes.indexOf(q.size);
    sizePanel(q, sizes[Math.max(0, Math.min(3, i + (['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : 1)))]);
    fitPanel(q.node, q.node.offsetLeft, q.node.offsetTop);
  };
}
export function addPanel(p?: any, by?: any): any {
  let id: any = p.id ? String(p.id).replace(/\s/g, '_').slice(0, 16) : '';
  if (id && profilesContextState.PN.has(id)) {
    updPanel(id, p);
    return id;
  }
  if (!id) id = 'p' + ++profilesContextState.pid;
  const n: any = document.createElement('div'),
    txt: any = p.text != null ? String(p.text) : '';
  n.className = 'pn';
  n.innerHTML = '<h4><span class="ph" title="drag to move">⠿</span><span class="pt" contenteditable spellcheck="false">' + profilesContextState.esc(p.title || 'PANEL') + '</span><span class="px">✕</span></h4><div class="bd"><div class="pb" contenteditable>' + profilesContextState.esc(txt).replace(/\n/g, '<br>') + '</div><div class="gui"></div></div>';
  n.classList.add('fl');
  document.body.append(n);
  const entry: any = {
    id,
    node: n,
    by: by || 'user',
    corner: null
  };
  profilesContextState.PN.set(id, entry);
  sizePanel(entry, p.size || '2x2');
  resizablePanel(entry);
  n.animate([{
    opacity: 0
  }, {
    opacity: 1
  }], {
    duration: 280
  });
  panelsWidgetsState.panelSizes.observe(n);
  profilesContextState.$$('.px', n).onclick = (): any => delPanel(id);
  profilesContextState.$$('.pt', n).addEventListener('keydown', (e?: any): any => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });
  dragPanel(n);
  if (p.pos) try {
    movePanel(id, p.pos, {
      dur: 0
    });
  } catch (e: any) {
    console.warn(e);
  }
  if (Array.isArray(p.gui)) for (const g of p.gui) addGui({
    ...g,
    panel: id
  }, by);
  if (p.widget) panelWidget(id, p.widget);
  if (!sessionsState.sessionRestoring && !p.pos) layoutPanels({
    ids: [id]
  });
  return id;
}
export function delPanel(id?: any): any {
  const p: any = profilesContextState.PN.get(id);
  if (!p) return false;
  p.widgetPort?.close();
  for (const g of [...guiNodesState.GU.values()]) if (g.panel === id && !g.parent) delGui(g.id);
  profilesContextState.PN.delete(id);
  p.node.animate([{
    opacity: 1
  }, {
    opacity: 0,
    transform: 'translateX(-14px)'
  }], {
    duration: 200
  }).onfinish = (): any => p.node.remove();
  return true;
}
export function updPanel(id?: any, p?: any): any {
  const q: any = profilesContextState.PN.get(id);
  if (!q) return false;
  if (p.widget !== undefined) panelWidget(id, p.widget);
  if (p.title != null) profilesContextState.$$('.pt', q.node).textContent = String(p.title);
  if (p.text != null) profilesContextState.$$('.pb', q.node).innerText = String(p.text);
  if (p.size != null) sizePanel(q, p.size);else if (p.width != null || p.height != null) {
    const r: any = q.node.getBoundingClientRect(),
      width: any = Number(p.width) || r.width,
      height: any = Number(p.height) || r.height,
      best: any = Object.keys(panelsWidgetsState.PANEL_PRESETS).sort((a?: any, b?: any): any => {
        const x: any = panelDimensions(a),
          y: any = panelDimensions(b);
        return Math.hypot(x.width - width, x.height - height) - Math.hypot(y.width - width, y.height - height);
      })[0];
    sizePanel(q, best);
  }
  if (p.collapsed != null) q.node.classList.toggle('c', !!p.collapsed);
  if (p.pos) movePanel(id, p.pos, p);
  if (p.x != null || p.y != null) {
    stopPanelMove(q);
    const r: any = q.node.getBoundingClientRect();
    q.corner = null;
    q.node.classList.add('fl');
    if (q.node.parentElement !== document.body) document.body.append(q.node);
    fitPanel(q.node, Number(p.x ?? r.left), Number(p.y ?? r.top));
  }
  return true;
}
// Measure at full viewport height before clamping, so dragging upward can expand the body again.
export function fitPanel(n?: any, x?: any, y?: any): any {
  n.style.setProperty('--panel-top', '0px');
  const r: any = n.getBoundingClientRect();
  x = Math.max(0, Math.min(Math.max(0, innerWidth - r.width), x));
  y = Math.max(0, Math.min(Math.max(0, innerHeight - r.height), y));
  n.style.left = x + 'px';
  n.style.top = y + 'px';
  n.style.setProperty('--panel-top', y + 'px');
  return [x, y];
}
export function stopPanelMove(q?: any): any {
  if (q.motion) {
    q.motion.cancel();
    q.motion = null;
  }
}
export
// Corner placement prefers space beside the built-in column, then clamps to the viewport.
function cornerXY(q?: any, c?: any): any {
  const n: any = q.node;
  n.style.setProperty('--panel-top', '0px');
  const r: any = n.getBoundingClientRect(),
    m: any = 14;
  let off: any = 0;
  for (const o of profilesContextState.PN.values()) {
    if (o === q) break;
    if (o.corner === c) off += o.node.getBoundingClientRect().height + 8;
  }
  const L: any = c.endsWith('left'),
    T: any = c.startsWith('top');
  return fitPanel(n, L ? m + panelsWidgetsState.pl.offsetWidth + 8 : innerWidth - r.width - (T ? 68 : m), T ? m + off : innerHeight - r.height - m - off);
}
export function movePanel(id?: any, pos?: any, o?: any): any {
  const q: any = profilesContextState.PN.get(String(id));
  if (!q) throw new Error('no panel ' + id);
  pos = String(pos || '').toLowerCase().replace(/[ _]/g, '-');
  if (!panelsWidgetsState.CORN.includes(pos)) throw new Error('panel pos must be ' + panelsWidgetsState.CORN.join('|'));
  o = typeof o === 'number' ? {
    dur: o
  } : o || {};
  const n: any = q.node,
    r0: any = n.getBoundingClientRect();
  stopPanelMove(q);
  if (!n.classList.contains('fl')) {
    n.classList.add('fl');
    n.style.width = r0.width + 'px';
    document.body.append(n);
  }
  const [sx, sy]: any = fitPanel(n, r0.left, r0.top);
  q.corner = pos;
  const [x, y]: any = cornerXY(q, pos),
    dur: any = o.dur ?? 500;
  if (!dur) return Promise.resolve();
  // Reserve enough height for the entire path; positional easing must not overshoot its endpoints.
  n.style.setProperty('--panel-top', Math.max(sy, y) + 'px');
  const ease: any = ['backOut', 'elasticOut', 'bounceOut'].includes(o.ease) ? panelsWidgetsState.ECSS.cubicOut : panelsWidgetsState.ECSS[o.ease] || panelsWidgetsState.ECSS.cubicOut;
  const motion: any = q.motion = n.animate([{
    left: sx + 'px',
    top: sy + 'px'
  }, {
    left: x + 'px',
    top: y + 'px'
  }], {
    duration: dur,
    delay: o.delay || 0,
    easing: ease,
    fill: 'backwards'
  });
  return motion.finished.catch((): any => {}).then((): any => {
    if (q.motion !== motion) return;
    q.motion = null;
    fitPanel(n, x, y);
  });
}
export function layoutPanels(options: any = {}): any {
  const ids: any = options.ids || [...profilesContextState.PN.keys()],
    items: any = ids.map((id?: any): any => profilesContextState.PN.get(String(id?.id || id))).filter(Boolean),
    gap: any = profilesContextState.num(options.gap, 0, 80, 16),
    selected: any = new Set(items),
    rect: any = (n?: any): any => {
      const r: any = n.getBoundingClientRect();
      return {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height
      };
    },
    placed: any = [...profilesContextState.PN.values()].filter((q?: any): any => !selected.has(q)).map((q?: any): any => rect(q.node)),
    result: any = [];
  for (const column of [panelsWidgetsState.pl, panelsWidgetsState.pr]) for (const n of column.children) if (![...profilesContextState.PN.values()].some((q?: any): any => q.node === n) && n.getBoundingClientRect().height > 0) placed.push(rect(n));
  placed.push(rect(sceneFoundationState.$('gear')));
  const core: any = proj(sceneFoundationState.HX, sceneFoundationState.HY, sceneFoundationState.HQ),
    center: any = {
      x: core[0] * sceneFoundationState.S / (devicePixelRatio || 1),
      y: core[1] * sceneFoundationState.S / (devicePixelRatio || 1)
    },
    overlap: any = (a?: any, b?: any): any => Math.max(0, Math.min(a.x + a.width, b.x + b.width + gap) - Math.max(a.x, b.x - gap)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height + gap) - Math.max(a.y, b.y - gap));
  for (const q of items) {
    stopPanelMove(q);
    const d: any = sizePanel(q, q.size || '2x2'),
      maxX: any = Math.max(14, innerWidth - d.width - 14),
      maxY: any = Math.max(14, innerHeight - d.height - 14),
      xs: any = new Set([14, maxX]),
      ys: any = new Set([14, maxY]);
    for (let x: any = 14; x < maxX; x += 48) xs.add(x);
    for (let y: any = 14; y < maxY; y += 48) ys.add(y);
    for (const r of placed) {
      xs.add(Math.max(14, Math.min(maxX, r.x + r.width + gap)));
      xs.add(Math.max(14, Math.min(maxX, r.x - d.width - gap)));
      ys.add(Math.max(14, Math.min(maxY, r.y + r.height + gap)));
    }
    let spot: any,
      best: any = Infinity;
    for (const x of xs) for (const y of ys) {
      const candidate: any = {
          x,
          y,
          ...d
        },
        blocked: any = placed.reduce((sum?: any, r?: any): any => sum + overlap(candidate, r), 0),
        cx: any = x + d.width / 2,
        cy: any = y + d.height / 2,
        crowding: any = placed.reduce((sum?: any, r?: any): any => sum + Math.exp(-Math.hypot(cx - r.x - r.width / 2, cy - r.y - r.height / 2) / 180), 0),
        corePenalty: any = Math.exp(-Math.hypot(cx - center.x, cy - center.y) / 180),
        edge: any = Math.min(x, innerWidth - x - d.width);
      const score: any = blocked * 1000 + crowding * 100 + corePenalty * 160 + edge * .08;
      if (score < best) {
        best = score;
        spot = candidate;
      }
    }
    const blocked: any = placed.reduce((sum?: any, r?: any): any => sum + overlap(spot, r), 0);
    q.corner = null;
    q.node.classList.add('fl');
    if (q.node.parentElement !== document.body) document.body.append(q.node);
    fitPanel(q.node, spot.x, spot.y);
    placed.push(spot);
    result.push({
      id: q.id,
      size: q.size,
      placed: blocked === 0,
      leastOverlap: blocked > 0,
      ...spot
    });
  }
  return result;
}
export function panelBounds(q?: any): any {
  const r: any = q.node.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
    size: q.size
  };
}
// Sandboxed widgets use a narrow, session-bound JSON bridge, never parent DOM access.
export async function inspectWidget(id?: any): Promise<any> {
  const q: any = profilesContextState.PN.get(String(id?.id || id));
  if (!q?.widgetPort || !q.widget) throw new Error('No active widget in panel ' + id);
  const port: any = q.widgetPort,
    epoch: any = hologramControlsState.workspaceEpoch,
    value: any = await new Promise((resolve?: any, reject?: any): any => {
      const request: any = 'inspect' + ++panelsWidgetsState.widgetInspectionId,
        timer: any = setTimeout((): any => {
          panelsWidgetsState.widgetInspections.delete(request);
          reject(new Error('Widget inspection timed out; widget may be loading or unresponsive'));
        }, 5000);
      panelsWidgetsState.widgetInspections.set(request, {
        port,
        resolve,
        reject,
        timer
      });
      port.postMessage({
        inspect: request
      });
    });
  if (epoch !== hologramControlsState.workspaceEpoch || q.widgetPort !== port) throw new Error('Widget changed during inspection');
  return {
    panelId: q.id,
    bounds: panelBounds(q),
    ...value
  };
}
export function widgetSource(value?: any): any {
  if (typeof value === 'string') value = {
    html: value
  };
  if (!value || typeof value !== 'object') throw new Error('Widget requires {html,js?,css?,height?}');
  const spec: any = {
    html: String(value.html || ''),
    js: String(value.js || ''),
    css: String(value.css || ''),
    height: profilesContextState.num(value.height, 80, 1000, 300)
  };
  if (new TextEncoder().encode(spec.html + spec.js + spec.css).length > 10240) throw new Error('Widget HTML + JS + CSS exceeds 10 KiB');
  return spec;
}
export function panelWidget(id?: any, value?: any): any {
  const q: any = profilesContextState.PN.get(String(id?.id || id));
  if (!q) throw new Error('No panel ' + id);
  const validated: any = value == null ? null : widgetSource(value);
  q.widgetPort?.close();
  q.node.querySelector('[data-widget]')?.remove();
  if (value == null) {
    delete q.widget;
    q.node.querySelector('.bd').style.cssText = '';
    return {
      removed: true
    };
  }
  const spec: any = q.widget = validated,
    frame: any = document.createElement('iframe');
  frame.dataset.widget = 'true';
  frame.title = profilesContextState.$$('.pt', q.node).textContent + ' widget';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.style.cssText = 'display:block;width:100%;border:0;flex:1;min-height:0;height:100%';
  q.node.querySelector('.bd').style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;padding-bottom:18px';
  profilesContextState.$$('.bd', q.node).append(frame);
  const epoch: any = hologramControlsState.workspaceEpoch,
    channel: any = new MessageChannel();
  q.widgetPort = channel.port1;
  const api: any = mkApi({
    by: q.by,
    tm: scriptApiState.JT
  });
  channel.port1.onmessage = async ({
    data: d
  }: any): Promise<any> => {
    if (d?.inspection) {
      const pending: any = panelsWidgetsState.widgetInspections.get(d.inspection);
      if (pending && pending.port === channel.port1) {
        panelsWidgetsState.widgetInspections.delete(d.inspection);
        clearTimeout(pending.timer);
        pending.resolve(d.value);
      }
      return;
    }
    if (epoch !== hologramControlsState.workspaceEpoch || profilesContextState.PN.get(q.id) !== q || q.widgetPort !== channel.port1) return;
    try {
      if (!d || !Array.isArray(d.args)) throw new Error('Invalid widget request');
      const methods: any = {
        get_node: (id?: any): any => {
          const o: any = profilesContextState.O.get(String(id));
          return o ? dumpObject(o) : null;
        },
        set_node: (id?: any, patch?: any): any => {
          const o: any = profilesContextState.O.get(String(id));
          if (!o) throw new Error('No node ' + id);
          setObj(o, patch);
          return dumpObject(o);
        },
        call_script: (id?: any, name?: any, fn?: any, ...args: any): any => {
          const o: any = profilesContextState.O.get(String(id)),
            s: any = o?.scripts.find((s?: any): any => s.name === name);
          if (!s || s.suspended || typeof s.fns[fn] !== 'function') throw new Error('No active exported script function ' + fn);
          return s.fns[fn](...args);
        },
        ask_agent: api.ask_agent,
        ask_main_agent: api.ask_main_agent,
        speak_tts: api.speak_tts,
        get_camera: api.get_camera,
        set_camera: api.set_camera,
        mcp_tools: api.mcp_tools,
        mcp_call: api.mcp_call
      };
      if (!Object.hasOwn(methods, d.method)) throw new Error('Widget method not allowed');
      const result: any = await methods[d.method](...d.args);
      if (epoch !== hologramControlsState.workspaceEpoch || q.widgetPort !== channel.port1) return;
      channel.port1.postMessage({
        id: d.id,
        value: sessionPlain(result)
      });
    } catch (e: any) {
      if (epoch === hologramControlsState.workspaceEpoch && q.widgetPort === channel.port1) channel.port1.postMessage({
        id: d?.id,
        error: e.message
      });
    }
  };
  const escapeScript: any = (s?: any): any => s.replace(/<\/script/gi, '<\\/script'),
    escapeStyle: any = (s?: any): any => s.replace(/<\/style/gi, '<\\/style');
  frame.onload = (): any => {
    if (q.widgetPort === channel.port1) frame.contentWindow.postMessage('widget-init', '*', [channel.port2]);
  };
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;unsafe-inline&#39;; style-src &#39;unsafe-inline&#39;; img-src https: http: data:; connect-src https: http:; font-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><style>' + panelsWidgetsState.WIDGET_CSS + escapeStyle(spec.css) + '</style><script>' + escapeScript(panelsWidgetsState.WIDGET_UI) + '<\/script></head><body>' + spec.html + '<script>' + escapeScript(spec.js) + '<\/script></body></html>';
  return {
    id: q.id,
    bytes: new TextEncoder().encode(spec.html + spec.js + spec.css).length
  };
}
// ---------------- 12d2. GUI nodes (live inside panels; nest with box/row/col) ----------------
export function createPanelHost(): void {
  panelsWidgetsState.pl = document.createElement('div');
  panelsWidgetsState.pr = document.createElement('div');
  panelsWidgetsState.pl.id = 'pl';
  panelsWidgetsState.pr.id = 'pr';
  document.body.append(panelsWidgetsState.pl, panelsWidgetsState.pr);
  panelsWidgetsState.CORN = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  panelsWidgetsState.PANEL_PRESETS = {
    '2x2': [2, 2],
    '3x3': [3, 3],
    '2x3': [2, 3],
    '2x4': [2, 4]
  };
  panelsWidgetsState.ECSS = {
    linear: 'linear',
    quadInOut: 'ease-in-out',
    cubicOut: 'cubic-bezier(.2,.8,.2,1)',
    backOut: 'cubic-bezier(.34,1.56,.64,1)',
    sineInOut: 'cubic-bezier(.37,0,.63,1)',
    elasticOut: 'cubic-bezier(.34,1.56,.64,1)',
    bounceOut: 'cubic-bezier(.34,1.56,.64,1)'
  };
  panelsWidgetsState.panelSizes = new ResizeObserver((entries?: any): any => {
    for (const {
      target: n
    } of entries) {
      if (!n.isConnected) {
        panelsWidgetsState.panelSizes.unobserve(n);
        continue;
      }
      const q: any = [...profilesContextState.PN.values()].find((q?: any): any => q.node === n);
      if (!q || !n.classList.contains('fl') || q.motion) continue;
      if (q.corner) movePanel(q.id, q.corner, {
        dur: 0
      });else fitPanel(n, n.offsetLeft, n.offsetTop);
    }
  });
  addEventListener('resize', (): any => {
    for (const q of profilesContextState.PN.values()) {
      if (!q.node.classList.contains('fl')) continue;
      sizePanel(q, q.size || '2x2');
      if (q.corner) movePanel(q.id, q.corner, {
        dur: 0
      });else {
        stopPanelMove(q);
        fitPanel(q.node, q.node.offsetLeft, q.node.offsetTop);
      }
    }
  });
  panelsWidgetsState.WIDGET_UI = `const UI=(()=>{let active;const deps=new WeakMap;function store(obj){return new Proxy(obj,{get(o,k){if(active){let m=deps.get(o);if(!m)deps.set(o,m=new Map);let s=m.get(k);if(!s)m.set(k,s=new Set);s.add(active);active.deps.push(s)}return o[k]},set(o,k,v){if(Object.is(o[k],v))return true;o[k]=v;for(const f of [...(deps.get(o)?.get(k)||[])]){if(!f.pending){f.pending=true;queueMicrotask(()=>{f.pending=false;f()})}}return true}})}function effect(fn){const run=()=>{if(run.dead)return;for(const s of run.deps)s.delete(run);run.deps=[];const prev=active;active=run;try{fn()}finally{active=prev}};run.deps=[];run();return()=>{run.dead=true;for(const s of run.deps)s.delete(run)}}return{store,effect,text:(el,fn)=>effect(()=>{el.textContent=fn()})}})();let widgetPort,seq=0;const waiting=new Map;const ready=new Promise(resolve=>addEventListener('message',e=>{if(e.source!==parent||e.data!=='widget-init'||!e.ports[0]||widgetPort)return;widgetPort=e.ports[0];widgetPort.onmessage=({data:d})=>{if(d.inspect){const nodes=[...document.body.querySelectorAll('*')].filter(e=>!e.matches('script,style')).slice(0,100);widgetPort.postMessage({inspection:d.inspect,value:{html:document.body.innerHTML.slice(0,16000),text:document.body.innerText.slice(0,8000),viewport:[innerWidth,innerHeight],errors:widgetErrors,elements:nodes.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{tag:e.tagName,id:e.id,class:e.className,rect:[r.x,r.y,r.width,r.height],display:s.display,gap:s.gap,padding:s.padding,margin:s.margin,overflow:e.scrollWidth>e.clientWidth||e.scrollHeight>e.clientHeight}})}});return}const p=waiting.get(d.id);if(p){waiting.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(d.error)):p.resolve(d.value)}};widgetPort.start();resolve() }));const J={call:async(method,...args)=>{await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Widget bridge unavailable; reload the widget')),10000))]);return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{waiting.delete(id);reject(Error('Widget call timed out'))},95000);waiting.set(id,{resolve,reject,timer});widgetPort.postMessage({id,method,args})})}};for(const name of ['get_node','set_node','call_script','ask_agent','ask_main_agent','speak_tts','get_camera','set_camera','mcp_tools','mcp_call'])J[name]=(...args)=>J.call(name,...args);J.getNode=J.get_node;J.callScript=J.call_script;globalThis.J=J;globalThis.UI=UI;const widgetErrors=[];for(const type of ['error','unhandledrejection'])addEventListener(type,e=>{widgetErrors.push(String(e.message||e.reason).slice(0,500));if(widgetErrors.length>10)widgetErrors.shift()});`;
  panelsWidgetsState.WIDGET_CSS = `:root{color-scheme:dark;--bg:#17132c;--surface:#211b3b;--text:#f3ecff;--muted:#b5adc9;--line:#494060;--accent:#80dcd2}*{box-sizing:border-box}body{margin:0;padding:0;background:transparent;color:var(--text);font:13px/1.5 system-ui,sans-serif}h1,h2,h3,p{margin:0}body{display:flex;flex-direction:column;gap:12px}.flex,.grid{gap:8px}label{display:flex;flex-direction:column;gap:4px}input,select,textarea{min-width:0}button{min-height:32px}h1{font-size:20px}h2{font-size:16px}h3{font-size:14px}button,input,select,textarea{font:inherit;color:inherit;border:1px solid var(--line);border-radius:6px;padding:8px;background:var(--surface);max-width:100%}button{cursor:pointer}button:hover{border-color:var(--accent)}button:disabled{opacity:.5;cursor:default}:focus-visible{outline:2px solid var(--accent);outline-offset:2px}a{color:var(--accent)}img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}.flex{display:flex}.grid{display:grid}.hidden{display:none}.block{display:block}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.justify-between{justify-content:space-between}.justify-center{justify-content:center}.flex-1{flex:1;min-width:0}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.gap-1{gap:4px}.gap-2{gap:8px}.gap-3{gap:12px}.gap-4{gap:16px}.p-2{padding:8px}.p-3{padding:12px}.p-4{padding:16px}.mt-2{margin-top:8px}.mb-2{margin-bottom:8px}.w-full{width:100%}.min-w-0{min-width:0}.text-xs{font-size:11px}.text-sm{font-size:13px}.text-lg{font-size:18px}.font-medium{font-weight:500}.font-bold{font-weight:700}.text-muted{color:var(--muted)}.text-accent{color:var(--accent)}.text-center{text-align:center}.bg-surface{background:var(--surface)}.border{border:1px solid var(--line)}.rounded{border-radius:6px}.overflow-auto{overflow:auto}.card{padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}body>.card:only-child{padding:0;border:0;border-radius:0;background:transparent}.w-stack{display:flex;flex-direction:column;gap:12px}.w-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.w-label{font-size:11px;color:var(--muted)}.w-value{font-size:24px;font-weight:600;letter-spacing:-.03em}.w-divider{border:0;border-top:1px solid var(--line);margin:0}.w-badge{font-size:11px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;color:var(--accent)}.w-primary{background:var(--accent);color:var(--bg);border-color:var(--accent);font-weight:600}.w-field{display:flex;flex-direction:column;gap:4px}.w-item{padding:8px 0;border-bottom:1px solid var(--line)}.w-empty{padding:16px 0;text-align:center;color:var(--muted)}.w-progress{width:100%;height:6px;accent-color:var(--accent)}.w-tabs{display:flex;gap:4px}.w-tabs [aria-selected=true]{border-color:var(--accent);color:var(--accent)}@media(max-width:360px){.grid-cols-2{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
  panelsWidgetsState.widgetInspections = new Map();
  panelsWidgetsState.widgetInspectionId = 0;
  panelsWidgetsState.WIDGET_COMPONENTS = {
    stack: '<div class="w-stack"></div>',
    header: '<header class="w-row"><h2>Overview</h2><span class="w-badge">Live</span></header>',
    metric: '<div><div class="w-label">Total</div><div class="w-value">42</div><div class="w-label">Updated just now</div></div>',
    listItem: '<div class="w-item w-row"><span>Item</span><span class="text-muted">Details</span></div>',
    field: '<label class="w-field"><span class="w-label">Name</span><input placeholder="Enter name"></label>',
    action: '<button type="button" class="w-primary">Continue</button>',
    empty: '<p class="w-empty" role="status">Nothing here yet.</p>',
    status: '<p class="w-label" role="status" aria-live="polite">Ready</p>',
    progress: '<label class="w-field"><span class="w-label">Progress</span><progress class="w-progress" value="40" max="100">40%</progress></label>',
    divider: '<hr class="w-divider">',
    toggle: '<label class="w-row"><span>Enable feature</span><input type="checkbox" role="switch" aria-label="Enable feature"></label>',
    tabs: '<div class="w-tabs" role="tablist" aria-label="View"><button type="button" role="tab" aria-selected="true">Overview</button><button type="button" role="tab" aria-selected="false" tabindex="-1">Details</button></div>'
  };
}
