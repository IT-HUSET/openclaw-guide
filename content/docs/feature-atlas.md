---
title: "Feature Atlas"
description: "Complete feature inventory with categories, use cases, open issues, and visual diagrams."
weight: 95
---

A structured map of every OpenClaw feature — organized by category, cross-referenced to guide sections, and annotated with known issues. Use this page to understand what's available, where to configure it, and what to watch out for.

## Feature Overview

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "background": "transparent" } }}%%
graph TB
    subgraph CH["Channels & Messaging"]
        direction TB
        CH1["WhatsApp · Signal · Google Chat"]
        CH2["DM & Group Policies"]
        CH3["Mention Gating · Chat Commands"]
    end

    subgraph AG["Agents & Configuration"]
        direction TB
        AG1["Agent Definitions · Routing"]
        AG2["A2A · Subagents · LLM Providers"]
        AG3["Config Includes · Validation"]
    end

    subgraph SM["Sessions & Memory"]
        direction TB
        SM1["Session Scoping (4 modes)"]
        SM2["Two-Layer Memory · Hybrid Search"]
        SM3["Compaction · Temporal Decay"]
    end

    subgraph SE["Security & Hardening"]
        direction TB
        SE1["Sandbox Modes · Docker / VM"]
        SE2["Tool Policies (8 layers)"]
        SE3["5 Guard Plugins · SOUL.md"]
    end

    subgraph TA["Tools & Automation"]
        direction TB
        TA1["44 Tools in 8 Groups"]
        TA2["Cron Jobs · Web Search"]
        TA3["Browser · Computer Use · Image Gen"]
    end

    subgraph DO["Deployment & Operations"]
        direction TB
        DO1["Gateway · LaunchAgent · systemd"]
        DO2["Docker / VM Deploy · Tailscale"]
        DO3["Health Endpoints · Multi-Gateway"]
    end

    subgraph IN["Plugin System & Internals"]
        direction LR
        IN1["Plugin Hooks (6)"]
        IN2["Session Router"]
        IN3["HTTP API · Control UI"]
    end

    CH -->|connects| AG
    AG -->|uses| SM
    AG -->|invokes| TA
    SE -.->|enforces| TA
    TA -->|runs on| DO
    TA -.->|built on| IN

    classDef channels fill:#15803d,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef agents fill:#1d4ed8,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef sessions fill:#7c3aed,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px
    classDef security fill:#dc2626,stroke:#FCA5A5,color:#F8FAFC,stroke-width:1.5px
    classDef tools fill:#0891b2,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px
    classDef deploy fill:#d97706,stroke:#FCD34D,color:#F8FAFC,stroke-width:1.5px
    classDef internals fill:#334155,stroke:#94A3B8,color:#F8FAFC,stroke-width:1px

    class CH1,CH2,CH3 channels
    class AG1,AG2,AG3 agents
    class SM1,SM2,SM3 sessions
    class SE1,SE2,SE3 security
    class TA1,TA2,TA3 tools
    class DO1,DO2,DO3 deploy
    class IN1,IN2,IN3 internals
