import { createScene } from './scene';
import { createAudio } from './audio';
import { connectAgents, loadAgentProfiles } from './agents';
import { createWorkspace, connectDiagnostics } from './workspace';
import { prepareSessions, restoreSessions } from './sessions';
import { connectIntegrations } from './runtime/integrations';
import { connectSettings } from './runtime/settings-service';
import { exposeScriptApi } from './runtime/public-api';

let startup: Promise<void> | undefined;

export function startJarvis(): Promise<void> {
  return startup ??= startRuntime();
}

async function startRuntime(): Promise<void> {
  const scene = createScene();
  const audio = createAudio();

  try {
    await loadAgentProfiles();
    scene.prepareWorkspace();
    connectAgents();
    createWorkspace();
    connectIntegrations();
    prepareSessions();
    connectDiagnostics();
    connectSettings();
    exposeScriptApi();

    // Rendering starts only after its scene, agent and workspace dependencies exist.
    scene.start();
    await restoreSessions();
  } catch (error) {
    audio.stop();
    throw error;
  }
}
