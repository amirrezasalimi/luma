# JARVIS

A browser-based voice assistant with a holographic visualization, streaming AI responses, and locally hosted speech models.

**[Launch JARVIS →](https://amirrezasalimi.github.io/jarvis/)**

![JARVIS holographic voice assistant](screenshot.png)

## Features

- **Voice input:** browser speech recognition by default, with optional local Whistle WebGPU/WASM recognition.
- **Local speech synthesis:** Phonon TTS, with a selectable English voice catalog and short voice previews in Settings.
- **Streaming responses:** connects to an OpenAI-compatible chat completions endpoint.
- **Separate visual signals:** the sphere reacts to AI activity; the surrounding floor bars and pulses react to microphone input.
- **Floor transcript:** stacked conversation text with fading older messages.
- **Cancellation:** press **Escape** to cancel the current turn and return to listening.

## Getting started

1. Open the [live app](https://amirrezasalimi.github.io/jarvis/).
2. Open **Settings** using the gear button.
3. Configure your OpenAI-compatible endpoint, API key, and model. The endpoint should be the API base URL, such as `https://api.openai.com/v1`; the app appends `/chat/completions`.
4. Choose an STT engine and TTS voice, then **Save**.
5. Tap the sphere and allow microphone access.

Voice previews automatically pause the microphone and restore its previous state afterward. Wait for an active AI response to finish before testing a voice.

Browser speech recognition support varies by browser. Choose Whistle if the browser engine is unavailable. WebGPU is used where supported, with CPU/WASM fallback for local speech models.

## Controls

| Control | Action |
| --- | --- |
| Tap the sphere | Start or stop listening |
| `M` | Mute or unmute the microphone (outside text fields) |
| `Escape` | Cancel the current turn, stop speech, and ignore late results |
| Drag | Rotate the scene |
| Shift-drag or right-drag | Pan |
| Scroll or pinch | Zoom |
| Double-click | Toggle fullscreen |

## Models and network access

Phonon 31m English weights, the voice catalog, and Whistle weights are bundled with the site. They load from the same host, not from Hugging Face on every visit. Each browser must still download model assets on first use; browser caches can reuse them afterward. Cache eviction or clearing site data can require another download.

This is **not a fully offline app**:

- AI requests go to your configured LLM endpoint.
- Browser speech recognition may use a browser vendor's remote service.
- Pixi and Whistle's ONNX Runtime dependencies currently load from jsDelivr.
- Entering a custom `hf://...` TTS model opts into Hugging Face loading.

See [LOCAL_MODELS.md](LOCAL_MODELS.md) for model download and restore instructions.

## Run locally

Install dependencies with Bun, then start Vite + TanStack Start under Bun:

```sh
bun install
bun run dev
```

Open **http://localhost:3000**. Saved data lives in server SQLite. TanStack Start/Vite runs on port 3000 (override with `PORT`) under Bun. Its oRPC server route protects host APIs with loopback Host and same-origin checks. There is no separate API server or development proxy.

For a production build:

```sh
bun run build
bun run start
```

TanStack Start runs in SPA mode for browser-only WebGL/audio/workers. The build emits a static shell and bundles to `dist/client`, alongside copied local model/runtime assets. The Bun host serves that directory; run the build before `bun run start`.

### Frontend structure

- `src/routes/__root.tsx`: document metadata and stylesheet.
- `src/routes/index.tsx`: home route and client-only scene startup.
- `src/shared/components/settings/SettingsDialog.tsx`: React-owned settings dialog, accessible tab navigation, draft Save/Close flow.
- `src/shared/components/settings/`: React tabs for voice, agents/context, souls, code access, skills, MCP, marketplace and workspace/session controls. No HTML injection or nested React roots.
- `src/stores/settings.ts`: Zustand + Immer configuration store; preserves the flat `jarvis-cfg` storage format and unknown saved fields.
- `src/shared/services/settings.ts`: typed commands and runtime status subscriptions. Scene/audio resources stay in the runtime, outside React state.
- `src/styles/app.css`: extracted application styles.
- `src/shared/services/runtime.ts`: small browser-only startup coordinator; subsystem entry points (`scene.ts`, `audio.ts`, `agents.ts`, `workspace.ts`, `sessions.ts`) own their internal setup. Rendering starts after dependencies exist, and startup awaits initial session restoration.
- `src/shared/services/runtime/`: focused TypeScript modules for rendering, objects, panels/widgets, audio, agents, scripting, integrations, profiles, sessions, history and diagnostics. Every module is below 1,000 lines; mutable state is owned by its module and accessed through explicit imports. Initializers preserve the original startup order, including asynchronous permanent-profile loading. Runtime edits trigger a full reload to avoid duplicate listeners/workers.
- `src/shared/utils/`: reusable helpers, including JSON parsing, script-fence extraction and local MCP command validation. Pure helpers do not require initialization.
- `src/types/browser.d.ts`: compatibility declarations for browser extensions and existing public scene/script hooks.
- `src/routes/rpc.$.ts`: TanStack Start server route for all oRPC procedures, with loopback/same-origin validation.
- `src/server/host-router.ts`: code tools, marketplace discovery and local/remote MCP procedures.
- `src/server/services/`: preserved host-side business logic and execution safeguards.
- `src/server/production.ts`: thin Bun transport for built Start output and allowlisted static assets; no API routing.

Validation: `bun run typecheck` and `bun run test`.

The runtime split is structural: dynamic scene/script values still use explicit `any` types and some modules have mutual dependencies. It does not claim a complete domain-type redesign or conversion of the remaining legacy workspace/debug UI into React. Settings UI is React-owned; the remaining UI and resource lifecycle can be migrated module by module without recreating a monolithic file.

Host code tools, marketplace discovery and local MCP use direct service calls from oRPC procedures, not synthetic HTTP requests. Legacy HTTP handlers remain only as compatibility adapters for existing handler-level callers. Remote MCP alone retains an HTTP response envelope because its upstream protocol includes status codes, session headers and SSE. Agent instruction text lives in `src/shared/prompts/`, outside orchestration logic. Explicit Settings Save waits for server confirmation; background preference failures appear in the React-owned persistence notice with a retry action.

### Marketplace and local MCP

Run the Bun host for marketplace discovery and MCP proxying:

```sh
bun run dev
```

Open `http://localhost:3000`. **Settings → Marketplace** searches the official MCP Registry and `SKILL.md` files in Anthropic, OpenAI and Vercel's skill repositories. Results include source/configuration metadata and pagination. GitHub/registry requests require internet and may be rate limited. Skill installation imports the instruction file only, not supporting scripts or assets. Imports are saved **disabled**: review skill instructions in Skills or MCP configuration in MCP Servers, then use the enable checkbox. MCP entries have Edit JSON, Reconnect and Delete controls. Some registry entries require manual credentials/arguments and cannot be launched without configuration; unsupported transports are not auto-converted.

Local stdio MCP execution is enabled by default when running `bun run dev`; no environment flag is needed. To disable host process execution for MCP, start with `JARVIS_LOCAL_MCP=0 bun run dev`.

In Marketplace's **Local MCP** form, enter `bun`, `bunx` or an absolute executable path, a JSON argument array and optional environment variables. Save disabled, then enable in MCP Servers and confirm the execution warning. For example, a filesystem server may use `bunx` with `["@modelcontextprotocol/server-filesystem", "/absolute/allowed/path"]`. Follow the package's actual documentation and scope access narrowly. `bunx` downloads/caches packages on first launch; saving a config does not install or launch it. Native stdio executables are supported through absolute paths, including paths containing spaces. Commands launch directly without a shell; relative executable paths and other bare command names are rejected. Local programs run with your full host-user permissions. JSON imports also accept `{ "mcpServers": { "name": { "command": "bunx", "args": ["package"], "env": {}, "on": false } } }`.

For MixMusic, paste this into **MCP Servers → Import JSON** and accept the local execution confirmation (or keep `on: false` to review before enabling):

```json
{
  "mcpServers": {
    "mixmusic": {
      "command": "/Applications/MixMusic.app/Contents/MacOS/MixMusic",
      "args": ["--mcp"],
      "on": false
    }
  }
}
```

The executable must implement MCP over newline-delimited JSON-RPC on stdin/stdout; diagnostic logs belong on stderr.

**Local MCP packages run with the host user's permissions, not in a sandbox.** Credentials/environment values are stored in server SQLite and included in configuration exports. Enable only trusted packages. Disabling/deleting stops the managed local process; re-enabling/reconnecting starts it again. Enabled configs reconnect when the page opens unless local MCP execution is explicitly disabled on the host. Process sessions idle out after 15 minutes; use Reconnect if necessary. The transport supports tools and newline-delimited stdio JSON-RPC; interactive server requests such as sampling/elicitation are not surfaced in the UI. Remote HTTP and local tools are exposed to agents, scene scripts and widgets through the existing MCP APIs. These features need the Bun host and do not work on the static hosted site alone.

### Runtime debug panel

Press **D** outside editable fields to toggle the debug overlay. It shows FPS, page/agent uptime, status, model, turn limits, live message counts by role, archived-message counts, compaction state, stage counts, and the last outgoing LLM context (expand an agent row). Context token counts are approximate. Request capture begins with the next request; it is diagnostic-only and not included in session snapshots.

The live wave measures **main-thread timer delay**, with Long Tasks observations where supported—not actual OS CPU usage. Memory displays Chromium's JS heap metrics when available, and an explicit **Measure Page Memory** action uses `measureUserAgentSpecificMemory()` only if supported. That API generally requires cross-origin isolation; unsupported browsers show unavailable. Normal browser JavaScript cannot report exact process RAM, GPU allocations, or CPU percentage. Diagnostic rendering runs only while the panel is open. Context details may contain private conversation and tool output.

### Agent profiles, questions and integrations

Execution log entries in the top-left agent panel are expandable to show the JavaScript source, returned result, output and error. These details persist with session logs.

Main and sub-agent profiles have independent voices and output mute states. Settings → Souls & Memory lets you edit profile souls, voice IDs, mute and aesthetics JSON. Main can assign other loaded agents a voice or profile; sub-agents can edit their own. Agent APIs: `set_agent_voice(target, voiceId)`, `mute_agent(target, true)`, `get_agent_profile(target)`, and `update_agent_profile(target, {soul, voice, muted, aesthetics})`. Use `getVoicesLists()` to obtain exact catalog IDs. Output mute does not mute the microphone or cancel work. Sub-agent narration is still limited to the selected talk target.

New agents are **unlimited by default** unless initialized with `maxTurns` or an explicit limited setting. Existing saved sessions retain their saved limits. Unbounded work can incur ongoing API costs.

Agents can ask bottom-of-page question cards with `await ask_user({question, options, multiple})`; `type:"yesno"` produces confirmation choices. Replies return `{cancelled, value}`. Execution timeout pauses while a question is pending; stopping an agent or switching sessions cancels its questions.

Settings lists skill/MCP discovery directories including Skills.sh, Anthropic Skills, Smithery and the official MCP Registry. Agents can list them with `skill_marketplaces()`. `install_skill(rawHttpsSkillMdUrl)` and `install_mcp({name,url,...})` request user confirmation, then import **disabled** for review in Settings. Skill downloads require CORS; MCP endpoints must be remote Streamable HTTP URLs. Marketplace webpage crawling, automatic registry search and local stdio/package installation are not implemented.

Ordinary page refresh no longer triggers a save confirmation, and adding/restoring stage content no longer automatically changes camera zoom. Legacy camera snapshots are reset once to defaults; subsequent user-selected camera positions use the new persistence version.

### Speech, context and workspace history

Press **Enter** outside text fields while voice mode is active to interrupt speech and return to listening for a new order. Already-dispatched commands are not rolled back. Main commands dispatch when the LLM response finishes, without waiting for narration playback; agent `speak_tts()` queues audio and returns immediately by default. For deliberately blocking narration use `await speak_tts(text, {voice: "name", wait: true})`.

Agents can dispatch several independent tasks in one response. `spawn_agent(name, goal, {model, maxTurns: 20})` selects an exact model and per-run step limit; `unlimited:true` removes the cap. The new-agent form and expanded agent controls also expose maximum turns.

**Settings → Sub-agents → Context Management** applies to main and sub-agents:
- **Paging** (default): sends the latest N messages plus system/soul context.
- **Auto-compact**: when the estimated context reaches the configured percentage of model capacity, an extra LLM call summarizes older messages and retains the latest N. Original history remains in session storage.
- **Full history**: sends all messages, with no automatic trimming.

Set model capacity explicitly; usage estimates use approximately four characters per token, not an exact tokenizer. Large system/soul content and oversized historical backlogs can still require paging or a new session. Auto-compaction adds API cost and sends the summarized history to the configured provider.

Main and sub-agents can call `await undo()` / `await redo()`, and Settings → Main LLM → Sessions has matching buttons. Server SQLite holds the **last 10 command/action groups per session**, including before/after workspace snapshots. Undo/redo restores workspace state and pauses agents/scripts. It does **not** reverse host file changes, Bash/MCP side effects, or permanent souls/settings. Concurrent work may be grouped into overlapping snapshots rather than isolated transactions. Persistence errors are shown visibly; no browser-storage fallback is used. Direct browser/runtime state and JavaScript closures remain subject to the session limitations below.

Build Tools starts collapsed in a new session; an existing session's saved expanded/collapsed preference is retained. Images are constrained to panel width, with fixed, default or natural-aspect-ratio sizing.

### Sessions and persistent memory

The stage is automatically snapshotted to **server SQLite on the autosave loop (currently every 500ms when changed)**, on visibility changes and when explicitly saved. On startup, Jarvis restores the most recently active session. **Settings → Main LLM → Sessions** lets you save now or switch to an older session. Press **N** outside a text field to open the new-session confirmation modal: the current session is saved before the new session starts.

Snapshots include stage object properties/colors/variables, script source, panels and positions, GUI fields/images/action source, hologram colors/labels, camera, main history, agent histories/logs and agent model/runtime metadata. Agent context/log entries trimmed for display are archived in the session. Running agents restore stopped; idle agents remain idle. Saved scripts and GUI/label actions are **not executed automatically**: use **Resume Saved Scripts / Actions** in the Sessions section after reviewing the session. JavaScript closures, live timers, in-progress animations, media streams and external host processes cannot be faithfully serialized; a saved function relying on a closure may need to be recreated by an agent. Session changes stop agent/tool requests and invalidate old snippet APIs, but host process cancellation remains best effort.

**Souls, `soul-settings.md`, LLM settings, skills and MCP configuration are shared across sessions.** Edit/reset `soul-settings.md` in **Souls & Memory** to control permanent memory guidance; resetting it does not delete souls or sessions. These markdown documents are stored in SQLite, not host filesystem files.

The database defaults to `data/jarvis.sqlite` (override with `JARVIS_DATABASE`). Clearing browser data no longer deletes saved state. Back up the SQLite database with its WAL consistently, or stop the server before copying it. Sessions contain sensitive conversation/file/tool output. Use one active tab at a time to avoid competing session updates; this is a local single-user host, not an authenticated multi-user service.

### Images, souls and idle agents

Settings uses a wider, responsive dialog with a vertical tab menu for Main LLM, Voice, Sub-agents, Souls & Memory, Code Agent, Skills, and MCP Servers. Close/Save stay visible while the selected section scrolls.

Agents can add single images or image sliders to GUI panels. Click an image to enlarge it in a modal; use previous/next controls or Left/Right arrows to navigate and Escape to close. Images accept HTTP(S), relative URLs and allowlisted raster data URLs. Remote images make browser requests to their hosts.

**Settings → SOUL.md** contains the main agent's persistent markdown identity and memory. It is attached to every main-agent request, separately from the system prompt. Soul edits save immediately. Agents can read their own `soul()` and persist a replacement with `update_soul(markdown)` or append with `update_soul(markdown, true)`.

Saved sub-agent soul profiles have a name, markdown soul, unlimited-step option and an optional **Load idle on page open** setting. **LOAD IDLE** creates the hologram without sending an LLM request; give it a task through its message box or ask Jarvis to tell it what to do. The **NEW AGENT** form also accepts a soul without a task. A task and soul are both optional: an agent with neither starts idle, with no initial LLM request. The main agent can specify an exact model ID using `spawn_agent("Coder", "Task", {model: "model-id"})` or `[[agent Coder | Task | model-id]]`. Without a model override, new agents use the sub-agent default, falling back to the main model. `spawn_agent("Helper")` or `[[agent Helper]]` creates an idle agent. An existing running agent must be stopped before its model is changed, or a separate agent can be created with `force:true`. Saved profiles survive reloads; session state and conversation histories are restored separately from SQLite, with active tasks paused rather than automatically resumed.

Each sub-agent's expanded controls have a **LIMITED / UNLIMITED** toggle. Unlimited removes the step cap across runs, not completion, failure or Stop behavior. It can incur ongoing API costs. Agents can use `idle()` to wait without polling, and `done(summary)` to finish. From agent JavaScript, `spawn_agent(name, goal, {soul, unlimited:true, idle:true})` can create a soul-first idle agent.

Agents can call `await reset_hologram_setting()` to restore their own hologram, or pass `"main"` or an agent name/id. `await hologram(target).reset()` is equivalent. Reset restores position, radius, colors and labels; main reset also restores the floor, while sub-agent reset restores its spawn slot, original palette and automatic radius.

Souls are stored in the server SQLite database, and sent to the configured LLM provider. Do not put secrets in them. Agents are instructed to remember durable preferences and important facts rather than transient output or untrusted instructions; review their memories in Settings.

### Optional host coding agent

Requires [Bun](https://bun.sh). The static site and Python server cannot run host tools.

```sh
JARVIS_CODE_AGENT=1 bun run dev
```

Open **http://localhost:3000**, then enable **Settings → Code Agent → Enable host coding tools**. The toggle saves immediately and applies to both main and sub-agents. Both the server flag and browser toggle must be enabled. Start with `bun run dev` (without the flag) to disable the backend entirely.

The default workspace is this project directory. To use another existing directory:

```sh
JARVIS_CODE_AGENT=1 JARVIS_CODE_ROOT=/absolute/path/to/workspace bun run dev
```

Agents can list/read/write/edit/delete files and execute Bash through same-origin oRPC code procedures. File tools reject paths and symlinks outside the workspace; write parents must exist and edits require a unique exact match. Limits: 1 MiB per file, 2 MiB per request, 1,000 listing entries, 256 KiB shell output, and a 30-second default shell timeout (120 seconds maximum).

**This is trusted host access, not a sandbox.** Bash runs as the server user and can access files outside the workspace, the network, and inherited environment variables. Only enable for trusted tasks, ideally under a dedicated OS user or container; keep backups/version control. There is no per-command approval dialog. Disabling the browser toggle blocks new tool calls and aborts active requests (shell process-group termination is best effort); it cannot undo completed file changes or guarantee all descendants stop. The server binds to loopback and rejects foreign Host/Origin headers; do not expose or reverse-proxy this endpoint publicly.

File contents and command output can be included in prompts sent to your configured LLM provider. Do not expose secrets to the agents.

Backend tests:

```sh
bun test ./code-agent.test.ts --timeout 10000
```

## Production deployment

Build and run the application on a host that can run Bun. The production server serves TanStack Start and its generated assets; a static-only host cannot provide the required SQLite persistence and oRPC backend.

```sh
bun install --frozen-lockfile
bun run build
bun run start
```

Keep the process bound to loopback behind an appropriately secured same-origin access path, and back up `data/jarvis.sqlite` with its WAL consistently.

## Privacy and API keys

Settings, including API keys, MCP tokens and environment values, are stored in **plaintext server SQLite**, not browser storage. Protect the database and backups; never commit them. TanStack Start must run under Bun and remains loopback-only with Host/Origin checks; oRPC is mounted at `/rpc` behind those same checks. This is not encrypted secret storage. LLM calls still go from the browser to your configured provider, which must allow the app origin through CORS.

Speech sent through browser recognition is subject to the browser provider's policies. Whistle processes speech locally; LLM prompts and conversation messages are sent to your configured endpoint.

## Third-party software and models

This project uses [PixiJS](https://pixijs.com/), [Phonon TTS](https://github.com/gradium-ai/xn-ptts/tree/main/ptts-wasm), [Whistle WebGPU](https://huggingface.co/spaces/mrfakename/whistle-webgpu), and [ONNX Runtime](https://onnxruntime.ai/).

Phonon 31m model weights are Apache 2.0. Vendored Phonon runtime license notices are included in `vendor/phonon-tts/`. Consult upstream licenses for the voice catalog and other bundled assets before redistributing them.

### Server persistence

`src/server/database.ts` uses `import { Database } from "bun:sqlite"`. `src/server/router.ts` exposes validated oRPC v2 procedures; the browser imports only router types. Preferences are hydrated into memory before startup and writes are queued to SQLite; sessions and active-session metadata commit atomically. The application does not use browser storage for persistence.
