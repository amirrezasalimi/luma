/** diagnostics: runtime implementation. */
import * as PIXI from 'pixi.js';
import { sceneFoundationState } from './scene-foundation';
import { frameRendererState } from './frame-renderer';
import { sessionStatus, sessionsState } from './sessions';
import { getAgentProfile, profilesContextState } from './profiles-context';
import { voicePipelineState } from './voice-pipeline';
import { hologramControlsState } from './hologram-controls';
import { scriptApiState } from './script-api';
import { guiNodesState } from './gui-nodes';
import { objectRendererState } from './object-renderer';
import { updateDebugUI, useRuntimeUI } from '../../../stores/runtime-ui';

interface ModuleState {
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
export function debugProfileText(row?: any): string {
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
  return text;
}
export function renderDebug(): any {
  if (!useRuntimeUI.getState().debug.open) return;
  const now: any = performance.now(),
    gap: any = Math.max(0, now - diagnosticsState.debugLastTick - 250);
  diagnosticsState.debugLastTick = now;
  diagnosticsState.debugSamples.push(Math.min(100, gap / 250 * 100));
  if (diagnosticsState.debugSamples.length > 120) diagnosticsState.debugSamples.shift();
  const longMs: any = diagnosticsState.debugLongMs,
    longCount: any = diagnosticsState.debugLongCount;
  diagnosticsState.debugLongMs = 0;
  diagnosticsState.debugLongCount = 0;
  updateDebugUI({
    metrics: 'Page uptime: ' + diagnosticsState.debugDuration(now - diagnosticsState.debugStarted) + ' · FPS: ' + diagnosticsState.debugFps.toFixed(1) + ' · renderer: ' + (sceneFoundationState.app.renderer.type === 1 ? 'WebGL' : 'Canvas') + '\nAgents: ' + profilesContextState.AG.size + ' (' + [...profilesContextState.AG.values()].filter((a?: any): any => a.status === 'running').length + ' running) · objects: ' + profilesContextState.O.size + ' · panels: ' + profilesContextState.PN.size + ' · GUI nodes: ' + guiNodesState.GU.size + '\nSession: ' + (sessionsState.activeSession?.name || 'loading') + ' · context: ' + profilesContextState.contextConfig.strategy + ' · capacity: ' + profilesContextState.contextConfig.maxTokens.toLocaleString() + ' estimated tokens',
    load: 'Timer delay: ' + gap.toFixed(1) + ' ms · delay ratio: ' + Math.min(100, gap / 250 * 100).toFixed(1) + '% · observed long tasks this sample: ' + longCount + ' / ' + longMs.toFixed(0) + ' ms' + (diagnosticsState.debugObserver ? '' : ' (Long Tasks API unavailable)'),
    memory: debugMemoryText(),
  });
  const canvas: any = sceneFoundationState.$('debugWave'),
    ctx: any = canvas.getContext('2d'),
    w: any = canvas.width,
    h: any = canvas.height,
    colors: any = getComputedStyle(canvas);
  if (!ctx) return;
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
  const rows: any = [{
    id: 'main',
    name: 'Luma',
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
  updateDebugUI({ agents: rows.map((row: any) => {
    if (!diagnosticsState.debugAgentSince.has(row.id)) diagnosticsState.debugAgentSince.set(row.id, row.onlineSince ? now - (Date.now() - row.onlineSince) : now);
    const counts: any = {};
    for (const m of row.messages || []) counts[m.role] = (counts[m.role] || 0) + 1;
    const req: any = row.request,
      token: any = req?.estimatedTokens;
    const expanded = diagnosticsState.debugExpanded.has(row.id);
    return {
      id: row.id,
      title: row.name + ' · ' + row.status + ' · ' + row.model + (row.muted ? ' · muted' : ''),
      info: 'Online this page: ' + diagnosticsState.debugDuration(now - (row.id === 'main' ? diagnosticsState.debugStarted : diagnosticsState.debugAgentSince.get(row.id))) + ' · messages: ' + row.messages.length + ' · archived: ' + row.archive.length + '\nRoles: ' + JSON.stringify(counts) + (row.step !== undefined ? ' · turns: ' + row.step + '/' + row.limit : '') + '\nLast sent context: ' + (req ? req.messages.length + ' messages · ~' + token.toLocaleString() + ' tokens (' + (token / profilesContextState.contextConfig.maxTokens * 100).toFixed(1) + '%) · ' + new Date(req.at).toLocaleTimeString() : 'not captured yet') + '\nCompacted: ' + (row.summary?.count || 0) + ' messages' + (row.summary?.summary ? ' · summary ' + row.summary.summary.length + ' chars' : ''),
      profile: expanded ? debugProfileText(row) : '',
      context: expanded ? req ? JSON.stringify(req.messages, null, 2) : 'No captured request yet. Context is captured when the next LLM request is sent.' : '',
      summary: expanded && row.summary?.summary ? 'COMPACTION SUMMARY\n' + row.summary.summary : '',
    };
  }) });
}
export function renderDebugDetailsOnly(): any {
  diagnosticsState.debugLastTick = performance.now() - 250;
  renderDebug();
}
export function toggleDebug(force?: any): any {
  const open: boolean = force ?? !useRuntimeUI.getState().debug.open;
  if (open && useRuntimeUI.getState().debug.open) return;
  updateDebugUI({ open });
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
    if (!useRuntimeUI.getState().debug.open) return;
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
  addEventListener('keydown', (e?: any): any => {
    if (e.key.toLowerCase() !== 'd' || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    toggleDebug();
  });

  // Last ten workspace action snapshots, separate from IndexedDB session history.
}

export async function collectDebugReport(): Promise<string> {
  const snapshotBreakdown = await debugSnapshotBreakdown();
  const report = buildDebugReport();
  report.session.snapshotBreakdown = snapshotBreakdown;
  return JSON.stringify(report, null, 2);
}

export async function measureDebugMemory(): Promise<string> {
  if (typeof performance.measureUserAgentSpecificMemory !== 'function') {
    sessionStatus('Page memory API is unavailable: requires a supported browser and cross-origin isolation');
    return debugMemoryText() + '\nPage memory API unavailable (supported browser + cross-origin isolation required).';
  }
  diagnosticsState.debugMemoryBusy = true;
  try {
    const result = await performance.measureUserAgentSpecificMemory();
    diagnosticsState.debugPageMemory = { bytes: result.bytes, at: Date.now() };
    return debugMemoryText();
  } catch (error) {
    return debugMemoryText() + '\nMeasurement failed: ' + (error instanceof Error ? error.message : String(error));
  } finally {
    diagnosticsState.debugMemoryBusy = false;
  }
}
