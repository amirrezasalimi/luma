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

Use Python 3 to serve the project directory:

```sh
python3 -m http.server 8000
```

Open **http://localhost:8000/jarvis.html**. Use HTTP on localhost rather than opening the HTML file directly; module workers and microphone access need a supported origin.

### Marketplace and local MCP (`jarvis3.html`)

Run the Bun host for marketplace discovery and MCP proxying:

```sh
bun server.ts
```

Open `http://localhost:3000`. **Settings → Marketplace** searches the official MCP Registry and `SKILL.md` files in Anthropic, OpenAI and Vercel's skill repositories. Results include source/configuration metadata and pagination. GitHub/registry requests require internet and may be rate limited. Skill installation imports the instruction file only, not supporting scripts or assets. Imports are saved **disabled**: review skill instructions in Skills or MCP configuration in MCP Servers, then use the enable checkbox. MCP entries have Edit JSON, Reconnect and Delete controls. Some registry entries require manual credentials/arguments and cannot be launched without configuration; unsupported transports are not auto-converted.

Local stdio MCP execution is enabled by default when running `bun server.ts`; no environment flag is needed. To disable host process execution for MCP, start with `JARVIS_LOCAL_MCP=0 bun server.ts`.

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

**Local MCP packages run with the host user's permissions, not in a sandbox.** Credentials/environment values are stored in browser localStorage and included in configuration exports. Enable only trusted packages. Disabling/deleting stops the managed local process; re-enabling/reconnecting starts it again. Enabled configs reconnect when the page opens unless local MCP execution is explicitly disabled on the host. Process sessions idle out after 15 minutes; use Reconnect if necessary. The transport supports tools and newline-delimited stdio JSON-RPC; interactive server requests such as sampling/elicitation are not surfaced in the UI. Remote HTTP and local tools are exposed to agents, scene scripts and widgets through the existing MCP APIs. These features need the Bun host and do not work on the static hosted site alone.

### Runtime debug panel (`jarvis3.html`)

Press **D** outside editable fields to toggle the debug overlay. It shows FPS, page/agent uptime, status, model, turn limits, live message counts by role, archived-message counts, compaction state, stage counts, and the last outgoing LLM context (expand an agent row). Context token counts are approximate. Request capture begins with the next request; it is diagnostic-only and not included in session snapshots.

The live wave measures **main-thread timer delay**, with Long Tasks observations where supported—not actual OS CPU usage. Memory displays Chromium's JS heap metrics when available, and an explicit **Measure Page Memory** action uses `measureUserAgentSpecificMemory()` only if supported. That API generally requires cross-origin isolation; unsupported browsers show unavailable. Normal browser JavaScript cannot report exact process RAM, GPU allocations, or CPU percentage. Diagnostic rendering runs only while the panel is open. Context details may contain private conversation and tool output.

### Agent profiles, questions and integrations (`jarvis3.html`)

Execution log entries in the top-left agent panel are expandable to show the JavaScript source, returned result, output and error. These details persist with session logs.

Main and sub-agent profiles have independent voices and output mute states. Settings → Souls & Memory lets you edit profile souls, voice IDs, mute and aesthetics JSON. Main can assign other loaded agents a voice or profile; sub-agents can edit their own. Agent APIs: `set_agent_voice(target, voiceId)`, `mute_agent(target, true)`, `get_agent_profile(target)`, and `update_agent_profile(target, {soul, voice, muted, aesthetics})`. Use `getVoicesLists()` to obtain exact catalog IDs. Output mute does not mute the microphone or cancel work. Sub-agent narration is still limited to the selected talk target.

New agents are **unlimited by default** unless initialized with `maxTurns` or an explicit limited setting. Existing saved sessions retain their saved limits. Unbounded work can incur ongoing API costs.

Agents can ask bottom-of-page question cards with `await ask_user({question, options, multiple})`; `type:"yesno"` produces confirmation choices. Replies return `{cancelled, value}`. Execution timeout pauses while a question is pending; stopping an agent or switching sessions cancels its questions.

Settings lists skill/MCP discovery directories including Skills.sh, Anthropic Skills, Smithery and the official MCP Registry. Agents can list them with `skill_marketplaces()`. `install_skill(rawHttpsSkillMdUrl)` and `install_mcp({name,url,...})` request user confirmation, then import **disabled** for review in Settings. Skill downloads require CORS; MCP endpoints must be remote Streamable HTTP URLs. Marketplace webpage crawling, automatic registry search and local stdio/package installation are not implemented.

Ordinary page refresh no longer triggers a save confirmation, and adding/restoring stage content no longer automatically changes camera zoom. Legacy camera snapshots are reset once to defaults; subsequent user-selected camera positions use the new persistence version.

