/** microphone: runtime implementation. */
import { sceneFoundationState } from './scene-foundation';
import { cancelTurn, loadW, startRec, startVAD, voicePipelineState } from './voice-pipeline';

export
// ============================================================================
// 5. AUDIO / MIC / TAP
// ============================================================================
async function mic(): Promise<any> {
  try {
    sceneFoundationState.stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });
    sceneFoundationState.actx = sceneFoundationState.actx || new AudioContext({
      sampleRate: 16000
    });
    sceneFoundationState.an = sceneFoundationState.actx.createAnalyser();
    sceneFoundationState.an.fftSize = 256;
    sceneFoundationState.an.smoothingTimeConstant = .7;
    const src: any = sceneFoundationState.actx.createMediaStreamSource(sceneFoundationState.stream);
    src.connect(sceneFoundationState.an);
    startVAD(src);
    sceneFoundationState.fd = new Uint8Array(sceneFoundationState.an.frequencyBinCount);
    return true;
  } catch (e: any) {
    sceneFoundationState.lab.text = 'MIC UNAVAILABLE';
    return false;
  }
}
export function stopMic(): any {
  voicePipelineState.proc && voicePipelineState.proc.disconnect();
  sceneFoundationState.stream && sceneFoundationState.stream.getTracks().forEach((t?: any): any => t.stop());
  sceneFoundationState.stream = sceneFoundationState.an = null;
}
export function tapCore(): any {
  if (sceneFoundationState.talkTo) setTalk(null);else tap();
}
export async function tap(): Promise<any> {
  if (sceneFoundationState.mode === 'idle') {
    if (await mic()) {
      sceneFoundationState.mode = 'listening';
      voicePipelineState.vadOn = true;
      voicePipelineState.muted = false;
      sceneFoundationState.lab.text = 'LISTENING...';
      if (sceneFoundationState.cfg.sttMode === 'browser') startRec();else loadW().then((): any => {
        if (sceneFoundationState.mode === 'listening' && !voicePipelineState.muted) sceneFoundationState.lab.text = 'LISTENING...';
      }).catch((e?: any): any => {
        console.error(e);
        sceneFoundationState.lab.text = 'STT FAILED: ' + String(e.message).slice(0, 40);
      });
    }
  } else {
    sceneFoundationState.mode = 'idle';
    cancelTurn();
    voicePipelineState.vadOn = false;
    stopMic();
    sceneFoundationState.lab.text = 'TAP THE CORE TO SPEAK';
  }
}

// ============================================================================
// 6. POINTER INPUT (orbit / pan / zoom / core tap / HUD buttons)
// ============================================================================
import { setTalk } from './agent-conversations';
