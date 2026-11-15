/** diagnostics: runtime implementation. */
import * as PIXI from 'pixi.js';
import { rasterPrimitivesState, saveHologramVisuals } from './raster-primitives';
import { sceneFoundationState } from './scene-foundation';
import { frameRendererState } from './frame-renderer';
import { sessionStatus, sessionsState } from './sessions';
import { getAgentProfile, profilesContextState } from './profiles-context';
import { voicePipelineState } from './voice-pipeline';
import { hologramControlsState } from './hologram-controls';
import { scriptApiState } from './script-api';
import { guiNodesState } from './gui-nodes';
import { objectRendererState } from './object-renderer';

interface ModuleState {
  debugPanel: any;
  debugVisualSection: any;
  debugVisualLegend: any;
  debugVisualInputs: any;
  debugVisualNote: any;
  debugVisualReset: any;
  debugStarted: number;
  debugAgentSince: any;
  debugExpanded: any;
  debugSamples: any;
  debugTimer: any;
  debugObserver: any;
  debugFrames: number;
  debugFps: number;
  debugLastFrame: any;
  debugLastTick: number;
  debugLongMs: number;
  debugLongCount: number;
  debugPageMemory: any;
  debugMemoryBusy: boolean;
  debugDuration: any;
  debugBytes: any;
  debugRenderStart: number;
}

export const diagnosticsState = {} as ModuleState;