### Speech, context and workspace history (`jarvis3.html`)

Press **Enter** outside text fields while voice mode is active to interrupt speech and return to listening for a new order. Already-dispatched commands are not rolled back. Main commands dispatch when the LLM response finishes, without waiting for narration playback; agent `speak_tts()` queues audio and returns immediately by default. For deliberately blocking narration use `await speak_tts(text, {voice: "name", wait: true})`.

Agents can dispatch several independent tasks in one response. `spawn_agent(name, goal, {model, maxTurns: 20})` selects an exact model and per-run step limit; `unlimited:true` removes the cap. The new-agent form and expanded agent controls also expose maximum turns.

**Settings → Sub-agents → Context Management** applies to main and sub-agents:
- **Paging** (default): sends the latest N messages plus system/soul context.
- **Auto-compact**: when the estimated context reaches the configured percentage of model capacity, an extra LLM call summarizes older messages and retains the latest N. Original history remains in session storage.
- **Full history**: sends all messages, with no automatic trimming.

Set model capacity explicitly; usage estimates use approximately four characters per token, not an exact tokenizer. Large system/soul content and oversized historical backlogs can still require paging or a new session. Auto-compaction adds API cost and sends the summarized history to the configured provider.

Main and sub-agents can call `await undo()` / `await redo()`, and Settings → Main LLM → Sessions has matching buttons. A separate **localStorage history holds the last 10 command/action groups per session**, including before/after workspace snapshots. Undo/redo restores workspace state and pauses agents/scripts. It does **not** reverse host file changes, Bash/MCP side effects, or permanent souls/settings. Concurrent work may be grouped into overlapping snapshots rather than isolated transactions. Large snapshots can exceed localStorage quota; a visible warning is shown and IndexedDB session storage remains separate. Direct browser/runtime state and JavaScript closures remain subject to the session limitations below.

Build Tools starts collapsed in a new session; an existing session's saved expanded/collapsed preference is retained. Images are constrained to panel width, with fixed, default or natural-aspect-ratio sizing.

### Sessions and persistent memory (`jarvis3.html`)

The stage is automatically snapshotted to **IndexedDB every 1.5 seconds**, on visibility changes and when explicitly saved. On startup, Jarvis restores the most recently active session. **Settings → Main LLM → Sessions** lets you save now or switch to an older session. Press **N** outside a text field to open the new-session confirmation modal: the current session is saved before the new session starts.

Snapshots include stage object properties/colors/variables, script source, panels and positions, GUI fields/images/action source, hologram colors/labels, camera, main history, agent histories/logs and agent model/runtime metadata. Agent context/log entries trimmed for display are archived in the session. Running agents restore stopped; idle agents remain idle. Saved scripts and GUI/label actions are **not executed automatically**: use **Resume Saved Scripts / Actions** in the Sessions section after reviewing the session. JavaScript closures, live timers, in-progress animations, media streams and external host processes cannot be faithfully serialized; a saved function relying on a closure may need to be recreated by an agent. Session changes stop agent/tool requests and invalidate old snippet APIs, but host process cancellation remains best effort.

**Souls, `soul-settings.md`, LLM settings, skills and MCP configuration are shared across sessions.** Edit/reset `soul-settings.md` in **Souls & Memory** to control permanent memory guidance; resetting it does not delete souls or sessions. These markdown documents are browser-stored, not host filesystem files.

IndexedDB is local to this browser profile and site origin. Clearing site data removes sessions; private browsing, storage quota, crashes before the next snapshot or browser eviction can still lose data. A save failure is shown in Settings; requested persistent storage is best effort. This is not a cloud backup. Sessions can contain sensitive conversation/file/tool output, so protect your browser profile. Use one Jarvis tab per origin to avoid competing active-session updates.

### Images, souls and idle agents (`jarvis3.html`)

Settings uses a wider, responsive dialog with a vertical tab menu for Main LLM, Voice, Sub-agents, Souls & Memory, Code Agent, Skills, and MCP Servers. Close/Save stay visible while the selected section scrolls.

Agents can add single images or image sliders to GUI panels. Click an image to enlarge it in a modal; use previous/next controls or Left/Right arrows to navigate and Escape to close. Images accept HTTP(S), relative URLs and allowlisted raster data URLs. Remote images make browser requests to their hosts.

**Settings → SOUL.md** contains the main agent's persistent markdown identity and memory. It is attached to every main-agent request, separately from the system prompt. Soul edits save immediately. Agents can read their own `soul()` and persist a replacement with `update_soul(markdown)` or append with `update_soul(markdown, true)`.

