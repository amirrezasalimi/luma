export {};

/** Compatibility hooks exposed to the existing scene/script API. */
declare global {
  interface Window {
    setTalk?: (...args: any[]) => any;
    selectAgentAtPointer?: (...args: any[]) => any;
    agentTalk?: (...args: any[]) => any;
    speak?: (...args: any[]) => any;
    logAdd?: (...args: any[]) => any;
    holoRaster?: (...args: any[]) => any;
    jarvisMicAnchor?: () => { x: number; y: number; z: number };
    jarvisVoiceProfile?: { voice: (...args: any[]) => any; muted: (...args: any[]) => any };
    prepareJarvisMessages?: (...args: any[]) => any;
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
    JARVIS?: Record<string, any>;
  }
  interface Performance {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number; [key: string]: unknown }>;
  }
  interface Navigator { deviceMemory?: number }
}
