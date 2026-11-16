/** Immutable factory defaults shared by discovery and scene reset operations. */
export const SCENE_DEFAULTS = {
  camera: { yaw: 0, zoom: 1, px: 0, py: 0 },
  hologram: { x: 0, y: 3.7, z: 0, radius: 2.8, floorRadius: 6.4, floorGrid: 1.2,
    color: '#ffb400', speakingColor: '#44e0e8', ringColor: '#ffb400', ringSpeakingColor: '#44e0e8', floorColor: '#4a5a9e' },
  objects: { color: '#fff1a0', border: '#ffb400', fill: '#e8541c', fillA: .85, bw: 2, size: 1.5, fs: 14 },
  background: {},
} as const;