```

> **Editable source:** The diagram is also available as an [Excalidraw file](https://github.com/IT-HUSET/openclaw-guide/blob/main/diagrams/feature-atlas-overview.excalidraw.json) — open it at [excalidraw.com](https://excalidraw.com) for a richer, editable version.

---

## Agents & Configuration

How agents are defined, routed, and connected to each other.

### Features

| Feature | Description | Config Key | Since | Guide |
|---------|-------------|------------|-------|-------|
| Agent definitions | Named agents with separate workspaces, tools, and model config | `agents.list[]` | — | [Phase 1](phases/phase-1-getting-started.md) |
| Agent defaults | Shared defaults inherited by all agents | `agents.defaults` | — | [Reference](reference.md#config-quick-reference) |
| Multi-agent routing | Bind channels/peers to specific agents via pattern matching | `bindings[]` | — | [Phase 4](phases/phase-4-multi-agent.md) |
| Workspaces | Per-agent directories with SOUL.md and AGENTS.md for behavioral constraints | `agents.list[].workspace` | — | [Phase 3](phases/phase-3-security.md) |
| Agent-to-agent (A2A) | Delegate tasks between agents via `sessions_send` | `tools.agentToAgent` | — | [Phase 4](phases/phase-4-multi-agent.md) |
| Subagents | Spawn background sub-tasks within an agent's session | `agents.defaults.subagents` | — | [Reference](reference.md#config-quick-reference) |
| Subagent limits | Control nesting depth and concurrency of spawned sub-agents | `subagents.maxSpawnDepth`, `maxChildrenPerAgent` | 2026.2.16 | [Reference](reference.md#config-quick-reference) |
| LLM providers | Multi-provider support (Anthropic, OpenAI, Gemini, OpenRouter, xAI, Groq) | `agents.list[].provider` | — | [Phase 1](phases/phase-1-getting-started.md) |
| LM Studio provider | Bundled local LM Studio provider with onboarding, runtime model discovery, stream preload, and memory-search embeddings for self-hosted OpenAI-compatible models | `models.providers.lmstudio` | 2026.4.12 | [Official docs](https://docs.openclaw.ai) |
| Self-hosted private network | Per-provider opt-in (`allowPrivateNetwork`) for trusted self-hosted OpenAI-compatible endpoints on private/loopback addresses | `models.providers.*.request.allowPrivateNetwork` | 2026.4.10 | [Official docs](https://docs.openclaw.ai) |
| Per-channel model overrides | Use different models for different channels | `channels.modelByChannel` | 2026.2.21 | [Reference](reference.md#config-quick-reference) |
| Skills | Bundled skill packages (coding-agent, github, healthcheck) | `skills.allowBundled` | — | [Reference](reference.md#config-quick-reference) |
| Config includes | Split config across multiple files with `$include` | `$include` | — | [Reference](reference.md#config-includes-include) |
| Per-agent thinking/reasoning defaults | Configure thinking/reasoning/fast mode per agent with automatic fallback | `agents.list[].defaults.think` | 2026.3.22 | [Reference](reference.md#config-quick-reference) |
| Native image generation model | Set the default model for the built-in `image_generate` tool | `agents.defaults.imageGenerationModel.primary` | 2026.3.22 | [Reference](reference.md#config-quick-reference) |
| Global default provider parameters | Set default provider parameters applied to all agents | `agents.defaults.params` | 2026.4.1 | [Reference](reference.md#config-quick-reference) |
| System prompt override | Controlled prompt experiments and heartbeat prompt-section controls | `agents.defaults.systemPromptOverride` | 2026.4.7 | [Reference](reference.md#config-quick-reference) |
| Local model lean mode (experimental) | Drop heavyweight default tools (`browser`, `cron`, `message`) to reduce prompt size for weaker local-model setups; has no effect on normal (non-local) paths | `agents.defaults.experimental.localModelLean: true` | 2026.4.15 | [Official docs](https://docs.openclaw.ai) |
| Config validation | Validate config before gateway startup | CLI: `openclaw config validate` | 2026.3.2 | [Reference](reference.md#config-validation) |
| DeepSeek V4 bundled catalog | DeepSeek V4 Flash and V4 Pro in bundled model catalog; V4 Flash is the onboarding default | `agents.list[].model` | 2026.4.24 | [Official docs](https://docs.openclaw.ai) |
| Bootstrap context injection control | Disable workspace bootstrap file injection for agents that fully own their prompt lifecycle | `agents.defaults.contextInjection: "never"` | 2026.4.24 | [Reference](reference.md#config-quick-reference) |
| Preflight compaction trigger | Opt-in preflight that runs local compaction when the active transcript JSONL grows past a byte limit, rotating the file before the next turn | `agents.defaults.compaction.maxActiveTranscriptBytes` | 2026.4.26 | [Phase 2](phases/phase-2-memory.md) |
| Model pricing skip | Skip startup OpenRouter and LiteLLM pricing-catalog fetches for offline or restricted-network installs; explicit `models.providers.*.pricing` values continue to work | `models.pricing.enabled` | 2026.4.27 | [Phase 6](phases/phase-6-deployment.md) |
| Opt-in follow-up commitments | Hidden extraction of inferred follow-up commitments from conversations, delivered via heartbeat; per-agent/per-channel scoping | `commitments.enabled`, `commitments.maxPerDay` | 2026.4.29 | [Official docs](https://docs.openclaw.ai) |
| Thread-bound session spawning | `threadBindings.spawnSessions` replaces the legacy split subagent/ACP thread-spawn toggles; migrated automatically by `openclaw doctor --fix` | `threadBindings.spawnSessions` | 2026.5.2 | [Official docs](https://docs.openclaw.ai) |
| Skip optional bootstrap files | Skip selected optional workspace bootstrap files without disabling required workspace setup | `agents.defaults.skipOptionalBootstrapFiles` | 2026.5.2 | [Official docs](https://docs.openclaw.ai) |
| Tool progress verbosity | Set channel streaming tool-progress detail: `"compact"` (default, explain-mode summaries) or `"raw"` (full command/output for debugging); per-agent overrides supported | `agents.defaults.toolProgressDetail` | 2026.5.4 | [Reference](reference.md#config-quick-reference) |
| Post-compaction loop guard | Abort agent run with `compaction_loop_persisted` after same `(tool, args, result)` triple repeats N times following auto-compaction-retry; tunable window size | `tools.loopDetection.postCompactionGuard.windowSize` | 2026.5.4 | [Reference](reference.md#config-quick-reference) |
| Config schema | Print generated JSON schema for `openclaw.json` | CLI: `openclaw config schema` | 2026.3.28 | [Reference](reference.md#config-validation) |
| Environment files | `.env` loading from CWD → `~/.openclaw/` → config `env` block | `.env` files | — | [Reference](reference.md#environment-files) |

### Use Cases

- **Single agent with search delegation** — main agent + isolated search agent ([Phase 5](phases/phase-5-web-search.md))
- **Multi-channel routing** — separate agents per channel with binding patterns ([Phase 4](phases/phase-4-multi-agent.md))
- **Workspace isolation** — per-agent SOUL.md to enforce different behavioral rules ([Phase 3](phases/phase-3-security.md))
- **Config splitting** — `$include` for managing complex multi-agent configs ([Reference](reference.md#config-includes-include))

### Known Issues

| Issue | Status | Impact | Workaround |
|-------|--------|--------|------------|
| [#15176](https://github.com/openclaw/openclaw/pull/15176) — Channel bindings regression | Open | Bindings to non-default agents broken | Not relevant for recommended 2-agent config (all channels route to main) |
| [#9857](https://github.com/openclaw/openclaw/issues/9857) — `sessions_spawn` sandbox bug | Open | Both agents sandboxed with per-agent tools breaks spawn | Run search agent unsandboxed |
| [#14046](https://github.com/openclaw/openclaw/issues/14046) — ANNOUNCE_SKIP timing race | Open (PR [#15383](https://github.com/openclaw/openclaw/pull/15383)) | A2A `sessions_send` delivers despite `ANNOUNCE_SKIP` | None — message is delivered regardless |

---

## Channels & Messaging

How external users communicate with agents through messaging platforms.

### Features

| Feature | Description | Config Key | Since | Guide |
|---------|-------------|------------|-------|-------|
| WhatsApp | Full WhatsApp channel with DMs, groups, media, pairing | `channels.whatsapp` | — | [Phase 4](phases/phase-4-multi-agent.md) |
| Signal | Signal channel with DMs, groups, linked device support | `channels.signal` | — | [Phase 4](phases/phase-4-multi-agent.md) |
| Google Chat | Google Chat via GCP service account, DMs and spaces | `channels.googlechat` | — | [Google Chat](google-chat.md) |
| Telegram | Telegram channel (supported, not detailed in guide) | `channels.telegram` | — | [Official docs](https://docs.openclaw.ai) |
| Discord | Discord channel (supported, not detailed in guide) | `channels.discord` | — | [Official docs](https://docs.openclaw.ai) |
| Slack | Slack channel (supported, not detailed in guide) | `channels.slack` | — | [Official docs](https://docs.openclaw.ai) |
| DM policies | Control who can DM: pairing, allowlist, open, disabled | `channels.<ch>.dmPolicy` | — | [Reference](reference.md#dm-policy-options) |
| Group policies | Control group access: allowlist, open, disabled | `channels.<ch>.groupPolicy` | — | [Reference](reference.md#group-policy--mention-gating) |
| Mention gating | Require @mention before agent responds in groups | `channels.<ch>.groups.*.requireMention` | — | [Reference](reference.md#group-policy--mention-gating) |
| Mention patterns | Regex patterns for channels without native @mention (Signal) | `agents.list[].groupChat.mentionPatterns` | — | [Reference](reference.md#mention-patterns) |
| Chat commands | User-facing `/help`, `/reset`, `/status`, `/whoami`, `/compact`, `/stop` | — | — | [Reference](reference.md#chat-commands) |
| Directives | Session modifiers: `/think`, `/elevated`, `/model` | — | — | [Reference](reference.md#directives-session-modifiers) |
| Dangerous commands | Gated commands: `/bash`, `/config`, `/debug`, `/restart` | `commands.*` | — | [Reference](reference.md#dangerous-commands-disabled-by-default) |
| Proactive messaging | Send messages to any chat via `message` tool with explicit `target` | `message` tool | — | [Reference](reference.md#tool-list) |
| Per-channel models | Override LLM model per channel | `channels.modelByChannel` | 2026.2.21 | [Reference](reference.md#config-quick-reference) |
| Signal groups schema | Native groups config block for Signal channel | `channels.signal.groups` | 2026.3.13-1 | [Phase 6](phases/phase-6-deployment.md) |
| QQ Bot | QQ Bot bundled channel with multi-account, slash commands, reminders, and media | `channels.qqbot` | 2026.3.31 | [Official docs](https://docs.openclaw.ai) |
| WhatsApp emoji reactions | Agents can react to incoming WhatsApp messages with emoji; configure with `reactionLevel` | `channels.whatsapp.reactionLevel` | 2026.3.31 | [Official docs](https://docs.openclaw.ai) |
| Channel context visibility | Filter supplemental quote/thread/history context by sender allowlist per channel | `channels.<ch>.contextVisibility` | 2026.4.5 | [Official docs](https://docs.openclaw.ai) |
| WhatsApp native reply quoting | Configurable native reply-thread quoting for WhatsApp conversations | `channels.whatsapp.replyToMode` | 2026.4.22 | [Official docs](https://docs.openclaw.ai) |
| WhatsApp per-chat system prompts | Per-group and per-direct `systemPrompt` injected as `GroupSystemPrompt` context; `"*"` wildcard fallback; account-scoped overrides | `channels.whatsapp.groups.<id>.systemPrompt`, `channels.whatsapp.direct.<id>.systemPrompt` | 2026.4.22 | [Official docs](https://docs.openclaw.ai) |
| Tencent Yuanbao | Tencent Yuanbao channel via external `openclaw-plugin-yuanbao` plugin; WebSocket bot DMs and group chats | `channels.yuanbao` | 2026.4.27 | [Official docs](https://docs.openclaw.ai) |
| WhatsApp Channel/Newsletter targets | Send outbound messages to WhatsApp Channel or Newsletter feeds using `@newsletter` target syntax | `channels.whatsapp` — `@newsletter` target | 2026.5.2 | [Official docs](https://docs.openclaw.ai) |
| Streaming progress drafts | Unified `streaming.mode: "progress"` with auto-labelled draft previews and shared `streaming.progress.*` config across Discord, Telegram, Matrix, Slack, and Microsoft Teams | `channels.<ch>.streaming.mode: "progress"` | 2026.5.3 | [Official docs](https://docs.openclaw.ai) |
| Streaming command-text control | Hide exec/command text in preview progress lines (`"status"`) while keeping full command visible in raw progress mode; separate preview and progress controls | `streaming.preview.commandText`, `streaming.progress.commandText` | 2026.5.4 | [Official docs](https://docs.openclaw.ai) |

### Use Cases

- **WhatsApp personal assistant** — pairing-based DMs with group mention gating ([Phase 4](phases/phase-4-multi-agent.md))
- **Signal secure messaging** — privacy-focused channel with regex mention patterns ([Phase 4](phases/phase-4-multi-agent.md), [Phase 6](phases/phase-6-deployment.md))
- **Google Chat workspace bot** — GCP service account for team/org use ([Google Chat](google-chat.md))
- **Morning briefing delivery** — cron job with `delivery.to` for automated group reports ([Morning Briefing recipe](recipes/morning-briefing.md))
- **Multi-channel routing** — different agents respond on different channels ([Phase 4](phases/phase-4-multi-agent.md))

### Known Issues

| Issue | Status | Impact | Workaround |
|-------|--------|--------|------------|
| [#11758](https://github.com/openclaw/openclaw/issues/11758) — `requireMention` broken on WhatsApp (LID transition) | Open | `mentionedJids` use `@lid` format vs `selfJid` `@s.whatsapp.net` — mention detection always fails | Noted in [Phase 3](phases/phase-3-security.md); use group allowlist instead of mention gating |
| [#14046](https://github.com/openclaw/openclaw/issues/14046) — ANNOUNCE_SKIP timing race | Open (PR [#15383](https://github.com/openclaw/openclaw/pull/15383)) | Cron delivery proceeds despite agent returning ANNOUNCE_SKIP | None |

---

## Sessions & Memory

How conversations are scoped, persisted, and how agents remember across sessions.

### Features

| Feature | Description | Config Key | Since | Guide |
|---------|-------------|------------|-------|-------|
| Session scoping | Isolate conversations: main, per-peer, per-channel-peer, per-account-channel-peer | `session.dmScope` | — | [Sessions](sessions.md), [Reference](reference.md#session-scope-options) |
| Session lifecycle | Creation, compaction, pruning of session transcripts | — | — | [Sessions](sessions.md) |
| Session reset | Clear session via `/reset` command or CLI | `/reset` command, `openclaw sessions reset` | — | [Reference](reference.md#core-commands) |
| Session cleanup | Prune orphaned sessions and manage disk usage | `openclaw sessions cleanup` | 2026.2.23 | [Reference](reference.md#useful-commands) |
| Two-layer memory | Daily markdown files (auto-loaded today + yesterday) + semantic search for older | `agents.defaults.memorySearch` | — | [Phase 2](phases/phase-2-memory.md) |
| Local memory search | On-device embeddings via node-llama-cpp (no external API) | `memorySearch.provider: "local"` | — | [Phase 2](phases/phase-2-memory.md) |
| Remote memory search | External embedding provider (OpenAI, etc.) | `memorySearch.provider: "remote"` | — | [Phase 2](phases/phase-2-memory.md) |
| Hybrid search | Combine vector similarity + full-text search with configurable weights | `memorySearch.query.hybrid` | — | [Phase 2](phases/phase-2-memory.md) |
| MMR deduplication | Maximal Marginal Relevance to deduplicate similar search results | `memorySearch.query.hybrid.mmr` | — | [Phase 2](phases/phase-2-memory.md) |
| Temporal decay | Down-rank older memory entries with configurable half-life | `memorySearch.temporalDecay` | — | [Phase 2](phases/phase-2-memory.md) |
| Memory cache | In-memory cache for frequent search queries | `memorySearch.cache` | — | [Phase 2](phases/phase-2-memory.md) |
| Pre-compaction flush | Write memories before session compaction to prevent loss | `compaction.memoryFlush` | — | [Phase 2](phases/phase-2-memory.md) |
| Compaction tuning | Reserve tokens for response, keep recent context across compaction | `compaction.reserveTokens`, `keepRecentTokens` | 2026.2.21 | [Reference](reference.md#config-quick-reference) |
| Post-compaction reindexing | Immediate memory reindex after compaction for same-turn searchability | `compaction.postIndexSync`, `memorySearch.sync.sessions.postCompactionForce` | 2026.3.12 | [Phase 2](phases/phase-2-memory.md) |
| Multimodal memory indexing | Index images and audio in `extraPaths` via Gemini embeddings | `memorySearch.provider: "gemini"` + `gemini-embedding-2-preview` | 2026.3.11 | [Phase 2](phases/phase-2-memory.md) |
| QMD cross-agent collections | Opt specific agents into searching another agent's session history by name | `memorySearch.qmd.extraCollections` | 2026.3.31 | [Phase 2](phases/phase-2-memory.md) |
| Amazon Bedrock embeddings | Memory embeddings via Titan, Cohere, Nova, TwelveLabs; AWS credential-chain auto-detection | `memorySearch.provider: "bedrock"` | 2026.4.5 | [Phase 2](phases/phase-2-memory.md) |
| GitHub Copilot embeddings | Memory search embedding provider using GitHub Copilot transport with token refresh and remote override support | `memorySearch.provider: "copilot"` | 2026.4.15 | [Phase 2](phases/phase-2-memory.md) |
| LanceDB cloud storage | `memory-lancedb` backend supports remote object storage so durable memory indexes can run on cloud storage instead of local disk | `memory-lancedb` plugin | 2026.4.15 | [Official docs](https://docs.openclaw.ai) |
| Memory dreaming (experimental) | Background promotion of daily-log content into durable `MEMORY.md`; three phases (light, deep, REM) | `dreaming.enabled`, `dreaming.frequency` | 2026.4.5 | [Phase 2](phases/phase-2-memory.md) |
| Dreaming aging controls | Tune recall decay and promotion decisions | `dreaming.recencyHalfLifeDays`, `dreaming.maxAgeDays` | 2026.4.5 | [Phase 2](phases/phase-2-memory.md) |
| Dreaming separate storage (default) | Dreaming phase blocks (`## Light Sleep`, `## REM Sleep`) stored in `memory/dreaming/{phase}/YYYY-MM-DD.md` instead of inline in daily memory files — prevents daily notes from being dominated by structured candidate output; opt out by setting `storage.mode: "inline"` | `plugins.entries.memory-core.config.dreaming.storage.mode` | 2026.4.15 | [Phase 2](phases/phase-2-memory.md) |
| Dreaming REM tooling | Preview and explain promotion decisions; replay-safe reruns | `openclaw memory rem-harness`, `promote-explain` | 2026.4.5 | [Phase 2](phases/phase-2-memory.md) |
| Dreaming REM historical backfill | Replay old daily notes into Dreams and durable memory via `rem-harness --path` | `openclaw memory rem-harness --path` | 2026.4.9 | [Phase 2](phases/phase-2-memory.md) |
| Dreaming diary view | Structured diary view in Control UI with timeline, backfill/reset controls, and traceable summaries | Control UI | 2026.4.9 | [Phase 2](phases/phase-2-memory.md) |
| Dreaming ChatGPT import + memory-wiki | Import ChatGPT conversation history as source chats; `Imported Insights` and `Memory Palace` diary subtabs for inspecting compiled wiki pages and source pages | Control UI | 2026.4.11 | [Phase 2](phases/phase-2-memory.md) |
| Active Memory | Optional plugin that runs a dedicated memory sub-agent before each reply to automatically surface relevant context, preferences, and past details without requiring explicit "remember this" prompts; configurable message/recent/full context modes with `/verbose` inspection | `plugins.entries.active-memory` | 2026.4.10 | [Official docs](https://docs.openclaw.ai/concepts/active-memory) |
| Compaction notify user | Control whether the "🧹 Compacting context..." notice is shown | `agents.defaults.compaction.notifyUser` | 2026.4.2 | [Phase 2](phases/phase-2-memory.md) |
| Pluggable compaction provider | Replace built-in LLM summarization pipeline via plugin registry | `agents.defaults.compaction.provider` | 2026.4.7 | [Phase 2](phases/phase-2-memory.md) |
| Memory CLI | Status, index, search from terminal | `openclaw memory *` | — | [Reference](reference.md#useful-commands) |
| Local embedding context size | Tune local embedding context window for constrained hosts without patching memory host | `memorySearch.local.contextSize` | 2026.4.23 | [Phase 2](phases/phase-2-memory.md) |
| Dreaming heartbeat-independent | Dreaming runs as an isolated lightweight agent turn regardless of whether heartbeat is enabled or what `heartbeat.activeHours` allows | `dreaming.enabled` | 2026.4.23 | [Phase 2](phases/phase-2-memory.md) |
| Hybrid search raw scores | `vectorScore` and `textScore` exposed alongside combined `score` on hybrid results for retrieval contribution inspection | `memorySearch.query.hybrid` | 2026.4.24 | [Phase 2](phases/phase-2-memory.md) |
| Asymmetric embedding config | Separate `queryInputType` and `documentInputType` for OpenAI-compatible providers that use different input types for queries vs. documents (e.g., `query` vs. `passage`) | `memorySearch.queryInputType`, `memorySearch.documentInputType` | 2026.4.26 | [Phase 2](phases/phase-2-memory.md) |
| Dream Diary model override | Dedicated `dreaming.model` knob for Dream Diary narrative subagents to avoid paid conversation models during memory housekeeping | `dreaming.model` | 2026.4.26 | [Phase 2](phases/phase-2-memory.md) |

### Use Cases

- **Personal assistant with long-term recall** — hybrid search with temporal decay ([Phase 2](phases/phase-2-memory.md))
- **Knowledge vault** — structured memory for research and reference material ([Knowledge Vault recipe](recipes/knowledge-vault.md))
- **Privacy-first memory** — local embeddings, no external API calls ([Phase 2](phases/phase-2-memory.md))
- **Multi-agent shared context** — agents in the same workspace share memory files ([Phase 4](phases/phase-4-multi-agent.md))

### Known Issues

No major open issues affecting sessions or memory.

---

## Security & Hardening

Layers of protection from sandbox isolation to network controls.

### Features

| Feature | Description | Config Key | Since | Guide |
|---------|-------------|------------|-------|-------|
| Sandbox modes | Container isolation: off, non-main, all | `agents.defaults.sandbox.mode` | — | [Reference](reference.md#sandbox-modes) |
| Sandbox scope | Isolate per-agent or per-session | `sandbox.scope` | — | [Reference](reference.md#sandbox-scope--access-guide) |
| Workspace access | Control sandbox filesystem access: none, ro, rw | `sandbox.workspaceAccess` | — | [Reference](reference.md#sandbox-scope--access-guide) |
| Sandbox tool allow list | Separate tool policy layer for sandboxed sessions | `tools.sandbox.tools.allow` | — | [Reference](reference.md#default-sandbox-tool-allow-list) |
| Docker isolation | Dedicated OS user + Docker sandboxing for agents | — | — | [Phase 6](phases/phase-6-deployment.md), [Scripts](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/docker-isolation) |
| VM isolation (macOS) | macOS VMs via Lume for host isolation | — | — | [Phase 6](phases/phase-6-deployment.md) |
| VM isolation (Linux) | Linux VMs via Multipass/KVM with Docker inside | — | — | [Phase 6](phases/phase-6-deployment.md) |
| Tool policies | 8-layer cascade for tool allow/deny | `tools.*`, `agents.list[].tools.*` | — | [Reference](reference.md#tool-policy-precedence) |
| Tool profiles | Preset bundles: minimal, coding, messaging, full | `tools.profile` | — | [Reference](reference.md#tool-policy-precedence) |
| Elevated mode | Escape sandbox for trusted operations | `tools.elevated` | — | [Reference](reference.md#directives-session-modifiers) |
| content-guard | LLM-based prompt injection scanning at A2A boundary | Plugin config | 2026.2.1 | [Phase 5](phases/phase-5-web-search.md), [Extension](extensions/content-guard.md) |
| channel-guard | Inbound channel message injection scanning | Plugin config | — | [Extension](extensions/channel-guard.md) |
| file-guard | Path-based file access protection (no_access, read_only, no_delete) | Plugin config | — | [Extension](extensions/file-guard.md) |
| network-guard | Application-level domain allowlisting for web_fetch and exec | Plugin config | — | [Extension](extensions/network-guard.md) |
| command-guard | Regex-based dangerous command blocking for exec/bash | Plugin config | — | [Extension](extensions/command-guard.md) |
| SOUL.md | Agent behavioral constraints loaded at session start | Workspace file | — | [Phase 3](phases/phase-3-security.md) |
| Gateway auth | Token-based authentication for the gateway API | `gateway.auth` | — | [Phase 3](phases/phase-3-security.md) |
| Gateway auth auto-generation | Gateway generates a secure token if none is configured | — | 2026.2.19 | [Phase 3](phases/phase-3-security.md) |
| Secrets management | Audit, configure, apply, and reload secrets without restart | `openclaw secrets *` | 2026.2.26 | [Phase 6](phases/phase-6-deployment.md#secrets-management-all-methods) |
| Network egress control | OS-level firewall rules to restrict outbound connections | — | — | [Hardened Multi-Agent](hardened-multi-agent.md), [Scripts](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/network-egress) |
| Security audit | CLI-driven security posture assessment | `openclaw security audit` | — | [Security Audit example](examples/security-audit.md) |
| SSRF hardening | Browser SSRF policy with private network controls | `browser.ssrfPolicy` | 2026.2.23 | [Phase 3](phases/phase-3-security.md) |
| Exec obfuscation detection | Detect and block obfuscated shell commands | — | 2026.2.23 | [Phase 3](phases/phase-3-security.md) |
| Exec safeBin path pinning | Pin trusted binary paths for exec allowlists | `tools.exec.safeBinTrustedDirs` | 2026.2.22 | [Reference](reference.md#config-quick-reference) |
| CSP enforcement | Content Security Policy for Control UI | — | 2026.2.16 | [Phase 3](phases/phase-3-security.md) |
| Workspace plugin auto-load disabled | Workspace-level plugins no longer auto-loaded (security hardening) | — | 2026.3.12 | [Phase 3](phases/phase-3-security.md) |
| Device pairing bootstrap tokens | Improved pairing token security for device bootstrap | — | 2026.3.12 | [Phase 3](phases/phase-3-security.md) |
| Exec inline eval hardening | Require fresh approval for inline interpreter eval (`python -c`, `node -e`, etc.) | `tools.exec.strictInlineEval` | 2026.3.22 | [Phase 3](phases/phase-3-security.md) |
| Marketplace manifest security | Remote marketplace manifests validated to prevent install-path expansion outside repo | — | 2026.3.22 | [Phase 3](phases/phase-3-security.md) |
| Exec env injection blocking | Block proxy, TLS, Docker endpoint, and package index env var overrides in host exec | — | 2026.3.31 | [Phase 3](phases/phase-3-security.md) |
| Plugin install fail-closed | Critical dangerous-code findings block plugin/skill install by default; override with `--dangerously-force-unsafe-install` | — | 2026.3.31 | [Phase 3](phases/phase-3-security.md) |
| Gateway auth hardening | trusted-proxy rejects mixed shared-token configs; local-direct fallback requires configured token | `gateway.auth` | 2026.3.31 | [Phase 6](phases/phase-6-deployment.md) |
| Runtime event trust hardening | Background notifyOnExit, ACP relays, and wake-hook payloads marked untrusted so they cannot inject System: text | — | 2026.4.7 | [Phase 3](phases/phase-3-security.md) |
| Plugin archive integrity | ClawHub downloads verified against version metadata SHA-256; fails closed on missing or malformed integrity data | — | 2026.4.7 | [Phase 3](phases/phase-3-security.md) |
| Gateway config exec write lock | model-facing `config.apply`/`config.patch` cannot change `safeBins`, `safeBinTrustedDirs`, or `strictInlineEval` (2026.4.7); extended in 2026.4.14 to block all flags enumerated by `openclaw security audit` | — | 2026.4.7 | [Phase 3](phases/phase-3-security.md) |
| Dotenv runtime-control env blocking | Workspace `.env` cannot override runtime-control or browser-control env vars | — | 2026.4.9 | [Phase 3](phases/phase-3-security.md) |
| Exec approval secret redaction | Secrets are redacted in exec approval prompts so inline approval review cannot leak credential material | — | 2026.4.15 | [Phase 3](phases/phase-3-security.md) |
| Gateway auth per-request resolution | Gateway bearer resolved per-request on all HTTP paths; token rotation via `secrets.reload` or config hot-reload takes effect immediately without restart | — | 2026.4.15 | [Phase 3](phases/phase-3-security.md) |
| Workspace file symlink hardening | `agents.files` API routes through `fs-safe` helpers; symlink aliases for agent files rejected; real-path resolved from file descriptor to prevent swap-between-open-and-realpath attacks | — | 2026.4.15 | [Phase 3](phases/phase-3-security.md) |
| Dotenv `OPENCLAW_*` env blocking | All `OPENCLAW_*` keys blocked from untrusted workspace `.env` files; fails closed for new runtime-control variables | — | 2026.4.20 | [Phase 3](phases/phase-3-security.md) |
| Device pairing scope restriction | Non-admin paired-device sessions restricted to own device's pairing actions; cannot enumerate or approve other devices | — | 2026.4.20 | [Phase 3](phases/phase-3-security.md) |
| Gateway tool mutation guard (full) | model-facing `config.patch`/`config.apply` cannot rewrite operator-trusted paths or bypass the guard via per-agent `agents.list[]` overrides | — | 2026.4.20 | [Phase 3](phases/phase-3-security.md) |
| WebSocket broadcast auth | `operator.read` required for chat, agent, and tool-result event frames; pairing-scoped sessions no longer receive session chat content passively | — | 2026.4.20 | [Phase 3](phases/phase-3-security.md) |
| MCP stdio env injection blocked | Interpreter-startup env keys (`NODE_OPTIONS`, etc.) blocked for stdio MCP servers | — | 2026.4.20 | [Phase 3](phases/phase-3-security.md) |
| `enforceOwnerForCommands` bypass fix | Owner identity required for owner-enforced commands; permissive `allowFrom` wildcards or empty `ownerAllowFrom` no longer bypass owner checks | — | 2026.4.21 | [Phase 3](phases/phase-3-security.md) |
| Plugin update integrity fail-closed | Pinned plugin/hook-pack updates abort when exact integrity hash drift is detected; drift details exposed via `openclaw update --json` | — | 2026.4.22 | [Phase 3](phases/phase-3-security.md) |
| Control UI config endpoint auth | `/__openclaw/control-ui-config.json` requires authenticated access when `gateway.auth` enabled | `gateway.auth` | 2026.4.22 | [Phase 3](phases/phase-3-security.md) |
| WhatsApp/group-chat prompt injection fencing | Contact names, vCard fields, location labels, group names, and participant labels rendered through fenced untrusted metadata JSON instead of inline message body | — | 2026.4.23 | [Phase 3](phases/phase-3-security.md) |
| Gateway config write lock (allowlist) | Agent-driven `config.apply`/`config.patch` fail closed against a narrow allowlist of operator-tunable paths (prompt, model, mention-gating) instead of a hand-maintained denylist | — | 2026.4.23 | [Phase 3](phases/phase-3-security.md) |
| Exec-approval explicit enablement | Chat exec-approval gates require explicit enablement; auto-approval from config or owner allowlists alone is no longer sufficient | — | 2026.4.23 | [Phase 3](phases/phase-3-security.md) |
| MCP owner-tool privilege escalation fix | ACPX OpenClaw tools bridge blocked from listing or invoking owner-only tools such as `cron` via non-owner MCP callers | — | 2026.4.23 | [Phase 3](phases/phase-3-security.md) |
| Browser SSRF policy in sandboxed sessions | Resolved `browser.ssrfPolicy` passed into sandbox browser bridges; private-network opt-ins now cover sandboxed browser navigation | `browser.ssrfPolicy` | 2026.4.24 | [Phase 3](phases/phase-3-security.md) |
| Device token scope containment | Pairing-only sessions cannot rotate or revoke higher-scope operator tokens; token rotation and revocation are caller-scope contained | — | 2026.4.25 | [Phase 3](phases/phase-3-security.md) |
| Session transcript redaction | Configured `redactSensitive` patterns now also applied to persisted session transcript JSONL so secrets no longer appear in the clear in transcript files | `logging.redactSensitive` | 2026.4.25 | [Phase 3](phases/phase-3-security.md) |
| Outbound proxy routing | Operator-managed opt-in proxy routing via `proxy.enabled` + `proxy.proxyUrl`/`OPENCLAW_PROXY_URL`; strict http:// forward-proxy validation, loopback-only gateway bypass | `proxy.enabled`, `proxy.proxyUrl` | 2026.4.26 | [Phase 6](phases/phase-6-deployment.md) |
| LaunchAgent secrets hardening | Managed LaunchAgent/service installations load secrets from owner-only env files instead of plist `EnvironmentVariables`; secrets no longer visible in world-readable plist metadata | — | 2026.4.27 | [Phase 6](phases/phase-6-deployment.md) |
| Media MIME sanitization | Media-understanding MIME type sanitization is end-anchored; parameterized MIME values, malformed whitespace, and suffix payloads are rejected before file-context handling | — | 2026.4.27 | [Phase 3](phases/phase-3-security.md) |
| Timing-safe credential comparison | Credential bytes compared with padded timing-safe buffers instead of hashing before equality checks, preventing timing side-channel attacks | — | 2026.4.29 | [Phase 3](phases/phase-3-security.md) |
| Debug-log argument sanitization | Debug log arguments sanitized before writing to `console.*` to prevent log forging via gateway payload fields | — | 2026.4.29 | [Phase 3](phases/phase-3-security.md) |
| Workspace COMSPEC/CLOUDSDK_PYTHON blocking | `COMSPEC` and `CLOUDSDK_PYTHON` blocked from workspace `.env` to prevent Windows shell and Python interpreter redirection | — | 2026.4.29 | [Phase 3](phases/phase-3-security.md) |
| Tool profile restriction narrowing | `tools.exec`/`tools.fs` config sections no longer implicitly widen restrictive profiles (`messaging`, `minimal`); explicit `alsoAllow` entries required; startup warning on affected configs | `tools.alsoAllow` | 2026.4.29 | [Reference](reference.md#tool-policy-precedence) |
| Workspace state-directory env override blocked | Workspace `.env` cannot override the gateway state-directory path | — | 2026.5.2 | [Phase 3](phases/phase-3-security.md) |
| Gateway env file operator secrets preservation | Operator-added secrets in the Gateway env file preserved across re-stage; only OpenClaw-managed keys are cleared | — | 2026.5.3 | [Phase 6](phases/phase-6-deployment.md) |
| Docker gateway container hardening | Bundled `docker-compose.yml` drops `NET_RAW` and `NET_ADMIN` capabilities and enables `no-new-privileges` for the gateway container | `docker-compose.yml` | 2026.5.5 | [Phase 6](phases/phase-6-deployment.md) |

### Use Cases

- **Pragmatic single agent** — no Docker, guard plugins as the safety net ([Pragmatic Single Agent](pragmatic-single-agent.md))
- **Hardened multi-agent** — Docker sandbox + all five guard plugins + network egress ([Hardened Multi-Agent](hardened-multi-agent.md))
- **VM-based isolation** — strongest host separation for high-security deployments ([Phase 6](phases/phase-6-deployment.md))
- **Search agent isolation** — content-guard scans search results before they reach the main agent ([Phase 5](phases/phase-5-web-search.md))
- **Security audit** — automated posture check with `openclaw security audit --deep` ([Security Audit example](examples/security-audit.md))

### Known Issues

| Issue | Status | Impact | Workaround |
|-------|--------|--------|------------|
| [#9857](https://github.com/openclaw/openclaw/issues/9857) — `sessions_spawn` sandbox bug | Open | Can't sandbox both main and search agents with per-agent tools | Run search agent unsandboxed; tool policy provides isolation |

---

## Tools & Automation

The 44 built-in tools, cron scheduling, web search, browser, and extended capabilities.

### Features

| Feature | Description | Config Key | Since | Guide |
|---------|-------------|------------|-------|-------|
| Runtime tools | `exec`, `bash`, `process` — shell execution and process management | `group:runtime` | — | [Reference](reference.md#tool-list) |
| Filesystem tools | `read`, `write`, `edit`, `apply_patch` — file operations | `group:fs` | — | [Reference](reference.md#tool-list) |
| Session tools | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `sessions_yield`, `session_status` | `group:sessions` | `sessions_yield`: 2026.3.12 | [Reference](reference.md#tool-list) |
| Memory tools | `memory_search`, `memory_get` — semantic search and retrieval | `group:memory` | — | [Reference](reference.md#tool-list) |
| Web tools | `web_search`, `web_fetch`, `x_search` — search and fetch web content | `group:web` | — | [Reference](reference.md#tool-list) |
| UI tools | `browser`, `canvas` — browser automation and artifact rendering | `group:ui` | — | [Reference](reference.md#tool-list) |
| Automation tools | `cron`, `gateway` — scheduling and gateway control | `group:automation` | — | [Reference](reference.md#tool-list) |
| Messaging tools | `message` — send messages to channels with explicit targets | `group:messaging` | — | [Reference](reference.md#tool-list) |
| Node tools | `nodes` — remote paired device operations | `group:nodes` | — | [Reference](reference.md#tool-list) |
| PDF tool | Read and extract content from PDF files | `pdf` tool | 2026.3.2 | [Reference](reference.md#tool-list) |
| Web search providers | DuckDuckGo and other bundled providers, plus official external providers such as Brave and Perplexity | `tools.web.search.provider`, `plugins.entries.<provider>.config.webSearch` | Exa/Tavily/Firecrawl: 2026.3.22; SearXNG: 2026.4.1 | [Phase 5](phases/phase-5-web-search.md) |
| Browser automation | Playwright-based browser with CDP protocol | `browser` tool | — | [Reference](reference.md#tool-list) |
| Cron jobs (isolated) | Fresh throwaway session per run with optional channel delivery | `cron.jobs[].sessionTarget: "isolated"` | — | [Reference](reference.md#cron-jobs) |
| Cron jobs (main) | Inject events into agent's existing main session | `cron.jobs[].sessionTarget: "main"` | — | [Reference](reference.md#cron-jobs) |
| Cron delivery modes | announce (channel), none (silent), webhook (HTTP POST) | `cron.jobs[].delivery` | — | [Reference](reference.md#cron-jobs) |
| Cron webhook triggers | External triggers for cron jobs via authenticated webhook | `cron.webhookToken` | 2026.2.16 | [Reference](reference.md#config-quick-reference) |
| Cron notify | Deliver cron output to a channel peer | `cron.notify` | 2026.2.16 | [Reference](reference.md#config-quick-reference) |
| Cron per-job tool allowlist | Restrict which tools a cron job can use via `--tools` flag | `openclaw cron --tools` | 2026.4.1 | [Reference](reference.md#cron-jobs) |
| Cron state/definition split | Job definitions in `cron/jobs.json` (stable, git-trackable); runtime execution state in `cron/jobs-state.json` (ephemeral, auto-rebuilt) | — | 2026.4.20 | [Phase 7](phases/phase-7-migration.md) |
| Background task flows | Unified background-run control plane with `openclaw flows list\|show\|cancel` | `openclaw flows` | 2026.3.31 | [Reference](reference.md#useful-commands) |
| Image generation (native) | Built-in image generation via `image_generate` tool | `agents.defaults.imageGenerationModel.primary` | 2026.3.22 | [Reference](reference.md#config-quick-reference) |
| Image generation (plugin) | Generate images via OpenRouter API (FLUX, Gemini, GPT, MiniMax image-01) | `generate_image` tool (image-gen plugin) | — (MiniMax: 2026.3.28) | [Extension](extensions/image-gen.md) |
| Video generation (native) | Built-in `video_generate` tool; providers include xAI, Alibaba Wan, Runway | `video_generate` tool | 2026.4.5 | [Official docs](https://docs.openclaw.ai) |
| Music generation (native) | Built-in `music_generate` tool; bundled Google Lyria and MiniMax providers; async delivery | `music_generate` tool | 2026.4.5 | [Official docs](https://docs.openclaw.ai) |
| ComfyUI workflows | Bundled `comfy` plugin for local/cloud ComfyUI; image, video, and music generation | `comfy` plugin | 2026.4.5 | [Official docs](https://docs.openclaw.ai) |
| Computer use | VM-based macOS interaction via 7 `vm_*` tools | `vm_*` tools (computer-use plugin) | — | [Phase 8](phases/phase-8-computer-use.md), [Extension](extensions/computer-use.md) |
| `openclaw infer` | First-class CLI hub for provider-backed inference workflows: model, media, web, and embedding tasks | `openclaw infer` | 2026.4.7 | [Official docs](https://docs.openclaw.ai) |
| Webhook ingress plugin | External automation creates and drives bound TaskFlows via per-route shared-secret endpoints | `plugins.entries.webhook-ingress` | 2026.4.7 | [Official docs](https://docs.openclaw.ai) |
| Google Meet | Bundled participant plugin — personal Google auth, Chrome/Twilio realtime sessions, paired-node Chrome support, artifact/attendance exports, `googlemeet recover-tab` recovery | `plugins.entries.google-meet` | 2026.4.24 | [Official docs](https://docs.openclaw.ai) |
| Browser coordinate clicks | Click at viewport coordinates for managed and existing-session browser automation | `browser` tool | 2026.4.24 | [Reference](reference.md#tool-list) |
| Browser action timeout | Configurable per-action timeout with 60 s default so long waits do not fail at the transport boundary | `browser.actionTimeoutMs` | 2026.4.24 | [Reference](reference.md#tool-list) |
| Browser per-profile headless | Override headless mode per locally launched browser profile | `browser.profiles.<name>.headless` | 2026.4.24 | [Official docs](https://docs.openclaw.ai) |
| Talk WebRTC voice | Browser WebRTC realtime voice sessions in Control UI backed by OpenAI Realtime; `openclaw_agent_consult` handoff for tool-backed answers | — | 2026.4.24 | [Official docs](https://docs.openclaw.ai) |
| Config migration | Import Claude Code, Claude Desktop, and Hermes configurations (instructions, MCP servers, skills, prompts, credentials) with dry-run preview and pre-migration backup | CLI: `openclaw migrate` | 2026.4.26 | [Official docs](https://docs.openclaw.ai) |
| Docker sandbox GPU passthrough | Opt-in `sandbox.docker.gpus` passthrough for Docker sandbox containers when the host Docker runtime supports `--gpus` | `sandbox.docker.gpus` | 2026.4.27 | [Custom Sandbox Images](custom-sandbox-images.md) |
| Cron failure alert for skipped jobs | Alert on persistently skipped jobs without counting skips as execution errors or affecting retry backoff | `cron.jobs[].failureAlert.includeSkipped` / `openclaw cron edit --failure-alert-include-skipped` | 2026.4.27 | [Reference](reference.md#cron-jobs) |
| Grok 4.3 bundled catalog | Grok 4.3 added to the bundled xAI catalog and set as the xAI default chat model | `agents.list[].model` | 2026.5.2 | [Official docs](https://docs.openclaw.ai) |
| File-transfer plugin | Bundled plugin with `file_fetch`, `dir_list`, `dir_fetch`, and `file_write` for binary file operations on paired nodes; path policy under `plugins.entries.file-transfer.config.nodes`; symlinks refused by default; 16 MB per-round-trip ceiling | `file_fetch`, `dir_list`, `dir_fetch`, `file_write` tools | 2026.5.3 | [Official docs](https://docs.openclaw.ai) |
| `/steer` command | Queue-independent steering of the active current-session run without starting a new turn | CLI: `/steer <message>` | 2026.5.3 | [Official docs](https://docs.openclaw.ai) |
| `/side` command alias | `/side` as a text and native slash-command alias for `/btw` side questions | CLI: `/side <message>` | 2026.5.3 | [Official docs](https://docs.openclaw.ai) |

### Use Cases

- **Isolated web search agent** — `web_search` + `web_fetch` on a dedicated agent, denied on main ([Phase 5](phases/phase-5-web-search.md))
- **Automated morning briefing** — cron job with isolated session + announce delivery ([Morning Briefing recipe](recipes/morning-briefing.md))
- **Knowledge vault management** — filesystem tools + memory for structured research ([Knowledge Vault recipe](recipes/knowledge-vault.md))
- **Image generation in chat** — `generate_image` tool via image-gen plugin ([Extension](extensions/image-gen.md))
- **VM computer automation** — execute tasks in a macOS VM via computer-use plugin ([Phase 8](phases/phase-8-computer-use.md))

### Known Issues

| Issue | Status | Impact | Workaround |
|-------|--------|--------|------------|
| [#14046](https://github.com/openclaw/openclaw/issues/14046) — ANNOUNCE_SKIP timing race in cron delivery | Open (PR [#15383](https://github.com/openclaw/openclaw/pull/15383)) | Agent returns ANNOUNCE_SKIP but delivery proceeds due to stale history | None |
| [#6535](https://github.com/openclaw/openclaw/issues/6535) — `after_tool_result` hook not wired | Open | Can't hook into tool results for post-processing | Use `before_tool_call` + pre-fetch pattern |

---

## Deployment & Operations

Running OpenClaw in production: service management, infrastructure, and day-to-day operations.

### Features

| Feature | Description | Config Key | Since | Guide |
|---------|-------------|------------|-------|-------|
| Gateway configuration | Mode, bind address, port, auth, hot-reload | `gateway.*` | — | [Reference](reference.md#config-quick-reference) |
| Config hot-reload | Automatic config reload without restart | `gateway.reload.mode: "auto"` | — | [Reference](reference.md#config-quick-reference) |
| LaunchAgent (macOS) | User-level service management via launchd | — | — | [Phase 6](phases/phase-6-deployment.md) |
| LaunchDaemon (macOS) | System-level hardened service (dedicated user, no shell) | — | — | [Phase 6](phases/phase-6-deployment.md) |
| systemd (Linux) | Linux service management with user or system units | — | — | [Phase 6](phases/phase-6-deployment.md) |
| Docker deployment | Containerized gateway with sandbox support | — | — | [Phase 6](phases/phase-6-deployment.md), [Scripts](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/docker-isolation) |
| VM deployment (macOS) | Lume / Parallels VMs for strongest host isolation | — | — | [Phase 6](phases/phase-6-deployment.md) |
| VM deployment (Linux) | Multipass / KVM VMs with Docker inside | — | — | [Phase 6](phases/phase-6-deployment.md) |
| Tailscale | Remote access via WireGuard mesh network | — | — | [Phase 6](phases/phase-6-deployment.md) |
| Health endpoints | `/health`, `/healthz`, `/ready`, `/readyz` for monitoring | — | 2026.3.1 | [Reference](reference.md#version-compatibility) |
| Logging | Configurable redaction and file size caps | `logging.*` | maxFileBytes: 2026.2.22 | [Reference](reference.md#config-quick-reference) |
| Migration | Move deployment to new machine (config, creds, memory, channels) | — | — | [Phase 7](phases/phase-7-migration.md) |
| Multi-gateway (profiles) | Multiple gateway configs via `--profile` flag | — | — | [Multi-Gateway](multi-gateway.md) |
| Multi-gateway (multi-user) | Separate OS users per gateway instance | — | — | [Multi-Gateway](multi-gateway.md) |
| Multi-gateway (VM variants) | One VM per channel for maximum isolation | — | — | [Multi-Gateway](multi-gateway.md) |
| Custom sandbox images | Build Docker images with pre-installed tools | — | — | [Custom Sandbox Images](custom-sandbox-images.md) |
| Diagnostics | `openclaw doctor`, `openclaw doctor --fix` | — | — | [Reference](reference.md#useful-commands) |
| Light context heartbeat | Reduced context for heartbeat cycles to save tokens | `agents.*.heartbeat.lightContext` | 2026.3.1 | [Reference](reference.md#version-compatibility) |
| Docker timezone support | `OPENCLAW_TZ` environment variable for container timezone | `OPENCLAW_TZ` env var | 2026.3.13-1 | [Phase 6](phases/phase-6-deployment.md) |
| Node.js version guard | Runtime enforces Node.js 22.14+ minimum (Node 24 recommended) | — | 2026.3.13-1 (lowered 2026.3.24) | [Phase 1](phases/phase-1-getting-started.md) |
| Gateway diagnostics export | Support-ready diagnostics export with sanitized logs, status, health, config, and stability snapshots | CLI: `openclaw diagnostics` | 2026.4.22 | [Official docs](https://docs.openclaw.ai) |
| OTEL diagnostics | Opt-in OpenTelemetry span export for runs, model calls, and tool executions; content capture disabled by default | `diagnostics.otel.endpoint` | 2026.4.24 | [Official docs](https://docs.openclaw.ai) |
| Matrix self device verification | Full cross-signing identity trust for self-device verification via CLI | CLI: `openclaw matrix verify self` | 2026.4.24 | [Official docs](https://docs.openclaw.ai) |
| Node pairing auto-approve CIDRs | Disabled-by-default auto-approval for first-time node pairing from explicit trusted CIDRs; all upgrade flows remain manual | `gateway.nodes.pairing.autoApproveCidrs` | 2026.4.24 | [Official docs](https://docs.openclaw.ai) |
| Auto-update kill switch | `OPENCLAW_NO_AUTO_UPDATE=1` disables background package auto-updates for deliberate version holds during incident recovery, without editing config | `OPENCLAW_NO_AUTO_UPDATE` env var | 2026.4.26 | [Phase 6](phases/phase-6-deployment.md) |
| Matrix E2EE setup | One-command Matrix encryption setup, recovery bootstrap, and verification status via `openclaw matrix encryption setup` | CLI: `openclaw matrix encryption setup` | 2026.4.26 | [Official docs](https://docs.openclaw.ai) |
| Node stale entry removal | Remove stale gateway-owned node pairing records without hand-editing state files | CLI: `openclaw nodes remove --node <id\|name\|ip>` | 2026.4.26 | [Official docs](https://docs.openclaw.ai) |
| Gateway restart flags | `openclaw gateway restart --force` and `--wait <duration>` for immediate restarts or timed drain waits | CLI: `openclaw gateway restart --force/--wait` | 2026.5.2 | [Official docs](https://docs.openclaw.ai) |
| Gateway config fail-closed | Invalid config now causes gateway startup and hot-reload to fail closed; `openclaw doctor --fix` owns last-known-good repair instead of auto-restore on load | — | 2026.5.3 | [Phase 6](phases/phase-6-deployment.md) |
| `OPENCLAW_SKIP_ONBOARDING` | Skip the interactive onboarding wizard for automated Docker installs while still applying gateway defaults | `OPENCLAW_SKIP_ONBOARDING=1` env var | 2026.4.29 | [Phase 6](phases/phase-6-deployment.md) |
| Models auth list | Inspect saved per-agent auth profiles without dumping secrets; filterable by provider | CLI: `openclaw models auth list [--provider <id>] [--json]` | 2026.5.4 | [Reference](reference.md#useful-commands) |
| Sessions list pagination | `openclaw sessions` capped at 100 rows by default with `--limit <n\|all>` override to control output size on large stores | CLI: `openclaw sessions list --limit` | 2026.5.4 | [Reference](reference.md#useful-commands) |

### Use Cases

- **Single-machine production** — LaunchAgent + Docker sandbox + Tailscale ([Phase 6](phases/phase-6-deployment.md))
- **Hardened daemon** — LaunchDaemon with dedicated user, no login shell ([Phase 6](phases/phase-6-deployment.md))
- **Multi-user setup** — separate OS users per gateway for channel separation ([Multi-Gateway](multi-gateway.md))
- **Machine migration** — step-by-step procedure for moving everything to new hardware ([Phase 7](phases/phase-7-migration.md))
- **Custom tooling** — pre-built sandbox images with project-specific packages ([Custom Sandbox Images](custom-sandbox-images.md))

### Known Issues

No major open issues affecting deployment.

---

## Internals

### Plugin System & Architecture

How the gateway works under the hood — the module system, plugin lifecycle, and extension points.

#### Features

| Feature | Description | Config Key | Since | Guide |
|---------|-------------|------------|-------|-------|
| `before_dispatch` hook | Intercept inbound messages before routing with canonical metadata | Plugin API | 2026.3.24 | [Reference](reference.md#plugin-hooks) |
| `before_tool_call` hook | Intercept tool calls before execution; supports async `requireApproval` to pause for user confirmation (used by content-guard, network-guard) | Plugin API | 2026.2.1 (`requireApproval`: 2026.3.28) | [Reference](reference.md#plugin-hooks) |
| `before_agent_reply` hook | Short-circuit the LLM with synthetic replies after inline actions | Plugin API | 2026.4.2 | [Reference](reference.md#plugin-hooks) |
| `before_agent_finalize` hook | Intercept and modify agent replies after generation but before finalization and delivery | Plugin API | 2026.4.25 | [Reference](reference.md#plugin-hooks) |
| `message_received` hook | Intercept incoming channel messages (used by channel-guard) | Plugin API | — | [Reference](reference.md#plugin-hooks) |
| `llm_input` hook | Intercept prompts before sending to model | Plugin API | 2026.2.16 | [Reference](reference.md#plugin-hooks) |
| `llm_output` hook | Intercept model responses after receiving | Plugin API | 2026.2.16 | [Reference](reference.md#plugin-hooks) |
| Plugin SDK | Public plugin SDK surface via `openclaw/plugin-sdk/*` subpaths (`openclaw/extension-api` removed) | `openclaw/plugin-sdk/*` | 2026.3.22 | [Reference](reference.md#plugin-installation) |
| Plugin discovery | Workspace → user-level → bundled; first match wins | `~/.openclaw/extensions/` | — | [Reference](reference.md#plugin-installation) |
| Plugin allow/deny | Allowlist + per-plugin enabled flag; both must pass | `plugins.allow`, `plugins.entries.*.enabled` | — | [Reference](reference.md#plugins) |
| Plugin startup declaration | Explicit `activation.onStartup` metadata in plugin manifests so only plugins that intentionally register startup-time surfaces are loaded at boot | Plugin manifest | 2026.4.27 | [Official docs](https://docs.openclaw.ai) |
| Plugin tool registration | Plugins can register custom tools (image-gen → `generate_image`, computer-use → `vm_*`) | Plugin API | — | [Reference](reference.md#plugins) |
| Plugin configuration | Per-plugin config block with model, thresholds, timeouts | `plugins.entries.*` | — | [Reference](reference.md#plugin-installation) |
| Single-process gateway | Node.js process handling all agents, channels, sessions, and UI | — | — | [Architecture](architecture.md) |
| Session router & queue | Route incoming messages to the correct agent session | — | — | [Architecture](architecture.md), [Sessions](sessions.md) |
| Channel connectors | Protocol adapters for each messaging platform | — | — | [Architecture](architecture.md) |
| WebSocket protocol v3 | Real-time streaming for Control UI and HTTP API | — | — | [Architecture](architecture.md) |
| HTTP API | OpenAI-compatible `/v1/chat/completions` endpoint | `gateway.*` | — | [Architecture](architecture.md) |
| Control UI | Browser-based operator interface (Vite + Lit) | — | — | [Architecture](architecture.md) |
| Control UI Model Auth status | Overview card showing OAuth token health and provider rate-limit pressure; attention callouts when tokens are expiring or expired; backed by `models.authStatus` gateway method (cached 60s, credentials stripped) | Control UI overview | 2026.4.15 | [Official docs](https://docs.openclaw.ai) |
| mDNS discovery | Local network service discovery | `discovery.mdns` | — | [Reference](reference.md#config-quick-reference) |
| Tool system | Unified tool dispatch with policy enforcement | — | — | [Architecture](architecture.md) |

#### Use Cases

- **Custom guard plugin** — use `before_tool_call` hook to intercept and validate tool calls ([Extension docs](extensions/))
- **Input/output logging** — `llm_input`/`llm_output` hooks for compliance and auditing ([Reference](reference.md#plugin-hooks))
- **Custom tool plugin** — register new tools accessible by agents (e.g., image-gen, computer-use) ([Extension docs](extensions/))
- **API integration** — use the HTTP API for programmatic agent interaction ([Architecture](architecture.md))

#### Known Issues

| Issue | Status | Impact | Workaround |
|-------|--------|--------|------------|
| [#6535](https://github.com/openclaw/openclaw/issues/6535) — `after_tool_result` hook not wired | Open | Can't hook into tool results for post-processing or content scanning | Use `before_tool_call` + pre-fetch pattern for content scanning |
