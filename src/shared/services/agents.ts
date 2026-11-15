import { loadProfilesAndContext } from './runtime/profiles-context';
import { prepareScriptLifecycle } from './runtime/script-lifecycle';
import { createScriptApi } from './runtime/script-api';
import { bindObjectInput } from './runtime/object-input';
import { prepareAgentOrchestrator } from './runtime/agent-orchestrator';
import { connectAgentConversations } from './runtime/agent-conversations';
import { connectMainOrchestrator } from './runtime/main-orchestrator';
import { createQuestionTray } from './runtime/agent-questions';

/** Permanent profiles must load before scene defaults and agent services are prepared. */
export async function loadAgentProfiles(): Promise<void> {
  await loadProfilesAndContext();
}

export function connectAgents(): void {
  prepareScriptLifecycle();
  createScriptApi();
  bindObjectInput();
  prepareAgentOrchestrator();
  connectAgentConversations();
  connectMainOrchestrator();
  createQuestionTray();
}
