---
title: "Reference"
description: "Config cheat sheet, tool groups, plugins, gotchas, useful commands."
weight: 100
---

Config cheat sheet, tool list, chat commands, gotchas, and useful commands.

---

## Tool List

| Tool | Description |
|------|-------------|
| `exec` | Execute shell commands |
| `bash` | Bash shell access |
| `process` | Process management (spawn, kill) |
| `read` | Read files |
| `write` | Write/create files |
| `edit` | Edit existing files |
| `apply_patch` | Apply unified diffs |
| `web_search` | Search the web (Brave/Perplexity) |
| `web_fetch` | Fetch URL content |
| `browser` | Browser automation (Playwright) |
| `canvas` | Interactive artifact rendering |
| `sessions_list` | List active sessions |
| `sessions_history` | Read session history |
| `sessions_send` | Delegate work to another agent's session (agent-to-agent); NOT for message relay — use `message` with explicit `target` instead |
| `sessions_spawn` | Spawn background sub-agent task |
| `session_status` | Check session status |
| `memory_search` | Semantic/hybrid search across memory files. Requires `memorySearch` config. See [Phase 2](phases/phase-2-memory.md) |
| `memory_get` | Retrieve a specific memory entry by date or path |
| `message` | Send messages to channels. With explicit `target` (JID/phone/channel ID), sends directly to any chat regardless of current session — the right tool for proactive group delivery |
| `cron` | Schedule recurring tasks |
| `gateway` | Gateway control (restart, config, status) |
| `nodes` | Remote node operations |
| `generate_image` | Generate images from text prompts (image-gen plugin) |
| `vm_screenshot` | Capture VM screen as PNG image (computer-use plugin) |
| `vm_exec` | Run shell command inside Lume VM (computer-use plugin) |
| `vm_click` | Click at screen coordinates in VM (computer-use plugin) |
| `vm_type` | Type text into focused VM application (computer-use plugin) |
| `vm_key` | Press key or key combination in VM (computer-use plugin) |
| `vm_launch` | Launch macOS application in VM (computer-use plugin) |
| `vm_scroll` | Scroll screen up or down in VM (computer-use plugin) |

---

## Tool Groups

| Group | Tools |
|-------|-------|
| `group:runtime` | `exec`, `bash`, `process` |
| `group:fs` | `read`, `write`, `edit`, `apply_patch` |
| `group:sessions` | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `subagents`, `session_status` |
| `group:memory` | `memory_search`, `memory_get` |
| `group:web` | `web_search`, `web_fetch` |
| `group:ui` | `browser`, `canvas` |
| `group:automation` | `cron`, `gateway` — can be used individually: deny `gateway` while keeping `cron` for conversational job management |
| `group:messaging` | `message` |
| `group:nodes` | `nodes` |
| `group:openclaw` | All built-in tools |

> **Version note:** `group:memory` is not recognized by the gateway in v2026.2.15. Use individual tools (`memory_search`, `memory_get`) in tool allow/deny lists until this is fixed upstream.

---

## Config Quick Reference

### Most Important Keys

```json5
{
  // Agent definitions
  agents: {
    defaults: {
      sandbox: { mode: "off|non-main|all" },
      memorySearch: {
        enabled: true, provider: "local",
        // fallback: "none",              // Don't fall back to remote on local failure
        query: {
          hybrid: {
            enabled: true, vectorWeight: 0.7, textWeight: 0.3,
            // mmr: { enabled: true, lambda: 0.7 }  // Deduplicate similar results
          },
        },
        // temporalDecay: { enabled: true, halfLifeDays: 30 },
        cache: { enabled: true, maxEntries: 50000 }
      },
      compaction: { memoryFlush: { enabled: true, softThresholdTokens: 4000 } },
      subagents: {
        maxConcurrent: 8,
        // maxSpawnDepth: 3,           // Max nesting depth for nested sub-agents (added 2026.2.16)
        // maxChildrenPerAgent: 10,    // Max concurrent children per parent agent (added 2026.2.16)
      }
    },
    list: [{
      id: "main", default: true, workspace: "...",
      tools: { deny: [] },
      subagents: { allowAgents: ["search"] }
    }]
  },

  // Channel routing
  bindings: [{ agentId: "...", match: { channel: "..." } }],

  // Chat commands
  commands: { bash: false, config: false, debug: false, restart: false },

  // Tool restrictions
  tools: {
    profile: "full",   // Shorthand: "minimal" | "coding" | "messaging" | "full"
    deny: [],
    elevated: { enabled: false },
    exec: { host: "sandbox" },  // Route exec to sandbox container (when sandbox.mode: "all")
    web: { search: { enabled: true, provider: "brave", apiKey: "..." } },
    agentToAgent: { enabled: false, allow: [], maxPingPongTurns: 2 }
  },

  // Skills
  skills: { allowBundled: ["coding-agent", "github", "healthcheck"] },

  // Session isolation
  session: { dmScope: "per-channel-peer" },

  // Channel config
  channels: {
    whatsapp: { dmPolicy: "pairing", allowFrom: [], groupPolicy: "allowlist", groups: { "*": { requireMention: true } } },
    signal: { enabled: true, account: "+...", cliPath: "signal-cli", dmPolicy: "pairing" },
    googlechat: { enabled: true, serviceAccountFile: "...", audienceType: "app-url", audience: "https://..." }
  },

  // Gateway (mode: "local" required for startup)
  gateway: { mode: "local", bind: "loopback", port: 18789, auth: { mode: "token", token: "..." }, reload: { mode: "auto" } },

  // Network discovery
  discovery: { mdns: { mode: "minimal" } },

  // Plugin allowlist
  plugins: { allow: ["whatsapp", "channel-guard", "content-guard"] },

  // Logging
  logging: { redactSensitive: "tools" },

  // Cron — scheduled tasks (added 2026.2.16: webhookToken, notify)
  cron: {
    // webhookToken: "...",          // Auth token for external cron webhook triggers
    // notify: { channel: "whatsapp", peer: "+..." },  // Deliver cron output to a channel
    jobs: [/* ... */]
  }
}
```

