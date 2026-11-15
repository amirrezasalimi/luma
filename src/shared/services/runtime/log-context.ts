let frameUpdateDepth = 0;

export function inFrameUpdate(): boolean { return frameUpdateDepth > 0; }

export function withFrameUpdate<T>(operation: () => T): T {
  frameUpdateDepth++;
  try { return operation(); }
  finally { frameUpdateDepth--; }
}
