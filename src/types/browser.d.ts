export {};

/** Type declarations for native browser capabilities only. */
declare global {
  interface Window {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  }
  interface Performance {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number; [key: string]: unknown }>;
  }
  interface Navigator { deviceMemory?: number }
}
