# Luma

**Talk, build, and delegate in a living holographic workspace.**

A local-first voice assistant with interactive visuals, specialized agents, and persistent memory—powered by your choice of OpenAI-compatible model provider.

## ✨ Features

- 🎙️ **Voice conversations** — streaming replies, local Phonon speech synthesis, and optional Whistle speech recognition.
- 🤝 **Multi-agent collaboration** — delegate tasks to specialized agents with independent roles, voices, and holograms.
- 🌌 **Interactive workspace** — create and script objects, panels, widgets, and controls in a holographic scene.
- 🧠 **Persistent memory** — saved sessions, conversation history, editable soul profiles, and a browsable factual memory graph.
- 🔌 **Your models and integrations** — OpenAI-compatible endpoints, MCP servers, skills, and Pi extensions.
- 🛠️ **Optional coding access** — let trusted agents inspect files, make edits, and run shell commands.

## 🧰 Agent tools

| Tools | Purpose |
| --- | --- |
| `manage_agents` | Spawn, message, inspect, pause, and resume agents |
| `scene_execute`, `scene_status`, `scene_api` | Build interactive scenes, inspect command results, and read the scene API |
| `graph_memory` | Store, search, and manage factual memories |
| `soul_memory` | Read and update agent identity and instructions |
| `session_history`, `tool_history` | Explore saved conversations and audited tool activity |
| `read`, `write`, `edit`, `grep`, `find`, `ls`, `bash` | Work with host files and commands when coding access is enabled |
| MCP tools, code mode, and tool search | Discover and use connected integrations through Pi |

Tool availability depends on the active agent, session, and enabled settings. Host tools are powerful—review the safety notes below before enabling them.

## Get started

Install [Bun](https://bun.sh), then:

```sh
git clone https://github.com/amirrezasalimi/luma.git
cd luma
bun install
bun run dev
```

Open **http://localhost:3000**, configure your endpoint, API key, and model in **Settings**, then tap the sphere and allow microphone access.

Speech models are bundled, so the download is substantial.

## Controls

| Action | Control |
| --- | --- |
| Start or stop listening | Tap the sphere |
| Mute microphone | `M` |
| Cancel the current turn | `Escape` |
| Rotate / pan / zoom | Drag / Shift-drag / scroll |
| New session | `N` |
| Diagnostics | `D` |

Keyboard shortcuts apply outside text fields. Manage agents, voices, integrations, and saved sessions in **Settings**.

## Privacy & host access

- Settings, API keys, conversations, and tool output are stored **unencrypted** in `data/luma.sqlite`. Protect the database and backups; they are ignored by Git.
- Prompts and tool results go to your configured model provider. Browser speech recognition may use a remote service; Whistle processes speech locally. Local-first does **not** mean fully offline.
- Host coding tools and local MCP servers run with your user permissions, **not in a sandbox**. Enable only trusted tools and keep the server private; this is a single-user application, not a public service.

Optional configuration: `PORT` changes the server port, `LUMA_DATABASE` selects the database, `LUMA_CODE_ROOT` sets the coding workspace, and `LUMA_LOCAL_MCP=0` disables local MCP execution. Enable coding tools in Settings; the workspace is not a security boundary.

## Development

```sh
bun run typecheck
bun run build
bun run start
```

Production requires the Bun server; static hosting alone is not supported.

Built with React, TanStack Start, PixiJS, oRPC, and Pi. Speech uses [Phonon TTS](https://github.com/gradium-ai/xn-ptts/tree/main/ptts-wasm) and [Whistle](https://huggingface.co/spaces/mrfakename/whistle-webgpu). See the [AI backend notes](src/server/services/AI_BACKEND.md), [graph memory notes](src/server/services/GRAPH_MEMORY.md), and vendored license notices for details.
