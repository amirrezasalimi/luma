/** speech-playback: runtime implementation. */
import { sceneFoundationState } from './scene-foundation';
import { voicePipelineState } from './voice-pipeline';

export async function drain(signal?: any): Promise<any> {
  while (sceneFoundationState.actx && voicePipelineState.pt > sceneFoundationState.actx.currentTime + .02 && !voicePipelineState.aborted) {
    signal?.throwIfAborted();
    await voicePipelineState.sleep(50);
  }
  signal?.throwIfAborted();
  voicePipelineState.pAn = null;
  voicePipelineState.speechOwner = null;
  voicePipelineState.speechLevel = 0;
}
export function stopSpeech(): any {
  voicePipelineState.pctl && voicePipelineState.pctl.abort();
  voicePipelineState.srcs.forEach((s?: any): any => {
    try {
      s.stop();
    } catch (e: any) {}
  });
  voicePipelineState.srcs = [];
  voicePipelineState.pt = 0;
  voicePipelineState.pAn = null;
  voicePipelineState.speechOwner = null;
  voicePipelineState.speechLevel = 0;
}
// voice catalog + isolated settings preview

