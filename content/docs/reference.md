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
| `sessions_send` | Send message to another agent's session |
| `sessions_spawn` | Spawn background sub-agent task |
| `session_status` | Check session status |
| `memory_search` | Semantic/hybrid search across memory files. Requires `memorySearch` config. See [Phase 2](phases/phase-2-memory.md) |
| `memory_get` | Retrieve a specific memory entry by date or path |
| `message` | Send messages to channels |
| `cron` | Schedule recurring tasks |
| `gateway` | Gateway control (restart, config, status) |
| `nodes` | Remote node operations |
| `generate_image` | Generate images from text prompts (image-gen plugin) |

---

## Tool Groups

| Group | Tools |
|-------|-------|
| `group:runtime` | `exec`, `bash`, `process` |
| `group:fs` | `read`, `write`, `edit`, `apply_patch` |
| `group:sessions` | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status` |
| `group:memory` | `memory_search`, `memory_get` |
| `group:web` | `web_search`, `web_fetch` |
| `group:ui` | `browser`, `canvas` |
| `group:automation` | `cron`, `gateway` |
| `group:messaging` | `message` |
| `group:nodes` | `nodes` |
| `group:openclaw` | All built-in tools |

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
        query: { hybrid: { enabled: true, vectorWeight: 0.7, textWeight: 0.3 } },
        cache: { enabled: true, maxEntries: 50000 }
      },
      compaction: { memoryFlush: { enabled: true, softThresholdTokens: 4000 } }
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

  // Logging
  logging: { redactSensitive: "tools" }
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

`requireMention` **must** be inside the `groups` object — see [gotcha #13](#channels) for details and per-channel notes.

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
| `off` | All tools run on host |
| `non-main` | Only non-main sessions sandboxed |
| `all` | Everything sandboxed |

For detailed sandbox architecture, container lifecycle, and config options, see [Architecture — Docker Sandbox Architecture](architecture.md#docker-sandbox-architecture). For egress-allowlisted custom Docker networks, see [Hardened Multi-Agent](hardened-multi-agent.md).

### Sandbox Scope & Access Guide

Different agents need different sandbox configurations. Here's when to use each combination:

| Use Case | `scope` | `workspaceAccess` | `mode` | Rationale |
|----------|---------|-------------------|--------|-----------|
| Channel agents (whatsapp, signal) | `agent` | `rw` | `non-main` | Need workspace for memory writes; sandbox provides network isolation |
| Search agent | `agent` | `none` | `all` | No filesystem needed; always sandboxed for maximum isolation |
| Browser agent (Phase 5 pattern) | `agent` | `none` | `all` | No filesystem needed; needs network for browsing. Recommended: consolidate into computer agent |
| Main agent (standard) | — | — | `off` | Operator interface; needs full host access for exec delegation |
| Main agent ([hardened](hardened-multi-agent.md)) | `agent` | `rw` | `all` | No exec/web/browser, `network: none`; receives channel input, delegates to computer |
| Computer ([recommended](examples/config.md)) | `agent` | `rw` | `all` | Full exec + browser, `network: "none"` (default); optionally `"openclaw-egress"` with [egress allowlisting](hardened-multi-agent.md) |
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

5. **`exec` allowlists don't catch shell builtins** — allowlists match resolved binary paths only. Shell builtins (`cd`, `export`, `source`) bypass the check entirely. `echo` is both a shell builtin and a standalone binary (`/bin/echo`) — behavior differs between them, and the builtin version varies by shell. If this matters, deny `exec` at the agent level.

### Agents & Sessions

6. **Never share `agentDir` between agents** — causes auth collisions and session corruption.

7. **`MEMORY.md` loads in main sessions only** (not groups or shared contexts) — don't put security-critical instructions there.

8. **Binding precedence is most-specific wins** — a peer-level binding beats a channel-level one.

9. **`elevated` mode is per-session, not permanent** — but `tools.elevated.enabled: false` blocks it globally.

10. **Session transcripts contain full message history and tool output** — treat them as sensitive. Prune regularly if retention isn't needed.

### Channels

11. **Signal linked devices see everything** — the primary phone gets all bot messages. No filtering possible.

12. **`pairing` codes expire after 1 hour** with max 3 pending per channel.

13. **`requireMention` must be inside the `groups` object, not at channel root** — placing it at `channels.whatsapp.requireMention` causes a Zod validation error. Correct: `channels.whatsapp.groups: { "*": { requireMention: true } }`. On Signal, also configure `mentionPatterns` in `agents.list[].groupChat.mentionPatterns` (no native @mention support). On Google Chat, set `botUser` in the channel config for reliable mention detection in spaces.

14. **Google Chat DMs ignore agent bindings** ([#9198](https://github.com/openclaw/openclaw/issues/9198)) — DMs always route to the default agent regardless of `bindings` config. Space (group) routing works correctly. Critical for multi-agent setups.

15. **Google Chat requires both channel config and plugin** — missing either `channels.googlechat` or `plugins.entries.googlechat.enabled: true` causes a 405 error on the webhook endpoint.

16. **Google Chat per-space rate limit is 60/min** (1 write/sec) — the 600/min figure in some documentation applies only to data import operations, not normal messaging.

17. **Placeholder `allowFrom` values cause silent message drops** — `allowFrom: ["+46XXXXXXXXX"]` or any non-matching number silently drops all incoming messages with no error or log warning. Always replace placeholders with real phone numbers.

18. **Empty env vars cause config validation failure** — `${BRAVE_API_KEY}` as an empty string triggers `EX_CONFIG` (exit 78). Use a non-empty placeholder like `"not-configured"` for optional keys not yet provisioned.

### Sandbox & Docker

19. **Sandbox `network: "none"` blocks package installs** — if your `setupCommand` needs packages, set `network: "bridge"` for setup only.

20. **Bind mounts pierce sandbox filesystem** — always use `:ro` suffix. Never bind `docker.sock`.

### Config & Gateway

21. **`gateway.mode` is required** — the gateway refuses to start unless `gateway.mode: "local"` is set in config. Use `--allow-unconfigured` for ad-hoc/dev runs.

22. **Config validation is strict** — unknown keys, malformed types, or invalid values cause the gateway to refuse to start. Run `openclaw doctor` to diagnose.

23. **Environment variable substitution only matches `[A-Z_][A-Z0-9_]*`** — lowercase vars won't resolve. Missing vars throw errors at config load.

24. **`openclaw gateway stop/restart` targets user-level services only** — OpenClaw's built-in gateway commands (`openclaw gateway stop`, `openclaw gateway restart`, `openclaw onboard --install-daemon`) manage LaunchAgents (`gui/<uid>` domain) and systemd user services. If you run the gateway as a **LaunchDaemon** (`system` domain) or systemd **system** service, these commands won't find it. Always use `launchctl bootout`/`bootstrap` or `systemctl restart` directly. Additionally, `KeepAlive: true` (launchd) or `Restart=always` (systemd) causes the service manager to immediately respawn a killed process, which can race with OpenClaw's own restart logic.

### Plugins

25. **Plugin changes require a gateway restart** — plugin source files (`.ts`) are loaded at startup. Config hot-reload does NOT reload plugins. After updating a plugin in `~/.openclaw/extensions/`, restart the gateway.

26. **Broken tool results poison session history** — if a plugin returns malformed content blocks (wrong format, missing fields), the broken entry persists in the session `.jsonl` file. Every subsequent message replays it, causing the same error even after the plugin is fixed. **Fix:** delete the affected session file. Identify it by grepping for the error pattern, then remove:

    ```bash
    # Find sessions with broken image blocks (example)
    grep -l 'media_type' ~/.openclaw/agents/*/sessions/*.jsonl
    # Delete the affected session file — next message creates a fresh one
    ```

27. **Image content blocks are model-visible only** — tool result image blocks let the LLM see the image but are NOT forwarded as media to channels. To deliver images via WhatsApp/Signal/Google Chat, include a `MEDIA:<path>` directive in a text content block. OpenClaw's `splitMediaFromOutput()` scans text for these directives and attaches matching files as media.

28. **OpenClaw uses a flat image content block format** — `{type: "image", data: "<base64>", mimeType: "image/png"}`. This differs from the Anthropic API format (`{type: "image", source: {type: "base64", media_type, data}}`). Plugins must use the flat format; OpenClaw converts to API format before sending to the LLM.

29. **Plugin-generated temp files accumulate** — plugins that save images via `MEDIA:` pattern write to `$TMPDIR`. macOS clears `/tmp` on reboot, but long-running servers accumulate files. Consider a cron job: `find /tmp/openclaw-image-gen -mtime +1 -delete`.

### Memory

30. **Remote memory search providers need a separate API key** — the embedding key (e.g., `OPENAI_API_KEY` for OpenAI embeddings) is not the same as your AI provider key (`ANTHROPIC_API_KEY`). Both must be set.

31. **Local memory search requires native build approval** — run `npx pnpm approve-builds` then `npx pnpm rebuild node-llama-cpp` (from the OpenClaw install directory). Without this, `memory_search` falls back to a remote provider (if configured) or returns no results.

32. **Memory search auto-reindexes on provider/model change** — OpenClaw tracks the embedding provider, model, and chunking params in the index. Changing any of these triggers an automatic reindex. Run `openclaw memory index` to force an immediate rebuild.

33. **Daily memory files are auto-loaded for today + yesterday only** — older files are only accessible via `memory_search`. If search isn't configured, the agent can't recall anything beyond yesterday.

---

## Version Compatibility

Features below require the listed version or later. Check yours with `openclaw --version`.

| Version | Feature | Details |
|---------|---------|---------|
| 2026.1.29 | Control UI token fix | Security vulnerability (CVSS 8.8) patched — update immediately. See [Phase 3](phases/phase-3-security.md) |
| 2026.2.1 | `before_tool_call` hook | Required for [web-guard plugin](phases/phase-5-web-search.md#advanced-prompt-injection-guard) |
| 2026.2.3-1 | Security audit baseline | Version used in the [worked audit example](examples/security-audit.md) |
| 2026.2.9 | xAI (Grok) provider | New [search provider option](phases/phase-5-web-search.md#search-providers) |
| 2026.2.12 | Channel bindings regression | [#15176](https://github.com/openclaw/openclaw/pull/15176) — bindings to non-default agents broken. Route to main as workaround |

---

## Plugins

| Plugin | Purpose | Required env var |
|--------|---------|-----------------|
| `whatsapp` | WhatsApp channel (bundled) | — |
| `signal` | Signal channel (bundled) | — |
| `googlechat` | Google Chat channel (bundled) | `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` |
| `web-guard` | Pre-fetch prompt injection scanning for `web_fetch` | — (local ONNX model) |
| `channel-guard` | Inbound message injection scanning for WhatsApp/Signal/Google Chat | — (local ONNX model) |
| `agent-guard` | Inter-agent `sessions_send` injection scanning | — (local ONNX model) |
| `image-gen` | Generate images from text prompts via OpenRouter | `OPENROUTER_API_KEY` |

The `web-guard` plugin intercepts `web_fetch` calls, pre-fetches the URL, and scans content for prompt injection before the agent sees it. The `channel-guard` plugin scans incoming WhatsApp/Signal/Google Chat messages before agent processing. The `agent-guard` plugin scans inter-agent `sessions_send` messages for injection. All three use the same local DeBERTa ONNX model, are fail-closed by default (`failOpen: false`), and share the model cache. See [web-search-isolation.md](phases/phase-5-web-search.md#advanced-prompt-injection-guard) for full setup and limitations.

The `image-gen` plugin registers a `generate_image` tool that agents can call to create images from text prompts. Uses OpenRouter's unified API — supports FLUX, Gemini, GPT, and Sourceful models. See [extensions/image-gen/](extensions/image-gen.md) for source.

### Plugin Installation

Plugin directories must be named to match the **manifest ID** in `openclaw.plugin.json` (e.g., `web-guard/`, not `openclaw-web-guard/`). The `name` field in `package.json` should also match the manifest ID.

**Manual installation** (recommended — `openclaw plugins install` may fail to resolve dependencies or link manifests correctly; see the [OpenClaw changelog](https://docs.openclaw.ai) for current plugin CLI status):
```bash
cp -r extensions/web-guard ~/.openclaw/extensions/web-guard
cp -r extensions/channel-guard ~/.openclaw/extensions/channel-guard
cp -r extensions/agent-guard ~/.openclaw/extensions/agent-guard
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
      "web-guard": {
        enabled: true,
        config: {
          failOpen: false,       // Block web_fetch if model unavailable
          timeoutMs: 10000,      // Pre-fetch timeout
          maxContentLength: 50000, // Truncate content sent to model
          sensitivity: 0.5       // Detection threshold (0.0–1.0)
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
          // Uses $OPENROUTER_API_KEY from env by default
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

# Gateway management
openclaw start                              # Start gateway in foreground
openclaw health                             # Gateway health check
openclaw status                             # Gateway status
openclaw dashboard                          # Open browser UI
openclaw logs                               # View logs

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
