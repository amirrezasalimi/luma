import * as PIXI from 'pixi.js-legacy';
import type { GraphFact } from '../../../server/services/graph-memory';

/** Bounded graph view: deterministic layout, smooth motion, no per-frame React state. */
export function createMemoryGraph(host: HTMLElement, inspect: (entity: string | null, pinned: boolean) => void) {
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  const app = new PIXI.Application({ backgroundAlpha: 0, antialias: false, resolution: pixelRatio, autoDensity: true });
  const canvas = app.view as HTMLCanvasElement;
  canvas.setAttribute('aria-label', 'Memory relationship graph. Select an entity in the adjacent list for keyboard access.');
  host.append(canvas);
  const grid = new PIXI.Graphics();
  const edges = new PIXI.Graphics();
  const atmosphere = new PIXI.Graphics();
  const nodes = new PIXI.Container();
  const world = new PIXI.Container();
  world.addChild(edges, nodes);
  app.stage.addChild(grid, atmosphere, world);
  canvas.style.touchAction = 'none';
  let zoom = 1;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  function zoomAt(x: number, y: number, factor: number) {
    const next = Math.max(.25, Math.min(4, zoom * factor));
    const ratio = next / zoom;
    world.position.set(x - (x - world.x) * ratio, y - (y - world.y) * ratio);
    zoom = next; world.scale.set(zoom);
    // Labels stay screen-sized rather than enlarging a fixed text texture.
    // Keep their native device-resolution raster while the graph zooms.
    for (const point of points.values()) point.label.scale.set(1 / zoom);
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    zoomAt(event.clientX - bounds.left, event.clientY - bounds.top, Math.exp(-event.deltaY * .0015));
  }
  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    if (!pointers.size) dragged = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      const bounds = canvas.getBoundingClientRect();
      if (before > 0) zoomAt((event.clientX + other.x) / 2 - bounds.left, (event.clientY + other.y) / 2 - bounds.top, after / before);
    } else { world.x += dx; world.y += dy; }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  function up(event: PointerEvent) { pointers.delete(event.pointerId); }
  function reset() { zoom = 1; world.scale.set(1); world.position.set(0, 0); for (const point of points.values()) point.label.scale.set(1); }
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('dblclick', reset);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let selected: string | null = null;
  let hovered: string | null = null;
  let facts: GraphFact[] = [];
  let points = new Map<string, { x: number; y: number; tx: number; ty: number; dot: PIXI.Graphics; label: PIXI.Text }>();
  let width = 1, height = 1, time = 0;
  const color = 0xffb400, cyan = 0x44e0e8;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // Fine pixel geometry with restrained dithering on secondary details.
  function pixel(graphics: PIXI.Graphics, x: number, y: number, ink: number, coverage: number) {
    const gx = Math.round(x), gy = Math.round(y);
    if ((bayer[((gy & 3) << 2) | (gx & 3)]! + .5) / 16 > coverage) return;
    graphics.beginFill(ink, .65).drawRect(gx, gy, 1, 1).endFill();
  }
  function beam(graphics: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, ink: number, coverage: number) {
    let x = Math.round(x1), y = Math.round(y1);
    const endX = Math.round(x2), endY = Math.round(y2);
    const dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
    const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      pixel(graphics, x, y, ink, coverage);
      if (x === endX && y === endY) break;
      const twice = error * 2;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }
  function arc(graphics: PIXI.Graphics, x: number, y: number, radius: number, start: number, length: number, ink: number, coverage: number) {
    const steps = Math.max(1, Math.ceil(radius * length * 1.5));
    let lastX = NaN, lastY = NaN;
    for (let step = 0; step <= steps; step++) {
      const angle = start + length * step / steps;
      const px = Math.round(x + Math.cos(angle) * radius);
      const py = Math.round(y + Math.sin(angle) * radius);
      if (px !== lastX || py !== lastY) pixel(graphics, px, py, ink, coverage);
      lastX = px; lastY = py;
    }
  }
  function layout() {
    const list = [...points.values()];
    const radius = Math.max(20, Math.min(width * .39, height * .38));
    list.forEach((point, index) => {
      const angle = index * 2.399963229728653;
      const r = list.length < 2 ? 0 : radius * Math.sqrt((index + .5) / list.length);
      point.tx = width / 2 + Math.cos(angle) * r;
      point.ty = height / 2 + Math.sin(angle) * r;
    });
  }
  const resize = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    app.renderer.resize(width, height);
    grid.clear();
    // Ordered stippling echoes the main hologram's low-resolution raster.
    for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
      const distance = Math.hypot((x - width / 2) / width, (y - height / 2) / height);
      grid.beginFill(color, Math.max(.015, .09 - distance * .12)).drawRect(x, y, 1, 1).endFill();
    }
    for (let y = 0; y < height; y += 4) grid.lineStyle(1, 0x02030b, .25).moveTo(0, y).lineTo(width, y);
    layout();
  });
  resize.observe(host);
  function update(next: GraphFact[]) {
    facts = next;
    const entities = new Set(next.flatMap(fact => [fact.subject, fact.object]));
    for (const [name, point] of points) if (!entities.has(name)) {
      point.dot.destroy(); point.label.destroy(); points.delete(name);
    }
    for (const name of entities) if (!points.has(name)) {
      const dot = new PIXI.Graphics();
      dot.eventMode = 'static'; dot.cursor = 'pointer'; dot.hitArea = new PIXI.Circle(0, 0, 17);
      dot.on('pointerover', () => { hovered = name; inspect(name, false); });
      dot.on('pointerout', () => { hovered = null; inspect(null, false); });
      dot.on('pointertap', () => { if (!dragged) { selected = name; inspect(name, true); } });
      const label = new PIXI.Text(name.length > 23 ? name.slice(0, 22) + '…' : name, {
        fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, fill: 0xffdf92,
      });
      label.resolution = pixelRatio;
      label.scale.set(1 / zoom);
      label.anchor.set(.5, 0); label.eventMode = 'none';
      nodes.addChild(dot, label);
      points.set(name, { x: width / 2, y: height / 2, tx: width / 2, ty: height / 2, dot, label });
    }
    if (selected && !entities.has(selected)) selected = null;
    layout();
  }
  app.ticker.add(() => {
    const dt = Math.min(app.ticker.deltaMS / 1000, .05);
    if (!document.hidden) time += dt;
    atmosphere.clear();
    const radius = Math.min(width, height) * .4;
    const sweep = reduced.matches ? -.7 : time * .13;
    for (let ring = 0; ring < 3; ring++) {
      const r = radius + ring * 7;
      for (let segment = 0; segment < 64; segment++) {
        if ((segment + ring) % 7 === 0) continue;
        const angle = segment * Math.PI / 32;
        const bright = Math.cos(angle - sweep) > .97;
        arc(atmosphere, width / 2, height / 2, r, angle, .065, bright ? cyan : color, bright ? 1 : .6);
      }
    }
    const active = hovered || selected;
    for (const [name, point] of points) {
      const factor = reduced.matches ? 1 : 1 - Math.exp(-dt * 9);
      point.x += (point.tx - point.x) * factor; point.y += (point.ty - point.y) * factor;
      point.dot.position.set(Math.round(point.x), Math.round(point.y));
      point.label.position.set(point.x, point.y + 13 + 4 / zoom);
      const highlight = name === active;
      const ink = highlight ? cyan : color;
      point.dot.clear();
      for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
        const r = Math.hypot(x, y);
        if (r > 8) continue;
        pixel(point.dot, x, y, ink, r < 5 ? 1 : .7);
      }
      const phase = reduced.matches ? 0 : time * .35;
      for (let segment = 0; segment < 8; segment++) {
        const angle = segment * Math.PI / 4 + phase;
        arc(point.dot, 0, 0, highlight ? 15 : 12, angle, .38, ink, highlight ? 1 : .85);
      }
    }
    edges.clear();
    for (const fact of facts) {
      const a = points.get(fact.subject), b = points.get(fact.object);
      if (!a || !b) continue;
      const highlight = active === fact.subject || active === fact.object;
      const ink = highlight ? cyan : color;
      // Preserve readable connections; reserve stronger dithering for halos.
      const coverage = highlight ? 1 : .85;
      if (a === b) { arc(edges, a.x, a.y - 13, 13, 0, Math.PI * 2, ink, coverage); continue; }
      beam(edges, a.x, a.y, b.x, b.y, ink, coverage);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const endX = b.x - Math.cos(angle) * 10, endY = b.y - Math.sin(angle) * 10;
      beam(edges, endX - Math.cos(angle - .5) * 7, endY - Math.sin(angle - .5) * 7, endX, endY, ink, 1);
      beam(edges, endX, endY, endX - Math.cos(angle + .5) * 7, endY - Math.sin(angle + .5) * 7, ink, 1);
      if (!reduced.matches && !document.hidden) {
        const t = (time * .18 + fact.id * .137) % 1;
        pixel(edges, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ink, 1);
      }
    }
  });
  return { update, reset, zoomBy(factor: number) { zoomAt(width / 2, height / 2, factor); }, select(name: string | null) { selected = name; }, destroy() {
    resize.disconnect();
    canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('dblclick', reset);
    app.destroy(true, { children: true, texture: true, baseTexture: true }); points.clear();
  } };
}