export function debugTimingSummary(): any {
  const samples: any = frameRendererState.frameDebug.samples,
    summary: any = {};
  for (const key of new Set<string>(samples.flatMap((s?: any): any => Object.keys(s)))) {
    const values: any = samples.map((s?: any): any => s[key]).filter(Number.isFinite).filter((v?: any): any => key !== 'intervalMs' || v > 0).sort((a?: any, b?: any): any => a - b);
    if (!values.length) continue;
    const round: any = (n?: any): any => Math.round(n * 1000) / 1000;
    summary[key] = {
      mean: round(values.reduce((a?: any, b?: any): any => a + b, 0) / values.length),
      p50: round(values[Math.floor(values.length * .5)]),
      p95: round(values[Math.min(values.length - 1, Math.floor(values.length * .95))]),
      max: round(values[values.length - 1])
    };
  }
  return {
    samples: samples.length,
    windowMs: samples.reduce((n?: any, s?: any): any => n + s.intervalMs, 0),
    milliseconds: summary
  };
}
export async function debugSnapshotBreakdown(): Promise<any> {
  const snapshot: any = sessionsState.lastSavedSessionState;
  if (!snapshot) return null;
  const sections: any = [];
  for (const section of Object.keys(snapshot)) {
    const root: any = snapshot[section],
      stats: any = {
        section,
        objects: 0,
        arrays: 0,
        arrayEntries: 0,
        stringCharacters: 0,
        longestString: 0,
        maxArrayLength: 0
      },
      jobs: any = [root];
    let slice: any = performance.now();
    while (jobs.length) {
      const value: any = jobs.pop();
      if (typeof value === 'string') {
        stats.stringCharacters += value.length;
        stats.longestString = Math.max(stats.longestString, value.length);
      } else if (value && typeof value === 'object') {
        stats.objects++;
        if (Array.isArray(value)) {
          stats.arrays++;
          stats.arrayEntries += value.length;
          stats.maxArrayLength = Math.max(stats.maxArrayLength, value.length);
        }
        for (const key of Object.keys(value)) jobs.push(value[key]);
      }
      if (performance.now() - slice > 4) {
        await new Promise((r?: any): any => setTimeout(r, 0));
        slice = performance.now();
      }
    }
    sections.push(stats);
    await new Promise((r?: any): any => setTimeout(r, 0));
  }
  return sections.sort((a?: any, b?: any): any => b.objects - a.objects || b.stringCharacters - a.stringCharacters);
}
export function buildDebugReport(): any {
  const renderer: any = sceneFoundationState.app.renderer,
    gl: any = renderer.gl;
  let gpu: any = null;
  if (gl) try {
    const ext: any = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      contextLost: gl.isContextLost(),
      attributes: gl.getContextAttributes()
    };
  } catch (e: any) {
    gpu = {
      unavailable: true
    };
  }
  const kinds: any = {};
  let scripts: any = 0,
    activeScripts: any = 0;
  for (const o of profilesContextState.O.values()) {
    kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    for (const s of o.scripts || []) {
      scripts++;
      if (!s.dead && !s.suspended && !s.err) activeScripts++;
    }
  }
  const m: any = performance.memory;
  return {
    reportVersion: 3,
    capturedAt: new Date().toISOString(),
    privacy: 'No keys, endpoints, conversations, agent names, script source, or image URLs included. Browser and GPU identifiers included.',
    runtime: {
      uptimeMs: performance.now(),
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null,
      crossOriginIsolated
    },
    display: {
      viewport: [innerWidth, innerHeight],
      devicePixelRatio,
      canvas: [sceneFoundationState.app.view.width, sceneFoundationState.app.view.height],
      internalBuffer: [sceneFoundationState.W, sceneFoundationState.H],
      pixelScale: sceneFoundationState.S,
      requestedPixelWidth: new URLSearchParams(location.search).get('px'),
      renderer: renderer.type === 1 ? 'WebGL' : 'Canvas',
      pixiVersion: PIXI.VERSION,
      gpu
    },
    performance: {
      fps: diagnosticsState.debugFps,
      tickerFps: sceneFoundationState.app.ticker.FPS,
      tickerSpeed: sceneFoundationState.app.ticker.speed,
      tickerMaxFps: sceneFoundationState.app.ticker.maxFPS,
      timings: debugTimingSummary(),
      longTasks: {
        supported: !!diagnosticsState.debugObserver,
        count: frameRendererState.frameDebug.longTaskCount,
        totalMs: frameRendererState.frameDebug.longTaskMs,
        maxMs: frameRendererState.frameDebug.longTaskMaxMs
      },
      timingNote: 'CPU wall times while debug panel is open; totalMs excludes Pixi render, GPU completion, browser paint and debug-panel refresh. intervalMs includes intervening work.',
      timerDelayPercentSamples: diagnosticsState.debugSamples.slice(),
      heap: m ? {
        usedBytes: m.usedJSHeapSize,
        allocatedBytes: m.totalJSHeapSize,
        limitBytes: m.jsHeapSizeLimit
      } : null,
      pageMemoryBytes: diagnosticsState.debugPageMemory?.bytes ?? null
    },
    scene: {
      agents: [...profilesContextState.AG.values()].map((a?: any, i?: any): any => ({
        index: i,
        status: a.status,
        thinking: !!a.think,
        speaking: voicePipelineState.speechOwner === a,
        radius: a.r,
        position: {
          ...a.pos
        },
        visuals: hologramControlsState.agentVisuals(a),
        messages: a.msgs?.length || 0,
        timers: a.tms?.length ?? a.tms?.size ?? 0
      })),
      objects: profilesContextState.O.size,
      objectKinds: kinds,
      scripts,
      activeScripts,
      scriptTasks: scriptApiState.JT.size ?? scriptApiState.JT.length,
      panels: profilesContextState.PN.size,
      widgets: [...profilesContextState.PN.values()].filter((p?: any): any => p.widget).length,
      guiNodes: guiNodesState.GU.size,
      domElements: document.getElementsByTagName('*').length,
      pixiChildren: sceneFoundationState.app.stage.children.length,
      textures: {
        objectText: objectRendererState.TP.size,
        agentText: objectRendererState.ATP.size,
        transcripts: voicePipelineState.LOG.length
      },
      particles: sceneFoundationState.NT,
      mode: sceneFoundationState.mode,
      micEnergy: sceneFoundationState.micE,
      energy: sceneFoundationState.E,
      camera: {
        ...sceneFoundationState.cam
      },
      floor: {
        radius: sceneFoundationState.SR,
        grid: sceneFoundationState.FG,
        cachedPixels: frameRendererState.floorCache.count,
        geometryReady: !!frameRendererState.floorCache.r
      },
      background: {
        enabled: !!sceneFoundationState.stageBackground.image,
        width: sceneFoundationState.stageBackground.image?.naturalWidth ?? 0,
        height: sceneFoundationState.stageBackground.image?.naturalHeight ?? 0,
        light: sceneFoundationState.stageBackground.config.light ?? 0
      }
    },
    session: {
      ready: sessionsState.sessionReady,
      restoring: sessionsState.sessionRestoring,
      writing: sessionsState.sessionWriting,
      sqliteConnected: !!sessionsState.sessionDB,
      saveDiagnostics: {
        ...sessionsState.sessionSaveDebug,
        archiveEntries: hologramControlsState.MAIN.archive.length,
        archiveCharacters: hologramControlsState.mainArchiveCache.json.length,
        samples: sessionsState.sessionSaveDebug.samples.slice()
      }
    }
  };
}
export function debugMemoryText(): any {
  const m: any = performance.memory;
  return (m ? 'JS heap used: ' + diagnosticsState.debugBytes(m.usedJSHeapSize) + ' · allocated: ' + diagnosticsState.debugBytes(m.totalJSHeapSize) + ' · limit: ' + diagnosticsState.debugBytes(m.jsHeapSizeLimit) : 'JS heap memory: unavailable in this browser') + '\nPage memory (browser-reported): ' + (diagnosticsState.debugPageMemory ? diagnosticsState.debugBytes(diagnosticsState.debugPageMemory.bytes) + ' · measured ' + new Date(diagnosticsState.debugPageMemory.at).toLocaleTimeString() : 'not measured / unsupported');
}
export function debugContextView(request?: any): any {
  const pre: any = document.createElement('pre');
  pre.dataset.requestContext = 'true';
  pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto;background:rgba(0,0,0,.18);padding:8px';
  pre.textContent = request ? JSON.stringify(request.messages, null, 2) : 'No captured request yet. Context is captured when the next LLM request is sent.';
  return pre;
}
export function updateDebugProfile(details?: any, row?: any): any {
  let pre: any = details.querySelector('[data-agent-profile]');
  if (!pre) {
    pre = document.createElement('pre');
    pre.dataset.agentProfile = 'true';
    pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto;background:rgba(0,0,0,.18);padding:8px';
    details.append(pre);
  }
  const agent: any = row.id === 'main' ? null : profilesContextState.AG.get(row.id),
    profile: any = getAgentProfile(agent),
    saved: any = agent ? profilesContextState.soulProfile(agent.name) : null,
    text: any = 'SOUL & PROFILE SETTINGS\n' + JSON.stringify({
      ...profile,
      ...(agent ? {
        model: agent.model,
        maxTurns: profilesContextState.agentLimit(agent) === Infinity ? 'unlimited' : profilesContextState.agentLimit(agent),
        unlimited: !!agent.unlimited,
        autoload: saved?.autoload !== false,
        task: agent.task,
        peers: [...agent.peers],
        hologram: hologramControlsState.agHoloGet(agent)
      } : {
        model: sceneFoundationState.cfg.model,
        hologram: sceneFoundationState.holoGet()
      }),
      contextSettings: profilesContextState.contextConfig
    }, null, 2);
  if (pre.textContent !== text) {
    const top: any = pre.scrollTop,
      left: any = pre.scrollLeft;
    pre.textContent = text;
    pre.scrollTop = top;
    pre.scrollLeft = left;
  }
}
export function renderDebug(): any {
  if (diagnosticsState.debugPanel.hidden) return;
  const now: any = performance.now(),
    gap: any = Math.max(0, now - diagnosticsState.debugLastTick - 250);
  diagnosticsState.debugLastTick = now;
  diagnosticsState.debugSamples.push(Math.min(100, gap / 250 * 100));
  if (diagnosticsState.debugSamples.length > 120) diagnosticsState.debugSamples.shift();
  const longMs: any = diagnosticsState.debugLongMs,
    longCount: any = diagnosticsState.debugLongCount;
  diagnosticsState.debugLongMs = 0;
  diagnosticsState.debugLongCount = 0;
  sceneFoundationState.$('debugMetrics').textContent = 'Page uptime: ' + diagnosticsState.debugDuration(now - diagnosticsState.debugStarted) + ' · FPS: ' + diagnosticsState.debugFps.toFixed(1) + ' · renderer: ' + (sceneFoundationState.app.renderer.type === 1 ? 'WebGL' : 'Canvas') + '\nAgents: ' + profilesContextState.AG.size + ' (' + [...profilesContextState.AG.values()].filter((a?: any): any => a.status === 'running').length + ' running) · objects: ' + profilesContextState.O.size + ' · panels: ' + profilesContextState.PN.size + ' · GUI nodes: ' + guiNodesState.GU.size + '\nSession: ' + (sessionsState.activeSession?.name || 'loading') + ' · context: ' + profilesContextState.contextConfig.strategy + ' · capacity: ' + profilesContextState.contextConfig.maxTokens.toLocaleString() + ' estimated tokens';
  sceneFoundationState.$('debugLoad').textContent = 'Timer delay: ' + gap.toFixed(1) + ' ms · delay ratio: ' + Math.min(100, gap / 250 * 100).toFixed(1) + '% · observed long tasks this sample: ' + longCount + ' / ' + longMs.toFixed(0) + ' ms' + (diagnosticsState.debugObserver ? '' : ' (Long Tasks API unavailable)');
  sceneFoundationState.$('debugMemory').textContent = debugMemoryText();
  const canvas: any = sceneFoundationState.$('debugWave'),
    ctx: any = canvas.getContext('2d'),
    w: any = canvas.width,
    h: any = canvas.height,
    colors: any = getComputedStyle(diagnosticsState.debugPanel);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = colors.getPropertyValue('--line').trim() || '#777';
  ctx.lineWidth = 1;
  for (let y: any = 0; y < h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y + .5);
    ctx.lineTo(w, y + .5);
    ctx.stroke();
  }
  ctx.strokeStyle = colors.getPropertyValue('--acc2').trim() || '#44e0e8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  diagnosticsState.debugSamples.forEach((value?: any, i?: any): any => {
    const x: any = w - (diagnosticsState.debugSamples.length - 1 - i) * w / 119,
      y: any = h - 3 - value / 100 * (h - 6);
    if (i) ctx.lineTo(x, y);else ctx.moveTo(x, y);
  });
  ctx.stroke();
  const root: any = sceneFoundationState.$('debugAgents');
  const rows: any = [{
    id: 'main',
    name: 'JARVIS',
    status: sceneFoundationState.mode,
    model: sceneFoundationState.cfg.model,
    messages: voicePipelineState.hist,
    archive: [],
    request: hologramControlsState.MAIN.debugRequest,
    summary: profilesContextState.mainContextState,
    muted: profilesContextState.mainProfile.muted
  }, ...[...profilesContextState.AG.values()].map((a?: any): any => ({
    id: a.id,
    name: a.name,
    status: a.think ? 'thinking' : a.status,
    model: a.model,
    messages: a.msgs,
    archive: a.messageArchive || [],
    request: a.debugRequest,
    summary: a.contextState,
    muted: a.muted,
    onlineSince: a.onlineSince,
    step: a.step,
    limit: a.unlimited ? '∞' : profilesContextState.agentLimit(a)
  }))];
  for (const row of rows) {
    if (!diagnosticsState.debugAgentSince.has(row.id)) diagnosticsState.debugAgentSince.set(row.id, row.onlineSince ? now - (Date.now() - row.onlineSince) : now);
    let details: any = Array.from(root.children).find((n?: any): any => n.dataset.agentId === row.id);
    if (details) {
      const title: any = details.querySelector('summary'),
        info: any = details.querySelector('p');
      title.textContent = row.name + ' · ' + row.status + ' · ' + row.model + (row.muted ? ' · muted' : '');
      const counts: any = {};
      for (const message of row.messages || []) counts[message.role] = (counts[message.role] || 0) + 1;
      const req: any = row.request,
        token: any = req?.estimatedTokens;
      info.textContent = 'Online this page: ' + diagnosticsState.debugDuration(now - (row.id === 'main' ? diagnosticsState.debugStarted : diagnosticsState.debugAgentSince.get(row.id))) + ' · messages: ' + row.messages.length + ' · archived: ' + row.archive.length + '\nRoles: ' + JSON.stringify(counts) + (row.step !== undefined ? ' · turns: ' + row.step + '/' + row.limit : '') + '\nLast sent context: ' + (req ? req.messages.length + ' messages · ~' + token.toLocaleString() + ' tokens (' + (token / profilesContextState.contextConfig.maxTokens * 100).toFixed(1) + '%) · ' + new Date(req.at).toLocaleTimeString() : 'not captured yet') + '\nCompacted: ' + (row.summary?.count || 0) + ' messages' + (row.summary?.summary ? ' · summary ' + row.summary.summary.length + ' chars' : '');
      if (details.open) {
        updateDebugProfile(details, row);
        let pre: any = details.querySelector('[data-request-context]');
        if (!pre) {
          pre = debugContextView(row.request);
          details.append(pre);
        }
        const text: any = row.request ? JSON.stringify(row.request.messages, null, 2) : 'No captured request yet. Context is captured when the next LLM request is sent.';
        if (pre.textContent !== text) {
          const top: any = pre.scrollTop,
            left: any = pre.scrollLeft;
          pre.textContent = text;
          pre.scrollTop = top;
          pre.scrollLeft = left;
        }
        let summaryPre: any = details.querySelector('[data-compaction]');
        if (!summaryPre && row.summary?.summary) {
          summaryPre = document.createElement('pre');
          summaryPre.dataset.compaction = 'true';
          summaryPre.style.cssText = 'white-space:pre-wrap;max-height:180px;overflow:auto';
          details.append(summaryPre);
        }
        if (summaryPre) {
          const text: any = row.summary?.summary ? 'COMPACTION SUMMARY\n' + row.summary.summary : '';
          summaryPre.hidden = !text;
          if (summaryPre.textContent !== text) {
            const top: any = summaryPre.scrollTop;
            summaryPre.textContent = text;
            summaryPre.scrollTop = top;
          }
        }
      }
      continue;
    }
    details = document.createElement('details');
    details.dataset.agentId = row.id;
    const title: any = document.createElement('summary'),
      info: any = document.createElement('p');
    details.open = diagnosticsState.debugExpanded.has(row.id);
    details.style.cssText = 'border-top:1px solid var(--line);padding:10px 0';
    title.textContent = row.name + ' · ' + row.status + ' · ' + row.model + (row.muted ? ' · muted' : '');
    title.style.cursor = 'pointer';
    details.addEventListener('toggle', (): any => {
      if (!details.isConnected) return;
      if (details.open) diagnosticsState.debugExpanded.add(row.id);else diagnosticsState.debugExpanded.delete(row.id);
    });
    const counts: any = {};
    for (const m of row.messages || []) counts[m.role] = (counts[m.role] || 0) + 1;
    const req: any = row.request,
      token: any = req?.estimatedTokens;
    info.style.cssText = 'white-space:pre-wrap;line-height:1.6';
    info.textContent = 'Online this page: ' + diagnosticsState.debugDuration(now - (row.id === 'main' ? diagnosticsState.debugStarted : diagnosticsState.debugAgentSince.get(row.id))) + ' · messages: ' + row.messages.length + ' · archived: ' + row.archive.length + '\nRoles: ' + JSON.stringify(counts) + (row.step !== undefined ? ' · turns: ' + row.step + '/' + row.limit : '') + '\nLast sent context: ' + (req ? req.messages.length + ' messages · ~' + token.toLocaleString() + ' tokens (' + (token / profilesContextState.contextConfig.maxTokens * 100).toFixed(1) + '%) · ' + new Date(req.at).toLocaleTimeString() : 'not captured yet') + '\nCompacted: ' + (row.summary?.count || 0) + ' messages' + (row.summary?.summary ? ' · summary ' + row.summary.summary.length + ' chars' : '');
    details.append(title, info);
    if (details.open) {
      updateDebugProfile(details, row);
      details.append(debugContextView(req));
      if (row.summary?.summary) {
        const pre: any = document.createElement('pre');
        pre.style.cssText = 'white-space:pre-wrap;max-height:180px;overflow:auto';
        pre.dataset.compaction = 'true';
        pre.textContent = 'COMPACTION SUMMARY\n' + row.summary.summary;
        details.append(pre);
      }
    }
    details.addEventListener('click', (e?: any): any => {
      if (e.target === title) setTimeout((): any => {
        if (details.open) diagnosticsState.debugExpanded.add(row.id);else diagnosticsState.debugExpanded.delete(row.id);
        if (!diagnosticsState.debugPanel.hidden) renderDebugDetailsOnly();
      }, 0);
    });
    root.append(details);
  }
  for (const node of Array.from<HTMLElement>(root.children)) if (!rows.some((row?: any): any => row.id === node.dataset.agentId)) node.remove();
}
export function renderDebugDetailsOnly(): any {
  diagnosticsState.debugLastTick = performance.now() - 250;
  renderDebug();
}
export function toggleDebug(force?: any): any {
  const open: any = force ?? diagnosticsState.debugPanel.hidden;
  if (open && !diagnosticsState.debugPanel.hidden) return;
  diagnosticsState.debugPanel.hidden = !open;
  frameRendererState.frameDebug.enabled = open;
  if (open) {
    frameRendererState.frameDebug.samples = [];
    frameRendererState.frameDebug.previous = 0;
    frameRendererState.frameDebug.longTaskCount = 0;
    frameRendererState.frameDebug.longTaskMs = 0;
    frameRendererState.frameDebug.longTaskMaxMs = 0;
    diagnosticsState.debugFrames = 0;
    diagnosticsState.debugLastFrame = performance.now();
    diagnosticsState.debugLastTick = performance.now();
    diagnosticsState.debugLongMs = 0;
    diagnosticsState.debugLongCount = 0;
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        diagnosticsState.debugObserver = new PerformanceObserver((list?: any): any => {
          for (const entry of list.getEntries()) {
            diagnosticsState.debugLongMs += entry.duration;
            diagnosticsState.debugLongCount++;
            frameRendererState.frameDebug.longTaskCount++;
            frameRendererState.frameDebug.longTaskMs += entry.duration;
            frameRendererState.frameDebug.longTaskMaxMs = Math.max(frameRendererState.frameDebug.longTaskMaxMs, entry.duration);
          }
        });
        diagnosticsState.debugObserver.observe({
          type: 'longtask',
          buffered: false
        });
      }
    } catch (e: any) {
      diagnosticsState.debugObserver = null;
    }
    renderDebug();
    diagnosticsState.debugTimer = setInterval(renderDebug, 1000 / 4);
  } else {
    clearInterval(diagnosticsState.debugTimer);
    diagnosticsState.debugTimer = null;
    diagnosticsState.debugObserver?.disconnect();
    diagnosticsState.debugObserver = null;
  }
}
export function createDiagnostics(): void {
  diagnosticsState.debugPanel = document.createElement('section');
  diagnosticsState.debugPanel.id = 'debug-panel';
  diagnosticsState.debugPanel.hidden = true;
  diagnosticsState.debugPanel.setAttribute('aria-label', 'Runtime debug panel');
  diagnosticsState.debugPanel.style.cssText = 'position:fixed;right:14px;top:14px;width:min(650px,95vw);max-height:calc(100dvh - 28px);overflow:auto;z-index:20;background:var(--card);color:var(--fg);border:2px solid var(--acc2);padding:14px;box-shadow:4px 4px 0 var(--acc);font:11px ui-monospace,monospace';
  diagnosticsState.debugPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:14px;margin:0">DEBUG · D</h2><div><button id="debugCopy" class="b" type="button">COPY DEBUG REPORT</button> <button id="debugClose" class="b" type="button">CLOSE</button></div></div><p id="debugCopyStatus" role="status" class="mut"></p><p id="debugMetrics" style="white-space:pre-wrap;line-height:1.7"></p><p style="margin-bottom:4px">Main-thread delay/load proxy — not OS CPU usage</p><canvas id="debugWave" width="600" height="90" style="display:block;width:100%;height:90px;border:1px solid var(--line)"></canvas><p id="debugLoad" class="mut"></p><p id="debugMemory" style="white-space:pre-wrap"></p><button id="debugMeasure" class="b" type="button">MEASURE PAGE MEMORY</button><p class="mut">Heap memory is Chromium-only and excludes GPU/native allocations. Page-memory measurement requires browser support and cross-origin isolation. Actual CPU/process RAM are not available to normal browser JavaScript.</p><div id="debugAgents"></div>';
  document.body.append(diagnosticsState.debugPanel);
  diagnosticsState.debugVisualSection = document.createElement('fieldset');
  diagnosticsState.debugVisualSection.style.cssText = 'border:1px solid var(--line);margin:12px 0;padding:10px';
  diagnosticsState.debugVisualLegend = document.createElement('legend');
  diagnosticsState.debugVisualLegend.textContent = 'HOLOGRAM VISUALS · live, saved across reloads';
  diagnosticsState.debugVisualSection.append(diagnosticsState.debugVisualLegend);
  diagnosticsState.debugVisualInputs = [];
  for (const [key, label, min, max, step] of [['lineWidth', 'Line width (raster pixels)', 1, 4, 1], ['lineDensity', 'Line density', 0, 1, .05], ['fade', 'Line fade (0 = uniform, 1 = normal)', 0, 1, .05], ['darkShading', 'Main dark shading (0 = off, 1 = normal)', 0, 2, .05], ['hueGradient', 'Main color mix (0 = off)', 0, 1, .05], ['mainCoreScale', 'Main core sphere size', .25, 2, .05], ['agentCount', 'Sub-agent orbiting particle count', 0, 16, 1]]) {
    const row: any = document.createElement('label'),
      name: any = document.createElement('span'),
      input: any = document.createElement('input'),
      value: any = document.createElement('output');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 140px 35px;gap:8px;align-items:center;margin:8px 0';
    name.textContent = label;
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = rasterPrimitivesState.holoDebugVisuals[key];
    input.setAttribute('aria-label', label);
    value.textContent = input.value;
    input.oninput = (): any => {
      rasterPrimitivesState.holoDebugVisuals[key] = Number(input.value);
      value.textContent = input.value;
    };
    input.onchange = (): any => {
      diagnosticsState.debugVisualLegend.textContent = saveHologramVisuals() ? 'HOLOGRAM VISUALS · live, saved across reloads' : 'HOLOGRAM VISUALS · storage unavailable, changes not saved';
    };
    row.append(name, input, value);
    diagnosticsState.debugVisualSection.append(row);
    diagnosticsState.debugVisualInputs.push({
      key,
      input,
      value
    });
  }
  diagnosticsState.debugVisualNote = document.createElement('p');
  diagnosticsState.debugVisualNote.className = 'mut';
  diagnosticsState.debugVisualNote.textContent = 'Line settings affect main and sub-agent holograms. Core size controls the main sphere; particle count leaves the solid sub-agent core intact. Sub-agent count is an offset from the default of 3, preserving per-agent customization.';
  diagnosticsState.debugVisualSection.append(diagnosticsState.debugVisualNote);
  diagnosticsState.debugVisualReset = document.createElement('button');
  diagnosticsState.debugVisualReset.type = 'button';
  diagnosticsState.debugVisualReset.className = 'b';
  diagnosticsState.debugVisualReset.textContent = 'RESET HOLOGRAM VISUALS';
  diagnosticsState.debugVisualReset.onclick = (): any => {
    Object.assign(rasterPrimitivesState.holoDebugVisuals, rasterPrimitivesState.holoDebugDefaults);
    diagnosticsState.debugVisualLegend.textContent = saveHologramVisuals() ? 'HOLOGRAM VISUALS · live, saved across reloads' : 'HOLOGRAM VISUALS · storage unavailable, changes not saved';
    for (const {
      key,
      input,
      value
    } of diagnosticsState.debugVisualInputs) {
      input.value = rasterPrimitivesState.holoDebugVisuals[key];
      value.textContent = input.value;
    }
  };
  diagnosticsState.debugVisualSection.append(diagnosticsState.debugVisualReset);
  sceneFoundationState.$('debugMetrics').before(diagnosticsState.debugVisualSection);
  diagnosticsState.debugStarted = 0;
  diagnosticsState.debugAgentSince = new Map();
  diagnosticsState.debugExpanded = new Set();
  diagnosticsState.debugSamples = [];
  diagnosticsState.debugTimer = null;
  diagnosticsState.debugObserver = null;
  diagnosticsState.debugFrames = 0;
  diagnosticsState.debugFps = 0;
  diagnosticsState.debugLastFrame = performance.now();
  diagnosticsState.debugLastTick = 0;
  diagnosticsState.debugLongMs = 0;
  diagnosticsState.debugLongCount = 0;
  diagnosticsState.debugPageMemory = null;
  diagnosticsState.debugMemoryBusy = false;
  sceneFoundationState.app.ticker.add((): any => {
    if (diagnosticsState.debugPanel.hidden) return;
    diagnosticsState.debugFrames++;
    const now: any = performance.now();
    if (now - diagnosticsState.debugLastFrame >= 1000) {
      diagnosticsState.debugFps = diagnosticsState.debugFrames * 1000 / (now - diagnosticsState.debugLastFrame);
      diagnosticsState.debugFrames = 0;
      diagnosticsState.debugLastFrame = now;
    }
  });
  diagnosticsState.debugDuration = (ms?: any): any => {
    const s: any = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm ' + s % 60 + 's';
  };
  diagnosticsState.debugBytes = (n?: any): any => Number.isFinite(n) ? (n / 1048576).toFixed(1) + ' MiB' : 'unavailable';
  diagnosticsState.debugRenderStart = 0;
  sceneFoundationState.app.ticker.add((): any => {
    if (frameRendererState.frameDebug.enabled) diagnosticsState.debugRenderStart = performance.now();
  }, null, -24);
  sceneFoundationState.app.ticker.add((): any => {
    if (frameRendererState.frameDebug.enabled && frameRendererState.frameDebug.samples.length) frameRendererState.frameDebug.samples[frameRendererState.frameDebug.samples.length - 1].pixiRenderCpuMs = performance.now() - diagnosticsState.debugRenderStart;
  }, null, -26);
  sceneFoundationState.$('debugCopy').onclick = async (): Promise<any> => {
    const button: any = sceneFoundationState.$('debugCopy'),
      status: any = sceneFoundationState.$('debugCopyStatus');
    button.disabled = true;
    try {
      status.textContent = 'Collecting snapshot structure diagnostics…';
      const snapshotBreakdown: any = await debugSnapshotBreakdown(),
        report: any = buildDebugReport();
      report.session.snapshotBreakdown = snapshotBreakdown;
      const text: any = JSON.stringify(report, null, 2);
      try {
        if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        status.textContent = 'Copied debug report. Paste it into the chat.';
      } catch (e: any) {
        const area: any = document.createElement('textarea');
        area.value = text;
        area.readOnly = true;
        area.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
        diagnosticsState.debugPanel.append(area);
        area.select();
        const copied: any = document.execCommand('copy');
        area.remove();
        button.focus();
        if (copied) status.textContent = 'Copied debug report. Paste it into the chat.';else {
          let output: any = sceneFoundationState.$('debugReportFallback');
          if (!output) {
            output = document.createElement('textarea');
            output.id = 'debugReportFallback';
            output.readOnly = true;
            output.style.cssText = 'width:100%;height:180px';
            status.after(output);
          }
          output.hidden = false;
          output.value = text;
          output.focus();
          output.select();
          status.textContent = 'Clipboard blocked. Copy the selected report manually.';
        }
      }
    } catch (e: any) {
      status.textContent = 'Could not build report: ' + e.message;
    } finally {
      button.disabled = false;
    }
  };
  sceneFoundationState.$('debugClose').onclick = (): any => toggleDebug(false);
  sceneFoundationState.$('debugMeasure').onclick = async (): Promise<any> => {
    if (diagnosticsState.debugMemoryBusy) return;
    if (typeof performance.measureUserAgentSpecificMemory !== 'function') {
      sessionStatus('Page memory API is unavailable: requires a supported browser and cross-origin isolation');
      sceneFoundationState.$('debugMemory').textContent = debugMemoryText() + '\nPage memory API unavailable (supported browser + cross-origin isolation required).';
      return;
    }
    diagnosticsState.debugMemoryBusy = true;
    sceneFoundationState.$('debugMeasure').disabled = true;
    try {
      const result: any = await performance.measureUserAgentSpecificMemory();
      diagnosticsState.debugPageMemory = {
        bytes: result.bytes,
        at: Date.now()
      };
      sceneFoundationState.$('debugMemory').textContent = debugMemoryText();
    } catch (e: any) {
      sceneFoundationState.$('debugMemory').textContent = debugMemoryText() + '\nMeasurement failed: ' + e.message;
    } finally {
      diagnosticsState.debugMemoryBusy = false;
      sceneFoundationState.$('debugMeasure').disabled = false;
    }
  };
  addEventListener('keydown', (e?: any): any => {
    if (e.key.toLowerCase() !== 'd' || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    toggleDebug();
  });

  // Last ten workspace action snapshots, separate from IndexedDB session history.
}
