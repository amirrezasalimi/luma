import { flushPreferences, readPreference, writePreference } from '../persistence';
/** settings-service: runtime implementation. */
import { useRuntimeSettings, settingsChanged } from "../settings";
import { listSessions, saveSession, sessionPlain } from './sessions';
import { cleanAesthetics, profilesContextState, saveSouls, updateAgentProfile, updateSoulSettings } from './profiles-context';
import { addMcps, addSkills, deletePiMcp, integrationsState, parseSkill, refreshMcps, renderSk, setPiMcp } from './integrations';
import { refreshVoices, stopVoiceDemo, testVoice } from './voice-preview';
import { refreshCodeHost, scriptApiState } from './script-api';
import { renderAg, rq } from './workspace-bridge';
import { spawn } from './agent-orchestrator';
import { setStageBackground } from './gui-nodes';
import { layoutPanels } from './panels-widgets';
import { createNewSession, loadSession, resumeSessionScripts } from './session-restoration';
import { workspaceHistoryState } from './workspace-history';
import { sceneFoundationState } from './scene-foundation';

export function connectSettings(): void {
  // Typed settings service boundary. React owns every settings element and event.
  useRuntimeSettings.setState({
    services: {
      snapshot: (): any => sessionPlain({
        agents: profilesContextState.ext,
        context: profilesContextState.contextConfig,
        main: {
          ...profilesContextState.mainProfile,
          soul: profilesContextState.souls.main
        },
        profiles: Object.values<any>(profilesContextState.souls.agents),
        guidance: profilesContextState.soulSettingsMarkdown,
        skills: integrationsState.SK,
        mcps: integrationsState.MC.map((c?: any): any => ({
          ...c,
          status: c.on === false ? 'off' : integrationsState.MS.get(c.name)?.status || 'idle',
          error: integrationsState.MS.get(c.name)?.err,
          tools: integrationsState.MS.get(c.name)?.tools?.length || 0
        })),
        background: sceneFoundationState.stageBackground.config.src || ''
      }),
      stopVoice: stopVoiceDemo,
      loadVoices: refreshVoices,
      testVoice,
      setAgentDefaults: async (patch?: any): Promise<void> => {
        Object.assign(profilesContextState.ext, patch);
        profilesContextState.saveExt();
        if (patch.code === false) for (const c of scriptApiState.codeRequests) c.abort();
        if (patch.code !== undefined) {
          await flushPreferences();
          await refreshCodeHost();
        }
        settingsChanged();
      },
      setContext: (value?: any): any => {
        profilesContextState.contextConfig = {
          strategy: value.strategy,
          maxTokens: Math.round(profilesContextState.num(value.maxTokens, 1024, 10000000, 128000)),
          threshold: profilesContextState.num(value.threshold, 10, 95, 75),
          lastN: Math.round(profilesContextState.num(value.lastN, 2, 200, 16))
        };
        writePreference('jarvis-context', JSON.stringify(profilesContextState.contextConfig));
        settingsChanged();
      },
      updateMain: (patch?: any): any => {
        updateAgentProfile(null, patch);
        settingsChanged();
      },
      saveProfile: (profile?: any, previousName?: any): any => {
        const name: any = profile.name.trim().slice(0, 20),
          key: any = profilesContextState.soulKey(name);
        if (!name) throw new Error('Enter an agent name');
        if (previousName && profilesContextState.soulKey(previousName) !== key) throw new Error('Use NEW to create a profile with a different name');
        const aesthetics: any = cleanAesthetics(profile.aesthetics, true),
          patch: any = {
            soul: profile.soul,
            voice: profile.voice,
            muted: profile.muted,
            aesthetics
          };
        Object.defineProperty(profilesContextState.souls.agents, key, {
          value: {
            ...(profilesContextState.soulProfile(name) || {}),
            name,
            ...patch,
            unlimited: profile.unlimited,
            autoload: profile.autoload
          },
          writable: true,
          enumerable: true,
          configurable: true
        });
        saveSouls();
        for (const a of profilesContextState.AG.values()) if (profilesContextState.soulKey(a.name) === key) {
          a.unlimited = profile.unlimited;
          updateAgentProfile(a, patch);
        }
        rq();
        settingsChanged();
      },
      deleteProfile: (name?: any): any => {
        delete profilesContextState.souls.agents[profilesContextState.soulKey(name)];
        saveSouls();
        settingsChanged();
      },
      loadProfile: (name?: any): any => {
        const p: any = profilesContextState.soulProfile(name);
        if (!p) throw new Error('Save the profile first');
        if ([...profilesContextState.AG.values()].some((a?: any): any => profilesContextState.soulKey(a.name) === profilesContextState.soulKey(name))) throw new Error('Agent already loaded');
        spawn(p.name, '', null, true, null, {
          idle: true,
          unlimited: p.unlimited
        });
        renderAg();
      },
      setGuidance: (text?: any): any => {
        updateSoulSettings(text);
        settingsChanged();
      },
      checkCodeHost: refreshCodeHost,
      importSkills: (input?: any): any => {
        const q: any = integrationsState.jtry(input);
        const n: any = addSkills(q === undefined ? [parseSkill(input)] : Array.isArray(q) ? q : Array.isArray(q.skills) ? q.skills : [q]);
        if (!n) throw new Error('Each skill needs a name and instructions');
      },
      setSkill: (name?: any, on?: any): any => {
        const skill: any = integrationsState.SK.find((s?: any): any => s.name === name);
        if (skill) {
          skill.on = on;
          integrationsState.saveSK();
          renderSk();
        }
      },
      deleteSkill: (name?: any): any => {
        integrationsState.SK = integrationsState.SK.filter((s?: any): any => s.name !== name);
        integrationsState.saveSK();
        renderSk();
      },
      importMcps: async (input?: any): Promise<void> => {
        if (!await addMcps(input)) throw new Error('Each MCP server needs a name and HTTP(S) URL or a local command with string args');
      },
      setMcp: async (name?: any, on?: any): Promise<any> => {
        await setPiMcp(name, on);
      },
      deleteMcp: async (name?: any): Promise<any> => {
        await deletePiMcp(name);
      },
      reconnectMcp: async (name?: any): Promise<any> => {
        await refreshMcps();
      },
      setBackground: async (url?: any): Promise<any> => {
        const { persistBackground } = await import('./background-sync');
        await persistBackground(url || null);
        await setStageBackground(url || null);
        await saveSession(true);
        settingsChanged();
      },
      arrangePanels: layoutPanels,
      listSessions,
      saveSession: async (): Promise<any> => {
        await saveSession(true);
        settingsChanged();
      },
      loadSession,
      newSession: createNewSession,
      resumeScripts: resumeSessionScripts,
      undo: workspaceHistoryState.undoWorkspace,
      redo: workspaceHistoryState.redoWorkspace
    }
  });
}
