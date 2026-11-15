/** gui-handles: runtime implementation. */
import { addGui, delGui, guiNodesState } from './gui-nodes';
import { profilesContextState } from './profiles-context';
import { delPanel, movePanel, updPanel } from './panels-widgets';

interface ModuleState {
  GAN: any;
  dumpG: any;
  GM: any;
  HP: any;
}

export const guiNodes2State = {} as ModuleState;

export function ganim(g?: any, n?: any, o?: any): any {
  const f: any = guiNodes2State.GAN[n];
  if (!f) throw new Error('unknown gui animation "' + n + '" (use ' + Object.keys(guiNodes2State.GAN).join('|') + ')');
  o = typeof o === 'number' ? {
    dur: o
  } : o || {};
  return g.el.animate(f, {
    duration: o.dur || 350,
    easing: 'ease-in-out',
    iterations: o.loop === -1 ? Infinity : (o.loop || 0) + 1,
    fill: n === 'fadeOut' ? 'forwards' : 'none'
  }).finished.catch((): any => {});
}
export function HG(g?: any, by?: any): any {
  by = by || 'user';
  const c: any = g._h || (g._h = {});
  return c[by] || (c[by] = new Proxy({}, {
    get(_?: any, k?: any): any {
      if (typeof k !== 'string' || k === 'then') return undefined;
      if (k === 'id' || k === 'type' || k === 'panel' || k === 'by') return g[k];
      if (k === 'parent') return g.parent || null;
      if (k === 'alive') return guiNodesState.GU.get(g.id) === g;
      if (k === 'children') return [...guiNodesState.GU.values()].filter((c?: any): any => c.parent === g.id).map((c?: any): any => HG(c, by));
      if (k === 'value') return guiNodesState.gval(g);
      if (k in guiNodes2State.GM) return (...a: any): any => guiNodes2State.GM[k](g, by, ...a);
      if (k in g.p) return g.p[k];
      if (k in g.vars) return g.vars[k];
    },
    set(_?: any, k?: any, v?: any): any {
      guiNodesState.setGui(g, {
        [k]: v
      });
      return true;
    },
    has(_?: any, k?: any): any {
      return k in g.p || k in g.vars;
    }
  }));
}
export function prepareGuiHandles(): void {
  guiNodes2State.GAN = {
    pulse: [{
      transform: 'scale(1)'
    }, {
      transform: 'scale(1.1)'
    }, {
      transform: 'scale(1)'
    }],
    pop: [{
      transform: 'scale(.3)',
      opacity: 0
    }, {
      transform: 'scale(1)',
      opacity: 1
    }],
    shake: [{
      transform: 'translateX(0)'
    }, {
      transform: 'translateX(-6px)'
    }, {
      transform: 'translateX(6px)'
    }, {
      transform: 'translateX(0)'
    }],
    flash: [{
      opacity: 1
    }, {
      opacity: .2
    }, {
      opacity: 1
    }],
    fadeIn: [{
      opacity: 0
    }, {
      opacity: 1
    }],
    fadeOut: [{
      opacity: 1
    }, {
      opacity: 0
    }],
    bounce: [{
      transform: 'translateY(0)'
    }, {
      transform: 'translateY(-10px)'
    }, {
      transform: 'translateY(0)'
    }]
  };
  guiNodes2State.dumpG = (g?: any): any => ({
    id: g.id,
    type: g.type,
    panel: g.panel,
    parent: g.parent || undefined,
    by: g.by,
    ...g.p,
    value: guiNodesState.gval(g),
    vars: g.vars,
    actions: Object.keys(g.fn),
    children: [...guiNodesState.GU.values()].filter((c?: any): any => c.parent === g.id).map((c?: any): any => c.id),
    err: g.err
  });
  guiNodes2State.GM = {
    set: (g?: any, by?: any, p?: any): any => (guiNodesState.setGui(g, p), HG(g, by)),
    get: (g?: any): any => guiNodes2State.dumpG(g),
    remove: (g?: any): any => delGui(g.id),
    add: (g?: any, by?: any, p?: any): any => HG(addGui({
      ...p,
      parent: g.id
    }, by), by),
    on: (g?: any, by?: any, ev?: any, fn?: any): any => (guiNodesState.setGui(g, {
      [/^on[A-Z]/.test(ev) ? ev : 'on' + ev[0].toUpperCase() + ev.slice(1)]: fn
    }), HG(g, by)),
    animate: (g?: any, by?: any, n?: any, o?: any): any => ganim(g, n, o),
    focus: (g?: any): any => g.el.focus()
  };
  guiNodes2State.HP = (q?: any, by?: any): any => ({
    get id() {
      return q.id;
    },
    get title() {
      return profilesContextState.$$('.pt', q.node).textContent;
    },
    set title(v: any) {
      updPanel(q.id, {
        title: v
      });
    },
    get text() {
      return profilesContextState.$$('.pb', q.node).innerText;
    },
    set text(v: any) {
      updPanel(q.id, {
        text: v
      });
    },
    get pos() {
      return q.corner;
    },
    set pos(v: any) {
      movePanel(q.id, v);
    },
    set: (p?: any): any => (updPanel(q.id, p || {}), guiNodes2State.HP(q, by)),
    move: (pos?: any, o?: any): any => movePanel(q.id, pos, o),
    add: (p?: any): any => HG(addGui({
      ...p,
      panel: q.id
    }, by), by),
    gui: (): any => [...guiNodesState.GU.values()].filter((g?: any): any => g.panel === q.id && !g.parent).map((g?: any): any => HG(g, by)),
    getGui: (id?: any): any => {
      const g: any = guiNodesState.GU.get(String(id));
      return g && g.panel === q.id ? HG(g, by) : null;
    },
    clearGui: (): any => {
      for (const g of [...guiNodesState.GU.values()]) if (g.panel === q.id && !g.parent) delGui(g.id);
    },
    remove: (): any => delPanel(q.id),
    get: (): any => ({
      id: q.id,
      title: profilesContextState.$$('.pt', q.node).textContent,
      text: profilesContextState.$$('.pb', q.node).innerText,
      pos: q.corner,
      by: q.by,
      size: q.size,
      hasWidget: !!q.widget,
      widgetBytes: q.widget ? new TextEncoder().encode(q.widget.html + q.widget.js + q.widget.css).length : 0,
      gui: [...guiNodesState.GU.values()].filter((g?: any): any => g.panel === q.id).map((g?: any): any => g.id)
    }),
    toString: (): any => q.id
  });
}