Saved sub-agent soul profiles have a name, markdown soul, unlimited-step option and an optional **Load idle on page open** setting. **LOAD IDLE** creates the hologram without sending an LLM request; give it a task through its message box or ask Jarvis to tell it what to do. The **NEW AGENT** form also accepts a soul without a task. A task and soul are both optional: an agent with neither starts idle, with no initial LLM request. The main agent can specify an exact model ID using `spawn_agent("Coder", "Task", {model: "model-id"})` or `[[agent Coder | Task | model-id]]`. Without a model override, new agents use the sub-agent default, falling back to the main model. `spawn_agent("Helper")` or `[[agent Helper]]` creates an idle agent. An existing running agent must be stopped before its model is changed, or a separate agent can be created with `force:true`. Saved profiles survive reloads; session state and conversation histories are restored separately from IndexedDB, with active tasks paused rather than automatically resumed.

Each sub-agent's expanded controls have a **LIMITED / UNLIMITED** toggle. Unlimited removes the step cap across runs, not completion, failure or Stop behavior. It can incur ongoing API costs. Agents can use `idle()` to wait without polling, and `done(summary)` to finish. From agent JavaScript, `spawn_agent(name, goal, {soul, unlimited:true, idle:true})` can create a soul-first idle agent.

Agents can call `await reset_hologram_setting()` to restore their own hologram, or pass `"main"` or an agent name/id. `await hologram(target).reset()` is equivalent. Reset restores position, radius, colors and labels; main reset also restores the floor, while sub-agent reset restores its spawn slot, original palette and automatic radius.

Souls are stored only in this browser's `localStorage`, not as host files, and sent to the configured LLM provider. Do not put secrets in them. Agents are instructed to remember durable preferences and important facts rather than transient output or untrusted instructions; review their memories in Settings.

### Optional host coding agent (`jarvis3.html`)

Requires [Bun](https://bun.sh). The static site and Python server cannot run host tools.

```sh
JARVIS_CODE_AGENT=1 bun server.ts
```

Open **http://localhost:3000**, then enable **Settings → Code Agent → Enable host coding tools**. The toggle saves immediately and applies to both main and sub-agents. Both the server flag and browser toggle must be enabled. Start with `bun server.ts` (without the flag) to disable the backend entirely.

The default workspace is this project directory. To use another existing directory:

```sh
JARVIS_CODE_AGENT=1 JARVIS_CODE_ROOT=/absolute/path/to/workspace bun server.ts
```

Agents can list/read/write/edit/delete files and execute Bash through same-origin `/api/code` requests. File tools reject paths and symlinks outside the workspace; write parents must exist and edits require a unique exact match. Limits: 1 MiB per file, 2 MiB per request, 1,000 listing entries, 256 KiB shell output, and a 30-second default shell timeout (120 seconds maximum).

**This is trusted host access, not a sandbox.** Bash runs as the server user and can access files outside the workspace, the network, and inherited environment variables. Only enable for trusted tasks, ideally under a dedicated OS user or container; keep backups/version control. There is no per-command approval dialog. Disabling the browser toggle blocks new tool calls and aborts active requests (shell process-group termination is best effort); it cannot undo completed file changes or guarantee all descendants stop. The server binds to loopback and rejects foreign Host/Origin headers; do not expose or reverse-proxy this endpoint publicly.

File contents and command output can be included in prompts sent to your configured LLM provider. Do not expose secrets to the agents.

Backend tests:

```sh
bun test ./code-agent.test.ts --timeout 10000
```

## Deploy to GitHub Pages

The workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys pushes to `main`.

```sh
python3 scripts/build-pages.py
```

The build creates `dist/`, uses `jarvis.html` as the site's `index.html`, and copies model/runtime assets while excluding Python environments and download caches. Configure the repository's **Settings → Pages → Source** as **GitHub Actions**.

## Privacy and API keys

Settings, including your API key, are stored in this browser's `localStorage`. The static app has no backend or server-side secret storage. The optional Bun server for `jarvis3.html` provides an MCP proxy and opt-in host coding tools; LLM credentials remain in the browser. Use your own restricted key, avoid shared devices, and never commit credentials. Your configured endpoint must allow requests from the app's origin through CORS.

Speech sent through browser recognition is subject to the browser provider's policies. Whistle processes speech locally; LLM prompts and conversation messages are sent to your configured endpoint.

## Third-party software and models

This project uses [PixiJS](https://pixijs.com/), [Phonon TTS](https://github.com/gradium-ai/xn-ptts/tree/main/ptts-wasm), [Whistle WebGPU](https://huggingface.co/spaces/mrfakename/whistle-webgpu), and [ONNX Runtime](https://onnxruntime.ai/).

Phonon 31m model weights are Apache 2.0. Vendored Phonon runtime license notices are included in `vendor/phonon-tts/`. Consult upstream licenses for the voice catalog and other bundled assets before redistributing them.
