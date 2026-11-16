import { rpc } from '../rpc';
import { sessionsState } from './sessions';
import { setStageBackground } from './gui-nodes';
import { logM } from './hologram-controls';
import { sceneFoundationState } from './scene-foundation';

const revisions = new Map<string, number>();
let applying: string | null = null;
export async function syncBackground(): Promise<void> {
  const session = sessionsState.activeSession?.id;
  if (!session || sessionsState.sessionRestoring || !sessionsState.sessionReady || applying) return;
  const saved = await rpc.host.ai.background({ session });
  if (!saved || sessionsState.activeSession?.id !== session) return;
  if (revisions.get(session) === saved.revision && (sceneFoundationState.stageBackground.config.src || '') === (saved.config.src || '')) return;
  applying = session;
  // Mark before loading to avoid repeated downloads after an image/CORS failure.
  revisions.set(session, saved.revision);
  try {
    await setStageBackground(saved.config.src || null, saved.config);
  } catch (error: any) {
    logM('Saved background could not load: ' + error.message, true);
  } finally { applying = null; }
}

export async function persistBackground(url: string | null, options: { opacity?: number; light?: number } = {}): Promise<void> {
  const session = sessionsState.activeSession?.id;
  if (!session) throw new Error('Session is not ready');
  const result = await rpc.host.ai.setBackground({ session, input: url ? { operation: 'set', url, opacity: options.opacity, light: options.light } : { operation: 'remove' } });
  if (result?.revision) revisions.set(session, result.revision);
}