### DM Policy Options

| Value | Behavior |
|-------|----------|
| `pairing` | Unknown senders get 8-char code (expires 1hr) |
| `allowlist` | Only pre-approved senders |
| `open` | Anyone (requires `allowFrom: ["*"]`) |
| `disabled` | Ignore all DMs |

### Group Policy & Mention Gating

Group messages are evaluated in three layers:

1. **`groupPolicy`** — top-level gate at channel root
2. **Group allowlists** — `groups` keys, `groupAllowFrom`
3. **Mention gating** — `requireMention` inside `groups`, `/activation` command

| `groupPolicy` | Behavior |
|----------------|----------|
| `allowlist` | Only groups listed in `groups` or `groupAllowFrom` (default) |
| `open` | All groups allowed; mention gating still applies |
| `disabled` | Block all group messages |

#### The `groups` object

Keys are group IDs (or `"*"` for all groups). Values configure per-group behavior. **Keys double as an allowlist** — a group ID present as a key is implicitly allowed.

`requireMention` **must** be inside the `groups` object — see [gotcha #14](#channels) for details and per-channel notes.

```json5
{
  channels: {
    whatsapp: {
      groupPolicy: "allowlist",
      groups: {
        "*": { requireMention: true },                        // Default: all groups, mention-gated
        "120363XXX@g.us": { requireMention: false },          // Specific group: always respond
        "120363YYY@g.us": { tools: { deny: ["exec"] } }      // Per-group tool restrictions
      }
    }
  }
}
```

#### Mention patterns

WhatsApp uses native @mention data (`mentionedJids`). Google Chat uses native @mention data (when `botUser` is configured). Signal and other channels without native mentions need regex patterns:

```json5
{
  agents: {
    list: [{
      id: "signal",
      groupChat: {
        mentionPatterns: ["@openclaw", "hey openclaw"]  // Case-insensitive regexes
      }
    }]
  }
}
```

Global fallback (all agents/channels): `messages.groupChat.mentionPatterns`.

Replying to a bot message counts as an implicit mention on WhatsApp, Google Chat, Telegram, Slack, Discord, and Teams.

#### Common patterns

| Goal | Config |
|------|--------|
| All groups, mention-gated | `groups: { "*": { requireMention: true } }` |
| Specific groups only | `groups: { "<jid>": { requireMention: true } }` (no `"*"` key) |
| Disable all groups | `groupPolicy: "disabled"` |
| All groups, always respond | `groups: { "*": { requireMention: false } }` |
| Sender allowlist in groups | `groupAllowFrom: ["+1555..."]` |

### Session Scope Options

See [Session Management](sessions.md) for the full deep-dive on session keys, lifecycle, compaction, and pruning.

| Value | Behavior |
|-------|----------|
| `main` | All DMs share one session |
| `per-peer` | One session per sender (across channels) |
| `per-channel-peer` | One session per sender per channel (recommended) |
| `per-account-channel-peer` | Most isolated |

### Sandbox Modes

| Mode | Behavior |
|------|----------|
| `off` | No sandboxing — all sessions run on host |
| `non-main` | Only the `agent:<id>:main` session runs unsandboxed; all other sessions sandboxed |
| `all` | Every session sandboxed |

Any other value (e.g. `"tools"`) is **invalid** — causes config validation failure and a gateway crash loop.

**What counts as "non-main":** WhatsApp DMs, group sessions, cron runs, and subagent sessions all have session keys that don't match `agent:<id>:main`. They are all sandboxed with `mode: "non-main"`. Only the Control UI / CLI main session runs unsandboxed.

### Default Sandbox Tool Allow List

When a session is sandboxed, a separate tool policy applies — **distinct from and in addition to** the agent-level tool policy.

**Default allow:** `exec`, `process`, `read`, `write`, `edit`, `apply_patch`, `image`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `subagents`, `session_status`

**Implicitly denied** (not in default allow): `message`, `browser`, `memory_search`, `memory_get`, `web_search`, `web_fetch`, `agents_list`

The default allow list is a **closed set** — a tool not listed is denied in sandboxed sessions, even if the agent-level policy allows it.

To add `message`, `browser`, or memory tools to sandboxed sessions (e.g., so a WhatsApp DM session can send to groups or access memory), override the allow list. This config goes at the global `tools` level (applies to all agents) or per-agent under `agents.list[].tools.sandbox.tools`:

```json
{
  "tools": {
    "sandbox": {
      "tools": {
        "allow": [
          "exec", "process", "read", "write", "edit", "apply_patch", "image",
          "sessions_list", "sessions_history", "sessions_send", "sessions_spawn",
          "subagents", "session_status",
          "message", "browser",
          "memory_search", "memory_get"
        ]
      }
    }
  }
}
```

**Gotchas:**
- `tools.sandbox.tools.alsoAllow` does **not** work with the default policy (`mergeAlsoAllowPolicy()` requires an explicit base `allow` array). Must use `allow` with the full list.
- `sandbox.tools` at agent level is **invalid** config. Correct path: `agents.list[].tools.sandbox.tools` (under the agent's `tools` key).
- Verify with: `openclaw sandbox explain --agent <id> --session "<session-key>"`

For sandbox architecture, container lifecycle, and config options, see [Architecture — Docker Sandbox Architecture](architecture.md#docker-sandbox-architecture).

### Sandbox Scope & Access Guide

Different agents need different sandbox configurations. Here's when to use each combination:

| Use Case | `scope` | `workspaceAccess` | `mode` | Rationale |
|----------|---------|-------------------|--------|-----------|
| Channel agents (whatsapp, signal) | `agent` | `rw` | `non-main` | Need workspace for memory writes; sandbox provides network isolation |
| Search agent | — | — | `off` | No filesystem tools; tool policy provides isolation. Unsandboxed to avoid [#9857](https://github.com/openclaw/openclaw/issues/9857) |
| Main agent ([recommended](examples/config.md)) | `agent` | `rw` | `non-main` | Channel sessions sandboxed on `network: "openclaw-egress"`; Control UI session on host (operator trusted). See [egress allowlisting](hardened-multi-agent.md) |
| Main agent (unsandboxed) | — | — | `off` | Operator interface; full host access (no Docker isolation) |
| Computer (optional [hardened variant](hardened-multi-agent.md)) | `agent` | `rw` | `all` | Separate exec + browser agent, `network: "openclaw-egress"` |
| Ephemeral tasks | `session` | `none` | `all` | Container destroyed when session ends; no persistent state |

### Config Includes (`$include`)

Split large configs into multiple files — useful for multi-agent setups:

```json5
{
  gateway: { port: 18789 },
  agents: { $include: "./agents.json5" },           // Single file: replaces
  broadcast: { $include: ["./a.json5", "./b.json5"] } // Array: deep-merged in order
}
```

Paths are relative to the including file. Nested includes supported (up to 10 levels).

### Config Validation

Config is **strictly validated** — unknown keys, malformed types, or invalid values cause the gateway to refuse to start. Run `openclaw doctor` to diagnose, `openclaw doctor --fix` to auto-repair.

### Environment Files

OpenClaw reads `.env` files (non-overriding) from: CWD `.env` → `~/.openclaw/.env` → config `env` block. Alternative to putting secrets in plist/systemd env vars.

---

## Tool Policy Precedence

OpenClaw applies tool restrictions in an 8-layer cascade:

| Layer | Source | Example |
|-------|--------|---------|
| 1 | Tool profile | `tools.profile: "coding"` |
| 2 | Provider tool profile | `tools.byProvider.anthropic.profile` |
| 3 | Global tool policy | `tools.deny: ["gateway"]` |
| 4 | Provider tool policy | `tools.byProvider.anthropic.deny` |
| 5 | Agent tool policy | `agents.list[].tools.deny: ["exec"]` |
| 6 | Agent provider policy | `agents.list[].tools.byProvider.anthropic.deny` |
| 7 | Sandbox tool policy | `tools.sandbox.tools` |
| 8 | Subagent tool policy | `tools.subagents.tools` |

**Critical:** Global deny (layer 3) overrides agent-level allow (layer 5). A tool in `tools.deny` **cannot** be re-enabled by an agent's `tools.allow`. For tools needed by some agents but not others (e.g., `web_search` for a search agent), deny per-agent instead of globally. See [Phase 5](phases/phase-5-web-search.md) for the correct isolation pattern.

**HTTP API tool restrictions:** When sessions are created via the HTTP API (`/api/v1/chat/completions`), OpenClaw additionally denies `sessions_spawn`, `sessions_send`, `gateway`, and `whatsapp_login` — regardless of agent tool policy. This is a platform-level safety fence for external API callers. It does not apply to embedded agent sessions (session key `agent:<id>:main`). Override with `gateway.tools.allow` if needed.

---

## Cron Jobs

### `sessionTarget`

Controls how the cron job executes.

| Value | Behavior |
|-------|----------|
| `"isolated"` | Fresh throwaway session per run. Agent receives a prompt, executes it, returns a response. Supports channel delivery via `delivery`. |
| `"main"` | Injects a short event into the agent's existing main session (`agent:<id>:main`). Appended to the ongoing conversation — agent has full prior context. Only supports `delivery.mode: "webhook"`. |

Use `"isolated"` for tasks ("search for news and write a report") — each run starts clean. Session key: `agent:main:cron:<job-id>:run:<uuid>`.

Use `"main"` for reminders and nudges ("you have a meeting in 10 minutes") — the event lands in the agent's running session with full context. Requires `payload.kind: "systemEvent"` with a `text` field.

### `wakeMode`

| Value | Behavior |
|-------|----------|
| `"now"` | Triggers an immediate heartbeat — job runs right away |
| `"next-heartbeat"` | Queues for the agent's next scheduled heartbeat cycle |

With `heartbeat.every: "30m"`, `"next-heartbeat"` can delay up to 30 minutes. Use `"now"` for time-sensitive jobs; `"next-heartbeat"` for jobs where a delay is acceptable.

### `delivery`

| Mode | Behavior |
|------|----------|
| `"announce"` | Agent's final response delivered to a channel. Requires `delivery.to` (e.g. WhatsApp group JID). Agent can reply `ANNOUNCE_SKIP` to suppress. |
| `"none"` | Job runs silently — no delivery. |
| `"webhook"` | POST result to an HTTP URL. Works with both `isolated` and `main`. |

When `delivery` is configured on isolated jobs, the runtime appends delivery instructions and **disables the `message` tool** (`disableMessageTool: true`) to prevent duplicate sends. The agent should not call `message` directly — the runtime delivers the final response automatically.

`delivery.bestEffort: true` — suppresses errors if delivery fails (e.g. WhatsApp disconnected).

### Cron and `group:automation`

`group:automation` expands to `["cron", "gateway"]`. These can be allowed/denied individually:

```json
{ "deny": ["gateway"] }          // deny gateway only — keeps cron for conversational job management
{ "allow": [..., "cron"] }       // allow cron explicitly in an allowlist config
```

Alternatives to the `cron` tool for job management: Control UI (web), `openclaw cron create/list/edit` CLI, or direct edit of `cron/jobs.json`.

---

## Chat Commands

Users can send `/` commands directly in WhatsApp or Signal chats. Commands must be sent as **standalone messages** (not inline with other text).

### Core Commands

| Command | What it does | Access |
|---------|-------------|--------|
| `/help` | List available commands | All authorized senders |
| `/reset` (`/new [model]`) | Fresh session; optionally switch model | All authorized |
| `/status` | Session info (model, tokens, cost) | All in DMs; owner-only in groups |
| `/whoami` | Show sender identity | All authorized |
| `/compact` | Compact message history | All authorized |
| `/stop` | Abort current operation | All authorized |
| `/activation mention\|always` | Toggle group mention gating | Owner-only |

### Directives (Session Modifiers)

Directives change session behavior. **Standalone** = persists to session. **Inline** in a normal message = one-shot hint, stripped before the model sees it.

| Directive | Controls |
|-----------|----------|
| `/think off\|low\|medium\|high` | Thinking/reasoning depth |
| `/elevated off\|on\|ask\|full` | Host execution mode (escapes sandbox) |
| `/model <name>` | Switch model mid-session |

### Dangerous Commands (Disabled by Default)

| Command | Config gate | Risk |
|---------|------------|------|
| `/bash <cmd>` or `! <cmd>` | `commands.bash: true` | Host shell access |
| `/config` | `commands.config: true` | Runtime config changes |
| `/debug` | `commands.debug: true` | Runtime overrides |
| `/restart` | `commands.restart: true` | Service disruption |

These are owner-only even when enabled. Tool policy still applies — `/elevated` can't override tools in `tools.deny`.

> **Full command reference:** [docs.openclaw.ai/tools/slash-commands](https://docs.openclaw.ai/tools/slash-commands)
>
> **Google Chat:** Slash commands work in Google Chat DMs and spaces. For Google Chat setup and known issues (e.g., DM routing), see [Google Chat Channel Setup](google-chat.md).

---

## Gotchas & Non-Obvious Behaviors

### Tool Policy

1. **`deny` always beats `allow`** at the same level. If a tool is in both lists, it's denied.

2. **`allow` is exclusive** — if `allow` is non-empty, everything not listed is blocked. An empty `allow` list means "allow everything not denied."

3. **Tool policy is a hard stop** — chat commands like `/exec` cannot override denied tools.

4. **Global `deny` overrides agent-level `allow`** — a tool in `tools.deny` cannot be re-enabled at the agent level. For tools needed by some agents (e.g., `web_search`), deny per-agent instead of globally.

5. **`profile: "full"` means no restrictions** — `tools.profile: "full"` expands to an empty allow/deny set, bypassing all profile-level filtering entirely. Unlike `"coding"` (which includes a curated allow list), `"full"` is a footgun: every tool is reachable unless explicitly denied. Prefer explicit `tools.allow` lists over `"full"` when you need broad access.

6. **`group:ui` deny includes `browser`** — if an agent allows `browser` but denies `group:ui`, browser is silently disabled. Deny `canvas` individually instead when browser should remain available.

7. **`exec` allowlists don't catch shell builtins** — allowlists match resolved binary paths only. Shell builtins (`cd`, `export`, `source`) bypass the check entirely. `echo` is both a shell builtin and a standalone binary (`/bin/echo`) — behavior differs between them, and the builtin version varies by shell. If this matters, deny `exec` at the agent level.

### Agents & Sessions

8. **Never share `agentDir` between agents** — causes auth collisions and session corruption.

9. **`MEMORY.md` loads in main sessions only** (not groups or shared contexts) — don't put security-critical instructions there.

10. **Binding precedence is most-specific wins** — a peer-level binding beats a channel-level one.

11. **`elevated` mode is per-session, not permanent** — but `tools.elevated.enabled: false` blocks it globally.

12. **Session transcripts contain full message history and tool output** — treat them as sensitive. Prune regularly if retention isn't needed.

### Channels

13. **Signal linked devices see everything** — the primary phone gets all bot messages. No filtering possible.

14. **`pairing` codes expire after 1 hour** with max 3 pending per channel.

15. **`requireMention` must be inside the `groups` object, not at channel root** — placing it at `channels.whatsapp.requireMention` causes a Zod validation error. Correct: `channels.whatsapp.groups: { "*": { requireMention: true } }`. On Signal, also configure `mentionPatterns` in `agents.list[].groupChat.mentionPatterns` (no native @mention support). On Google Chat, set `botUser` in the channel config for reliable mention detection in spaces.

16. **Google Chat DMs ignore agent bindings** ([#9198](https://github.com/openclaw/openclaw/issues/9198)) — DMs always route to the default agent regardless of `bindings` config. Space (group) routing works correctly. Critical for multi-agent setups.

17. **Google Chat requires both channel config and plugin** — missing either `channels.googlechat` or `plugins.entries.googlechat.enabled: true` causes a 405 error on the webhook endpoint.

18. **Google Chat per-space rate limit is 60/min** (1 write/sec) — the 600/min figure in some documentation applies only to data import operations, not normal messaging.

19. **Placeholder `allowFrom` values cause silent message drops** — `allowFrom: ["+46XXXXXXXXX"]` or any non-matching number silently drops all incoming messages with no error or log warning. Always replace placeholders with real phone numbers.

20. **Empty env vars cause config validation failure** — `${BRAVE_API_KEY}` as an empty string triggers `EX_CONFIG` (exit 78). Use a non-empty placeholder like `"not-configured"` for optional keys not yet provisioned.

### Sandbox & Docker

21. **Sandbox tool policy is a separate layer from agent tool policy** — even if an agent allows `message` or `browser`, those tools are blocked in sandboxed sessions unless explicitly listed in `tools.sandbox.tools.allow`. The default sandbox allow list does not include `message`, `browser`, `memory_search`, `memory_get`, or `web_fetch`. WhatsApp DM sessions (and all non-main sessions) are sandboxed with `mode: "non-main"` or `"all"`. Use `tools.sandbox.tools.allow` with the full list including any tools your sandboxed sessions need. `alsoAllow` does not work with the default policy — must specify the complete `allow` list.

22. **Sandbox image must be built before use** — the default `openclaw-sandbox:bookworm-slim` is raw `debian:bookworm-slim` with no packages. Run `cd $(npm root -g)/openclaw && ./scripts/sandbox-setup.sh` before enabling Docker sandboxing. Without this, all exec calls inside the sandbox fail (`sh: 1: git: not found`).

23. **`exec host not allowed` when sandboxed** — exec calls targeting the gateway host fail with `exec host not allowed (requested gateway; configure tools.exec.host=sandbox to allow)`. Add `"tools": { "exec": { "host": "sandbox" } }` to route exec to the sandbox container by default. With `mode: "non-main"` (recommended), this only affects sandboxed sessions (channel DMs/groups/cron) — the Control UI session runs on host and exec goes to host naturally. With `mode: "all"`, the Control UI session is also sandboxed and all exec calls hit this. Prefer `mode: "non-main"` — the operator's Control UI session should run on host.

24. **Sandbox `network: "none"` blocks package installs** — `setupCommand` requires `network: "bridge"` and `readOnlyRoot: false`, which weakens sandbox isolation. Prefer [custom images](custom-sandbox-images.md) for production — tools are pre-installed, so secure defaults are preserved.

25. **Bind mounts pierce sandbox filesystem** — always use `:ro` suffix. Never bind `docker.sock`.

### Cron

26. **`delivery.to` not `delivery.target`** — the cron delivery destination field is `delivery.to` (e.g. a WhatsApp group JID). The field `delivery.target` does not exist — using it silently delivers to the wrong destination (DM instead of group). Always use `delivery.to`.

27. **`--announce` (delivery mode) requires a channel** — creating a cron job with `openclaw cron add --announce` but no `--channel` succeeds at creation time, but every run fails at the delivery step with `cron delivery target is missing`. The error repeats every run and clutters logs. Always pair `--announce` with `--channel <whatsapp|signal>` (and a peer if required by your dmPolicy). If there is nothing to report, have the agent reply `ANNOUNCE_SKIP` to suppress delivery.

### Config & Gateway

28. **`gateway.mode` is required** — the gateway refuses to start unless `gateway.mode: "local"` is set in config. Use `--allow-unconfigured` for ad-hoc/dev runs.

29. **Config validation is strict** — unknown keys, malformed types, or invalid values cause the gateway to refuse to start. Run `openclaw doctor` to diagnose.

30. **Environment variable substitution only matches `[A-Z_][A-Z0-9_]*`** — lowercase vars won't resolve. Missing vars throw errors at config load.

31. **`openclaw gateway stop/restart` works with LaunchAgent but not LaunchDaemon** — OpenClaw's built-in gateway commands (`openclaw gateway stop`, `openclaw gateway restart`) manage LaunchAgents (`gui/<uid>` domain) and systemd user services. The default LaunchAgent setup works with these commands. If you use the hardened **LaunchDaemon** alternative (`system` domain) or systemd **system** service, these commands won't find it — use `launchctl bootout`/`bootstrap` or `systemctl restart` directly. Additionally, `KeepAlive: true` (launchd) or `Restart=always` (systemd) causes the service manager to immediately respawn a killed process, which can race with OpenClaw's own restart logic.

### Plugins

32. **Plugin changes require a gateway restart** — plugin source files (`.ts`) are loaded at startup. Config hot-reload does NOT reload plugins. After updating a plugin in `~/.openclaw/extensions/`, restart the gateway.

33. **Broken tool results poison session history** — if a plugin returns malformed content blocks (wrong format, missing fields), the broken entry persists in the session `.jsonl` file. Every subsequent message replays it, causing the same error even after the plugin is fixed. **Fix:** delete the affected session file. Identify it by grepping for the error pattern, then remove:

    ```bash
    # Find sessions with broken image blocks (example)
    grep -l 'media_type' ~/.openclaw/agents/*/sessions/*.jsonl
    # Delete the affected session file — next message creates a fresh one
    ```

34. **Image content blocks are model-visible only** — tool result image blocks let the LLM see the image but are NOT forwarded as media to channels. To deliver images via WhatsApp/Signal/Google Chat, include a `MEDIA:<path>` directive in a text content block. OpenClaw's `splitMediaFromOutput()` scans text for these directives and attaches matching files as media.

35. **OpenClaw uses a flat image content block format** — `{type: "image", data: "<base64>", mimeType: "image/png"}`. This differs from the Anthropic API format (`{type: "image", source: {type: "base64", media_type, data}}`). Plugins must use the flat format; OpenClaw converts to API format before sending to the LLM.

36. **`plugins.allow` and `enabled: false` are independent checks** — both must pass for a plugin to load. A plugin in `plugins.allow` with `"enabled": false` is fully blocked: the file is never imported, `register()` is never called. Check precedence: `deny` → `allow` → `enabled`. You can safely pre-populate `plugins.allow` with trusted plugin IDs and control which ones actually load via `enabled`.

37. **Plugin tools are available by default** — enabling a plugin that registers tools (image-gen → `generate_image`, computer-use → `vm_*`) makes those tools callable by any agent not blocking them. Agents using `tools.allow` are safe (unlisted tools are blocked). Agents using only `tools.deny` must explicitly deny plugin tools they shouldn't have.

38. **Plugin-generated temp files accumulate** — plugins that save images via `MEDIA:` pattern write to `$TMPDIR`. macOS clears `/tmp` on reboot, but long-running servers accumulate files. Consider a cron job: `find /tmp/openclaw-image-gen -mtime +1 -delete`.

### Memory

39. **Remote memory search providers need a separate API key** — the embedding key (e.g., `OPENAI_API_KEY` for OpenAI embeddings) is not the same as your AI provider key (`ANTHROPIC_API_KEY`). Both must be set.

40. **Local memory search requires native build approval** — run `npx pnpm approve-builds` then `npx pnpm rebuild node-llama-cpp` (from the OpenClaw install directory). Without this, `memory_search` falls back to a remote provider (if configured) or returns no results.

41. **Memory search auto-reindexes on provider/model change** — OpenClaw tracks the embedding provider, model, and chunking params in the index. Changing any of these triggers an automatic reindex. Run `openclaw memory index` to force an immediate rebuild.

42. **Daily memory files are auto-loaded for today + yesterday only** — older files are only accessible via `memory_search`. If search isn't configured, the agent can't recall anything beyond yesterday.

---

## Version Compatibility

Features below require the listed version or later. Check yours with `openclaw --version`.

| Version | Feature | Details |
|---------|---------|---------|
| 2026.1.29 | Control UI token fix | Security vulnerability (CVSS 8.8) patched — update immediately. See [Phase 3](phases/phase-3-security.md) |
| 2026.2.1 | `before_tool_call` hook | Required for [content-guard](phases/phase-5-web-search.md#advanced-prompt-injection-guard) and network-guard plugins |
| 2026.2.3-1 | Security audit baseline | Version used in the [worked audit example](examples/security-audit.md) |
| 2026.2.9 | xAI (Grok) provider | New [search provider option](phases/phase-5-web-search.md#search-providers) |
| 2026.2.12 | Channel bindings regression | [#15176](https://github.com/openclaw/openclaw/pull/15176) — bindings to non-default agents broken. Not relevant for recommended 2-agent config (all channels route to main) |
| 2026.2.15 | `sessions_spawn` sandbox bug | [#9857](https://github.com/openclaw/openclaw/issues/9857) — `sessions_spawn` breaks when both agents are sandboxed with per-agent tools. Workaround: run search agent unsandboxed |
| 2026.2.16 | Security hardening + plugin hooks + subagent limits | CSP enforcement, workspace path sanitization, `web_fetch` response size cap (`tools.web.fetch.maxResponseBytes`, default 5 MB), dangerous Docker config rejection, `llm_input`/`llm_output` plugin hooks, `maxSpawnDepth`/`maxChildrenPerAgent` for nested subagents, Unicode-aware FTS, timezone-aware memory dates, per-agent QMD scoping, Telegram token auto-redaction |

---

## Plugins

| Plugin | Purpose | Required env var |
|--------|---------|-----------------|
| `whatsapp` | WhatsApp channel (bundled) | — |
| `signal` | Signal channel (bundled) | — |
| `googlechat` | Google Chat channel (bundled) | `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` |
| `content-guard` | LLM-based injection scanning at sessions_send boundary (search→main) | `OPENROUTER_API_KEY` |
| `channel-guard` | Inbound message injection scanning for WhatsApp/Signal/Google Chat | — (local ONNX model) |
| `file-guard` | Path-based file access protection (no_access, read_only, no_delete) | — (deterministic) |
| `network-guard` | Application-level domain allowlisting for network tool calls | — (deterministic, no model) |
| `command-guard` | Regex-based dangerous command blocking | — (no external deps) |
| `image-gen` | Generate images from text prompts via OpenRouter | `OPENROUTER_API_KEY` |
| `computer-use` | VM computer interaction (Lume) | — (WebSocket to cua-computer-server) |

The `content-guard` plugin intercepts `sessions_send` calls at the search→main trust boundary, classifying message content for prompt injection using an LLM (claude-haiku-4-5 via OpenRouter). It identifies search-agent traffic by the `params.sessionKey` of the `sessions_send` call (sessions targeting `agent:search:*`); all other `sessions_send` calls (e.g. proactive group delivery) are skipped without scanning. Note: `event.agentId` is not populated by the runtime for `before_tool_call` events — rely on `params.sessionKey` for caller identification. The `channel-guard` plugin scans incoming WhatsApp/Signal/Google Chat messages before agent processing using a local DeBERTa ONNX model, fail-closed by default (`failOpen: false`). Both are included in the [recommended configuration](examples/config.md).

The `file-guard`, `network-guard`, and `command-guard` plugins provide deterministic enforcement — no ML model, no external dependencies. `file-guard` enforces path-based file protection with three levels (no_access, read_only, no_delete). `network-guard` enforces application-level domain allowlisting for `web_fetch` and `exec` tool calls. `command-guard` blocks dangerous shell commands (rm -rf, fork bombs, force push, etc.) via regex. All three are included in the [hardened multi-agent](hardened-multi-agent.md) configuration and can optionally be added to any deployment. See [Phase 5](phases/phase-5-web-search.md#additional-hardening-guards) for overview and the [extension docs](extensions/) for full configuration.

### Plugin Hooks

Plugins can register handlers for these lifecycle hooks:

| Hook | When it fires | Example use |
|------|--------------|-------------|
| `before_tool_call` | Before a tool executes | content-guard: classify sessions_send content |
| `message_received` | Incoming channel message (WhatsApp/Signal/Google Chat) | channel-guard: scan for injection |
| `llm_input` | Before prompt is sent to the model (added 2026.2.16) | Input logging, token counting, content filtering |
| `llm_output` | After model response received (added 2026.2.16) | Output logging, response filtering, compliance checks |

> **Note:** `after_tool_result` is [not yet wired](https://github.com/openclaw/openclaw/issues/6535) — `before_tool_call` + pre-fetch is the current workaround for content scanning.

The `image-gen` plugin registers a `generate_image` tool that agents can call to create images from text prompts. Uses OpenRouter's unified API — supports FLUX, Gemini, GPT, and Sourceful models. See [extensions/image-gen/](extensions/image-gen.md) for source.

The `computer-use` plugin registers 7 `vm_*` tools for controlling a macOS Lume VM via WebSocket connection to `cua-computer-server`. Requires Apple Silicon Mac with Lume. See [extensions/computer-use/](extensions/computer-use.md) for setup and [Phase 8](phases/phase-8-computer-use.md) for deployment.

### Plugin Installation

Plugin directories must be named to match the **manifest ID** in `openclaw.plugin.json` (e.g., `content-guard/`, not `openclaw-content-guard/`). The `name` field in `package.json` should also match the manifest ID.

**Manual installation** (recommended — `openclaw plugins install` may fail to resolve dependencies or link manifests correctly; see the [OpenClaw changelog](https://docs.openclaw.ai) for current plugin CLI status):
```bash
cp -r extensions/content-guard ~/.openclaw/extensions/content-guard
cp -r extensions/channel-guard ~/.openclaw/extensions/channel-guard
```

The gateway discovers plugins from `~/.openclaw/extensions/` at startup. Each plugin directory must contain `openclaw.plugin.json`. **Plugin code is loaded once at startup** — changes to deployed plugins require a gateway restart (config hot-reload does NOT reload plugins).

> **Discovery precedence:** Plugins are discovered in order: workspace-level (`.openclaw/extensions/` in workspace), user-level (`~/.openclaw/extensions/`), then bundled. First match wins.

**CLI installation** (when available):
```bash
openclaw plugins install --link /path/to/plugin
```

```json5
// openclaw.json — plugins section
{
  plugins: {
    entries: {
      "content-guard": {
        enabled: true,
        config: {
          model: "anthropic/claude-haiku-4-5",
          maxContentLength: 50000, // Truncate content sent to model
          timeoutMs: 15000,      // Classification timeout
        }
      },
      "channel-guard": {
        enabled: true,
        config: {
          failOpen: false,       // Block messages if model unavailable
          sensitivity: 0.5,      // Detection threshold (0.0–1.0)
          warnThreshold: 0.4,    // Score to inject advisory
          blockThreshold: 0.8    // Score to hard-block message
        }
      },
      "image-gen": {
        enabled: true,
        config: {
          apiKey: "${OPENROUTER_API_KEY}",
          defaultModel: "openai/gpt-5-image-mini",
          defaultAspectRatio: "1:1",
          defaultImageSize: "2K",
          timeoutMs: 60000
        }
      }
    }
  }
}
```

---

## Useful Commands

```bash
# Setup & channels
openclaw setup                              # First-time setup (creates ~/.openclaw/)
openclaw channels login                     # Link a channel (QR code for WhatsApp)
openclaw channels login --account <id>      # Link a specific account
openclaw channels logout                    # Unlink channel

# Gateway management (foreground / LaunchAgent)
openclaw start                              # Start gateway in foreground
openclaw health                             # Gateway health check
openclaw status                             # Gateway status
openclaw dashboard                          # Open browser UI
openclaw logs                               # View logs

# Gateway management — LaunchDaemon (macOS) / systemd (Linux)
# scripts/docker-isolation/gateway.sh wraps these for both platforms + multi-instance
bash scripts/gateway.sh start    [instance]  # Start
bash scripts/gateway.sh stop     [instance]  # Stop
bash scripts/gateway.sh restart  [instance]  # Restart
bash scripts/gateway.sh status   [instance]  # Status
bash scripts/gateway.sh reload   [instance]  # Reload config (SIGUSR1, no restart)
bash scripts/gateway.sh logs     <instance>  # Tail logs (instance required for multi)

# Diagnostics & security
openclaw doctor                             # Diagnose config issues
openclaw doctor --fix                       # Auto-apply config migrations/repairs
openclaw doctor --generate-gateway-token    # Generate a secure token
openclaw security audit                     # Security scan
openclaw security audit --deep              # Deep scan (requires running gateway)
openclaw security audit --fix               # Auto-apply safe guardrails

# Memory
openclaw memory status                      # Index size, provider, last indexed
openclaw memory status --deep               # Probe vector + embedding availability
openclaw memory status --deep --index       # Reindex if store is dirty
openclaw memory index                       # Build/rebuild search index
openclaw memory index --agent <id>          # Rebuild index for specific agent
openclaw memory search "<query>"            # Search memory from terminal

# Session management
openclaw sessions list                      # List active sessions
openclaw sessions reset                     # Reset all sessions

# Pairing
openclaw pairing list <channel>             # List pending pairing requests
openclaw pairing approve <channel> <code>   # Approve a pairing code

# Updates
openclaw update                                # Built-in updater
curl -fsSL https://openclaw.ai/install.sh | bash  # Alternative: install script
```

---

## Links

### Official

- [Official Docs](https://docs.openclaw.ai)
- [Security](https://docs.openclaw.ai/gateway/security)
- [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [Sandbox vs Tool Policy vs Elevated](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated)
- [Multi-Agent](https://docs.openclaw.ai/concepts/multi-agent)
- [Configuration](https://docs.openclaw.ai/gateway/configuration-reference)
- [Signal Channel](https://docs.openclaw.ai/channels/signal/)
- [Groups](https://docs.openclaw.ai/channels/groups)
- [WhatsApp Channel](https://docs.openclaw.ai/channels/whatsapp)
- [Google Chat Channel](https://docs.openclaw.ai/channels/googlechat)
