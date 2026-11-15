import { connectVoicePipeline } from './runtime/voice-pipeline';
import { prepareVoicePreview, stopVoiceDemo } from './runtime/voice-preview';
import { cancelTurn } from './runtime/voice-pipeline';
import { stopMic } from './runtime/microphone';

export function createAudio() {
  connectVoicePipeline();
  prepareVoicePreview();

  return {
    stop() {
      stopVoiceDemo();
      cancelTurn();
      stopMic();
    },
  };
}
