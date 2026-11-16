# Pi AI backend

Luma uses `@earendil-works/pi-coding-agent` in the Bun server for main chat,
sub-agent responses, and context summaries. Configure the existing endpoint,
API key, model, and reasoning settings as before. Endpoints must support
OpenAI-compatible chat completions; Pi is the agent runtime, not a hosted model.

The browser calls the typed `rpc.host.ai.chat` procedure through the existing
same-origin oRPC handler, protected by local-request validation. The procedure
returns an async iterator of typed text, tool-lifecycle and completion events.
oRPC owns network serialization/streaming. Main chat, sub-agents and summaries
consume the typed iterator directly, with no fetch/Response or hand-written SSE
compatibility layer. Errors propagate to the conversation UI, and cancellation
aborts the active Pi run. The handler uses oRPC's Signal Sync plugin so cancelling
the response stream also aborts the procedure signal.

Each request restores the supplied app history through an in-memory
`SessionManager`, then disposes its Pi session. Luma remains responsible for
conversation persistence, context selection/compaction, and scene scripts.
Pi's unrestricted default tools are disabled. With Code Agent enabled in Luma
settings, Pi runs native `luma_host`
tool calls through the host service with full filesystem access under the OS
user's permissions. Absolute paths can address files outside the workspace;
relative paths default to the workspace. File/output size and timeout limits remain.
Pi owns the tool-call/result loop within a request; scene actions and sub-agent
scheduling still belong to the browser. Shell access is trusted host execution,
not an OS sandbox. Summary requests never receive tools or third-party resources.

Set `LUMA_CODE_ROOT` to select the host workspace. The client supplies its
configured context capacity as `context_window`; `max_tokens` optionally controls
the output budget (default 16384, capped to the context capacity).

Model credentials remain request-scoped, with no Pi model-auth-file persistence.
Enabled user packages/extensions and skills load by default, alongside Pi's
built-in MCP, codemode and tool-search extensions with their session lifecycle.
Extensions execute arbitrary host-user code and are **not** constrained by the
Code Agent toggle. Summary requests remain isolated. Project context files,
prompt templates, and themes remain disabled. Resource settings are re-read for
each request; active requests retain their existing loadout. Interactive TUI-only
extensions may not work in the headless server. MCP settings edit Pi's native
`mcp.json` in the agent directory. Pi owns stdio/HTTP connections, authentication,
tool registration, execution and cleanup; there is no Luma MCP transport.
Legacy SQLite MCP entries are copied once without overwriting existing Pi names;
the original entries are retained as a backup. Changes apply to new requests.

The oRPC stream includes typed `pi` tool lifecycle/error events alongside `text`
and authoritative `complete` events. Main chat feeds text deltas to speech;
sub-agents and summaries wait for the completed text. Main and agent logs display
tool events. Tool results stay server-side instead of being sent to speech.

## Pi extension explorer

Settings → Pi Extensions browses the Extensions section of
`shaftoe/awesome-pi-coding-agent`. The backend fetches a bounded catalog and
caches parsed entries in memory for one hour, sharing concurrent fetches.
Search and status/source filtering happen server-side; clients receive 24 entries
per page and automatically load subsequent pages as the settings panel scrolls.
The cache resets when the server restarts. Installed state is read fresh rather
than cached for an hour.

Installation uses Pi's `DefaultPackageManager` in user scope (`getAgentDir()`,
including Pi's agent-directory override). Only catalog npm identifiers and
top-level GitHub repositories are installable directly; other links require
manual setup. Installing or enabling requires trust confirmation because
packages and their dependency installation can execute arbitrary host-user code.
This is the server user's Pi installation, not a remote browser user's machine.

Disable retains the package installation but suppresses all of its resources
in Pi settings. Original resource filters are saved in
`luma-disabled-packages.json` in the Pi agent directory and restored on enable.
Package mutations are serialized within the server process. Avoid concurrent
package edits from another Luma process or Pi configuration UI while applying
changes. Restart Pi or use `/reload` to load changed resources. Project-scoped
package overrides and individually installed extension files are not managed by
this tab. Luma loads enabled resources on the next conversation request.

Luma defaults npm's cache to `<Pi agent directory>/luma-npm-cache`, avoiding
permission problems from root-owned files in `~/.npm` without sudo or ownership
changes. Set `LUMA_PI_NPM_CACHE` to override; existing `npm_config_cache` or
`NPM_CONFIG_CACHE` is also respected. Pi inherits this via the server environment,
so other npm subprocesses launched by the same server inherit the cache too.
