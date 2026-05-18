# Changelog

All notable guide content updates are documented here.
This changelog tracks documentation changes — not OpenClaw releases themselves.

## 2026-05-18 — OpenClaw 2026.5.7 → 2026.5.12

- **WhatsApp externalized as plugin**: Phase 4 WhatsApp setup now opens with `openclaw plugins install whatsapp` (step 1 of 5) before the config and channel-login steps, reflecting that WhatsApp was moved out of the core npm bundle in 2026.5.12
- **Feature Atlas — Channels & Messaging**: added rows for WhatsApp external plugin requirement, Slack `unfurlLinks`/`unfurlMedia` preview suppression, Discord `voice.allowedChannels` restriction, and `talk.realtime.instructions` for realtime voice style config
- **Feature Atlas — Security & Hardening**: added rows for tool restrictions inherited by delegated sessions (subagents and ACP relays cannot exceed parent tool policy), `skills.install.allowUploadedArchives` security gate for skill archive uploads, and a batch entry covering the 2026.5.12 gateway/browser/pairing/sandbox/transcript hardening pass
- **Feature Atlas — Tools & Automation**: added rows for `tools.exec.commandHighlighting` (exec approval command highlighting), `tools.perSender` per-sender tool policies, `openclaw cron get <id>` single-job inspect command, and `/context map` context treemap command
- **Feature Atlas — Agents & Configuration**: added rows for `acp.fallbacks` (backup ACP runtime backends), `tools.message.crossContext` (per-agent message send restriction), and `tools.message.actions.allow` (per-agent send-only message policy)
- **Feature Atlas — Deployment & Operations**: added `openclaw channels status --channel <name>` filtering for targeted per-channel status probes
- **Feature Atlas — Internals**: added `session_end` `shutdown`/`restart` hook reasons (fires for all active sessions on gateway stop/restart with 2 s drain budget)
- **Version housekeeping**: bumped `.guide-version`, docs index callout, and hardened-multi-agent prerequisite line to 2026.5.12
- **Note**: security-review.md version checklist entry (≥ 2026.5.12: gateway/browser/pairing/sandbox hardening) could not be written due to environment permission restrictions on `.claude/commands/`; no pending cleanup items from CLAUDE.md were resolved in this release

## 2026-05-11 — OpenClaw 2026.5.6 → 2026.5.7

- Updated guide baseline to **2026.5.7** in `.guide-version`, `content/docs/_index.md`, and `content/docs/hardened-multi-agent.md`
- Added **2026.5.7 version compatibility row** to `reference.md`: documents channels CLI redesign, Active Memory admin scope, auto-reply skill authorization, `archiveAfterMinutes`, Discord voice silence grace, and cron JSON status field
- Added `openclaw channels list` and `openclaw channels list --all` to **useful commands** in `reference.md` — the command is now channel-only by default (2026.5.7+); `--all` shows bundled and catalog channels
- Added `agents.defaults.subagents.archiveAfterMinutes` commented option to **config quick reference** in `reference.md` — replaces the previously hardcoded 5-minute subagent registry TTL
- Added **version note (2026.5.7)** to `phase-3-security.md` covering: Active Memory admin scope for global toggles, auto-reply skill dispatch now gated by `before_tool_call` hooks, and native command owner enforcement hardened
- Added **Discord voice silence grace** (`channels.discord.voice.captureSilenceGraceMs`) row to Channels features table in `feature-atlas.md`
- Added three **Security & Hardening** rows to `feature-atlas.md`: Active Memory admin scope, auto-reply skill authorization, and native command owner enforcement
- **Note:** `.claude/commands/security-review.md` checklist item for ≥ 2026.5.7 requires permission approval — add manually: `- [ ] Version ≥ 2026.5.7 (Active Memory global toggles require admin scope; auto-reply skill dispatch gated by before_tool_call hooks; native command owner enforcement hardened)`
- **Pass 2 (improvement scan):** No pending cleanup items from `CLAUDE.md` are resolved by 2026.5.7 — `#11758` (WhatsApp `requireMention` LID bug) remains open as the 2026.5.7 WhatsApp LID fix addresses proactive sends only, not mention detection. No correctness, consistency, or completeness issues found beyond the changelog-driven updates.

## 2026-05-07 — OpenClaw 2026.5.3-1 → 2026.5.6

- Bumped guide version to 2026.5.6 in `.guide-version`, `_index.md` callout, and `hardened-multi-agent.md` prerequisite line
- Added `openclaw models auth list [--provider <id>] [--json]` CLI command to reference.md Useful Commands (2026.5.4 — inspect saved per-agent auth profiles without exposing secrets)
- Added `openclaw sessions list --limit <n|all>` flag to reference.md (2026.5.4 — sessions output now capped at 100 rows by default)
- Added `agents.defaults.toolProgressDetail: "compact"|"raw"` config option to reference.md Config Quick Reference (2026.5.4 — control tool-progress verbosity in channel streaming progress drafts)
- Added `tools.loopDetection.postCompactionGuard.windowSize` config option to reference.md (2026.5.4 — abort agent runs that emit the same tool/args/result triple N times after auto-compaction)
- Added three new Feature Atlas rows in Agents & Configuration: tool progress verbosity and post-compaction loop guard (both 2026.5.4)
- Added streaming command-text control Feature Atlas row in Channels & Messaging: `streaming.preview.commandText` / `streaming.progress.commandText: "status"` (2026.5.4 — hide exec text in preview progress lines)
- Added Docker gateway container hardening Feature Atlas row in Security & Hardening (2026.5.5 — bundled docker-compose.yml drops NET_RAW/NET_ADMIN, enables no-new-privileges)
- Added models auth list and sessions list pagination Feature Atlas rows in Deployment & Operations (2026.5.4)
- Added Docker/Gateway security hardening callout to Phase 6 Docker Containerized section (2026.5.5 — regenerate compose file or add cap_drop/security_opt manually for older installs)
- Note: `.claude/commands/security-review.md` Version ≥ 2026.5.5 checklist item (Docker gateway drops NET_RAW/NET_ADMIN + no-new-privileges) could not be written due to environment permission restrictions — add manually under "Version & Known Vulnerabilities"

## 2026-05-07 — Guard extensions, web search config, and personal assistant recipe

- Bumped the guide baseline to **OpenClaw 2026.5.6** and updated the docs index, hardened multi-agent prerequisite, project memory, and security review checklist references
- Patched guard extensions for the current OpenClaw plugin SDK: `channel-guard` now blocks via `before_dispatch`, queues medium-confidence warnings through `enqueueNextTurnInjection`, and fails closed when warning injection cannot be queued; `content-guard`, `file-guard`, and `network-guard` now use hook context for agent/workspace resolution instead of stale event fields
- Updated guard extension tests for the 2026.5.6 hook shapes, including coverage for `before_dispatch`, search-agent caller detection, runtime workspace resolution, and failed warning injection
- Updated Phase 5 web search setup to match current OpenClaw docs: shared search settings stay under `tools.web.search.*`, while provider credentials and provider-specific options live under `plugins.entries.<provider>.config.webSearch.*`
- Updated DuckDuckGo, Brave, Perplexity/OpenRouter, Grok/xAI, and SearXNG examples, including Brave `llm-context` mode and SearXNG `baseUrl`
- Updated recommended, basic, and pragmatic example configs to use DuckDuckGo by default, explicitly enable `plugins.bundledDiscovery: "allowlist"`, and include the selected `web_search` provider plugin in restrictive `plugins.allow` lists
- Updated tool group references so `group:web` includes `x_search`, and documented `x_search` alongside `web_search`/`web_fetch` in restrictive-agent deny lists
- Added a Personal Assistant Setup recipe for a private OpenClaw assistant reachable from WhatsApp, Signal, Slack, or Telegram
- Included channel-specific starter blocks for WhatsApp, Signal, Slack, and Telegram with conservative allowlist, group policy, and mention-gating guidance
- Added reusable AGENTS.md operating instructions for personal-assistant behavior, privacy boundaries, memory use, task/reminder conventions, outbound-message confirmation, and group-chat etiquette
- Added verification steps and cautious heartbeat/proactive-mode setup, and linked the recipe from the Recipes index

## 2026-05-04 — OpenClaw 2026.4.27 → 2026.5.3-1

- Updated `.guide-version`, `content/docs/_index.md`, and `content/docs/hardened-multi-agent.md` to **OpenClaw 2026.5.3-1** (mechanical housekeeping)
- Added `RestartPreventExitStatus=78` to the systemd unit in Phase 6 — prevents restart loops when the gateway exits due to a port conflict or lock file (v2026.4.29 fix)
- Added `OPENCLAW_SKIP_ONBOARDING=1` env var note to Phase 6 Docker Containerized section for automated/CI installs (v2026.4.29)
- Added 14 new rows to Feature Atlas across Agents, Channels, Tools, Deployment, and Security sections: commitments, thread-bound session spawning, `skipOptionalBootstrapFiles`, WhatsApp Newsletter targets, streaming progress drafts, Grok 4.3 catalog, file-transfer plugin, `/steer` + `/side` commands, `gateway restart --force/--wait`, gateway config fail-closed, `OPENCLAW_SKIP_ONBOARDING`, timing-safe credential compare, COMSPEC/CLOUDSDK_PYTHON env blocking, tool profile restriction narrowing, workspace state-dir env block, and Gateway env file secrets preservation
- Added gotcha 6 to reference.md: `tools.exec`/`tools.fs` no longer implicitly widen restrictive profiles (`messaging`, `minimal`) — explicit `alsoAllow` required (v2026.4.29 breaking change)
- Added gotcha 28b to reference.md: invalid config now fails closed on startup/hot-reload; `openclaw doctor --fix` owns last-known-good repair (v2026.5.3 behavior change)
- Note: `.claude/commands/security-review.md` version checklist item (timing-safe compare, log sanitization, workspace env injection blocking) could not be written due to environment permission restrictions on the `.claude/` directory

## 2026-04-30 — OpenClaw 2026.4.24 → 2026.4.27

- Bumped guide baseline to **2026.4.27** — updated `.guide-version`, version callout in `content/docs/_index.md`, and prerequisite line in `content/docs/hardened-multi-agent.md`
- Added **Security & Hardening** atlas entries (2026.4.25–4.27): device token scope containment (pairing-only sessions cannot mutate operator tokens), session transcript redaction applied to persisted JSONL, opt-in outbound proxy routing (`proxy.enabled` / `proxy.proxyUrl`), managed LaunchAgent secrets loaded from owner-only env files instead of plist `EnvironmentVariables`, and media MIME sanitization hardening
- Added **Agents & Configuration** atlas entries: `agents.defaults.compaction.maxActiveTranscriptBytes` preflight compaction trigger (2026.4.26) and `models.pricing.enabled` for offline/restricted-network installs (2026.4.27)
- Added **Channels & Messaging** atlas entry: Tencent Yuanbao channel via `openclaw-plugin-yuanbao` external plugin (2026.4.27)
- Added **Sessions & Memory** atlas entries: asymmetric embedding config (`memorySearch.queryInputType` / `documentInputType`, 2026.4.26) and `dreaming.model` override for Dream Diary narrative subagents (2026.4.26)
- Added **Tools & Automation** atlas entries: `openclaw migrate` config importer (2026.4.26), `sandbox.docker.gpus` passthrough (2026.4.27), and `cron.jobs[].failureAlert.includeSkipped` (2026.4.27)
- Added **Deployment & Operations** atlas entries: `OPENCLAW_NO_AUTO_UPDATE=1` kill switch (2026.4.26), `openclaw matrix encryption setup` (2026.4.26), and `openclaw nodes remove --node` (2026.4.26)
- Added **Plugin System** atlas entries: `before_agent_finalize` hook (2026.4.25) and explicit `activation.onStartup` plugin manifest declarations (2026.4.27)
- Added Phase 6 deployment note on **`OPENCLAW_NO_AUTO_UPDATE=1`** in the Incident Response section — hold automatic package updates during incident recovery without editing config
- Added Phase 6 deployment note on **`models.pricing.enabled: false`** for air-gapped / restricted-network VPS installs that cannot reach OpenRouter or LiteLLM pricing catalogs at startup
- Note: `.claude/commands/security-review.md` could not be updated (write-protection hook blocks all writes to `.claude/`); the two new version checklist items (2026.4.25 and 2026.4.27) should be added manually

## 2026-04-27 — OpenClaw 2026.4.21 → 2026.4.24

- Phase 2 memory: `node-llama-cpp` is no longer bundled by default (2026.4.24) — added explicit `npx pnpm add node-llama-cpp` install step to local embedding setup and updated verification checklist accordingly
- Phase 2 memory: documented that dreaming is now fully decoupled from heartbeat (2026.4.23); added migration note to run `openclaw doctor --fix` for stale cron jobs
- Phase 2 memory: documented new `memorySearch.local.contextSize` config option for tuning local embedding context on RAM-constrained hosts (2026.4.23)
- Feature Atlas security: added 8 new hardening entries covering plugin integrity drift fail-closed, Control UI config endpoint auth, WhatsApp/group-chat prompt injection fencing, gateway config allowlist approach, exec-approval explicit enablement, MCP owner-tool privilege escalation fix, and browser SSRF policy in sandboxed sessions (2026.4.22–2026.4.24)
- Feature Atlas channels: added WhatsApp native reply quoting (`replyToMode`) and per-group/direct system prompts injected as `GroupSystemPrompt` context (2026.4.22)
- Feature Atlas tools: added Google Meet bundled plugin (personal auth, Chrome/Twilio, artifact/attendance exports), browser coordinate clicks, `browser.actionTimeoutMs` 60 s default, per-profile headless override, and Talk WebRTC realtime voice sessions (2026.4.24)
- Feature Atlas agents: added DeepSeek V4 Flash/Pro bundled catalog (V4 Flash is new onboarding default) and `agents.defaults.contextInjection: "never"` bootstrap control (2026.4.24)
- Feature Atlas memory: added `memorySearch.local.contextSize`, dreaming heartbeat-independence row, and hybrid search raw `vectorScore`/`textScore` exposure (2026.4.23–2026.4.24)
- Feature Atlas deployment: added gateway diagnostics export (2026.4.22), OTEL span export, Matrix self-device verification (`openclaw matrix verify self`), and node pairing `autoApproveCidrs` (2026.4.24)

## 2026-04-23 — OpenClaw 2026.4.15 → 2026.4.21

- Added Phase 3 security version notes for 2026.4.20 (dotenv `OPENCLAW_*` env key blocking from workspace `.env`; non-admin device pairing scope restriction; gateway tool mutation guard extended to cover per-agent `agents.list[]` overrides; WebSocket broadcast auth requires `operator.read` for chat/agent events; MCP stdio servers block interpreter-startup env keys like `NODE_OPTIONS`) and 2026.4.21 (`enforceOwnerForCommands` bypass via permissive `allowFrom` wildcard or empty `ownerAllowFrom` fixed)
- Added security review checklist items for versions ≥ 2026.4.20 and ≥ 2026.4.21 in `.claude/commands/security-review.md` (pending user permission approval — write was blocked by permission mode)
- Added 9 new rows to the Feature Atlas security section covering the 2026.4.20–2026.4.21 security hardening (dotenv blocking, device pairing scope, gateway tool guard extension, WebSocket broadcast auth, MCP env injection blocking, `enforceOwnerForCommands` fix)
- Added cron state/definition split row to Feature Atlas tools section: `cron/jobs.json` (definitions, stable) vs `cron/jobs-state.json` (runtime state, ephemeral) — since 2026.4.20
- Added `cron/jobs.json` row to Phase 7 migration overview table noting to copy definitions but skip `jobs-state.json` (auto-rebuilt on target)
- Added note to reference.md cron section explaining the `cron/jobs.json` vs `cron/jobs-state.json` split and migration guidance
- Bumped `.guide-version` to `2026.4.21`, updated "last reviewed against" callout in `content/docs/_index.md`, and updated prerequisite line in `content/docs/hardened-multi-agent.md`

## 2026-04-20 — OpenClaw 2026.4.14 → 2026.4.15

- Updated memory dreaming storage default: `dreaming.storage.mode` changed from `inline` to `separate` (2026.4.15) — dreaming phase blocks now land in `memory/dreaming/{phase}/YYYY-MM-DD.md` instead of being injected into daily memory files; Phase 2 documents the opt-out config for operators who relied on inline behavior
- Added GitHub Copilot as a memory search embedding provider to Phase 2 provider table and Feature Atlas
- Added LanceDB cloud storage support for durable memory indexes to Feature Atlas
- Added Control UI Model Auth status card (OAuth token health and provider rate-limit pressure at a glance) to Feature Atlas
- Added local model lean mode (`agents.defaults.experimental.localModelLean: true`) to Feature Atlas — drops heavyweight tools for weaker local-model setups
- Added v2026.4.15 security version note block to Phase 3 covering: exec approval secret redaction, gateway auth bearer resolved per-request (token rotation now immediately effective on HTTP without restart), MCP loopback constant-time comparison, workspace file symlink hardening, QMD memory path restriction closing a tool-policy bypass
- Added exec approval secret redaction, gateway auth per-request resolution, and workspace file symlink hardening rows to Feature Atlas Security section
- Note: `.claude/commands/security-review.md` v2026.4.15 checklist item could not be applied — write permission was not granted; the item to add is: `- [ ] Version ≥ 2026.4.15 (secrets redacted in exec approvals, gateway auth token rotation effective immediately on HTTP, workspace file symlink hardening, QMD memory path restriction)`

## 2026-04-16 — OpenClaw 2026.4.11 → 2026.4.14

- **Phase 3 security: 2026.4.12 version note added** — documents exec safe-bins hardening (busybox/toybox removed), approval list now fails closed on empty list, shell-wrapper/env-argv injection blocked, and gateway startup now rejects placeholder credentials copied from `.env.example`
- **Phase 3 security: 2026.4.14 version note added** — documents model-facing `config.patch`/`config.apply` blocked for all `openclaw security audit`-flagged flags (extending the 2026.4.7 exec write lock), browser SSRF enforced on snapshot/screenshot/tab routes, Control UI ReDoS fix (marked.js replaced with markdown-it), and doctor/systemd no longer re-embeds dotenv secrets on repair
- **Security review checklist updated** — added `Version ≥ 2026.4.12` and `Version ≥ 2026.4.14` checklist items covering the major security hardening in each release (note: permission was not granted to write this file, so this change was not applied)
- **Reference version compatibility table updated** — added 2026.4.12 entry (LM Studio provider, Active Memory improvements, security hardening) and 2026.4.14 entry (extended gateway-tool restriction, browser SSRF routes, ReDoS fix, doctor/systemd fix, Ollama streaming fix, sendPolicy fix)
- **Feature atlas updated** — added LM Studio bundled provider row (since 2026.4.12) and self-hosted private network opt-in row (since 2026.4.10) under Agents & Configuration; updated "Gateway config exec write lock" row to note the 2026.4.14 extension covering all security-audit-flagged flags
- **Version housekeeping** — bumped `.guide-version`, docs index, and hardened-multi-agent prerequisite line to `2026.4.14`

## 2026-04-13 — OpenClaw 2026.4.9 → 2026.4.11

- Updated version references to 2026.4.11 in `.guide-version`, `content/docs/_index.md`, and `content/docs/hardened-multi-agent.md` (mechanical housekeeping)
- Added Phase 3 security version note for 2026.4.10: browser/sandbox SSRF navigation hardening, exec preflight + host-media `toolsBySender` authorization, hook event trust (agent hook events marked untrusted), dreaming admin scope required for persistent `/dreaming` changes, gateway/pairing fail-closed for no-token device records
- Added **Active Memory** feature row to Feature Atlas Sessions & Memory table (2026.4.10): optional plugin that auto-surfaces relevant context before each reply without explicit "remember" prompts
- Added **Dreaming ChatGPT import + memory-wiki** feature row to Feature Atlas Sessions & Memory table (2026.4.11): ChatGPT import ingestion, `Imported Insights` and `Memory Palace` diary subtabs
- Added version compatibility table entries for 2026.4.2 through 2026.4.11 in `content/docs/reference.md`, covering breaking exec YOLO default (4.2), legacy config alias removal (4.5), exec env sanitization + webhook-ingress (4.7), SSRF/CRLF fixes (4.9), Active Memory + exec-policy command + security hardening (4.10), and Dreaming memory-wiki + asyncCompletion schema fix (4.11)
- **Note:** `.claude/commands/security-review.md` version ≥ 2026.4.10 checklist entry was not added — write permission was denied during this run; add manually: `- [ ] Version ≥ 2026.4.10 (browser/sandbox SSRF hardening, exec preflight + host-media auth via toolsBySender, hook event trust, dreaming admin scope required)`

## 2026-04-09 — OpenClaw 2026.4.5 → 2026.4.9

- Updated version references to 2026.4.9 in `.guide-version`, docs index, and hardened-multi-agent prerequisites (mechanical housekeeping)
- Added Phase 3 security version note for 2026.4.7: extended host exec env sanitization (Java, Rust, Cargo, Git, Kubernetes, cloud creds, Helm vars blocked); gateway config write lock preventing model turns from weakening exec approval policy (safeBins, strictInlineEval); /allowlist owner-auth requirement; fetch redirect body drop on 307/308 cross-origin; browser SSRF redirect tracking; runtime event trust (notifyOnExit, ACP relays, wake-hook marked untrusted); ClawHub plugin archive SHA-256 verification; gateway auth session invalidation on token rotation
- Added Phase 3 security version note for 2026.4.9: browser SSRF interaction-bypass fix (blocked-destination checks re-run after click/evaluate navigations); workspace .env blocked from overriding runtime-control env vars; remote node exec events marked untrusted; plugin onboarding auth isolation; basic-ftp forced to 5.2.1 for CRLF injection fix
- Updated Phase 2 dreaming tooling to document `rem-harness --path` for grounded REM historical backfill (2026.4.9); added note about Control UI diary view
- Added Phase 2 version note for pluggable compaction provider registry (`agents.defaults.compaction.provider`, 2026.4.7)
- Feature Atlas — Sessions & Memory: added Dreaming REM historical backfill and Dreaming diary view rows (2026.4.9); added Pluggable compaction provider row (2026.4.7)
- Feature Atlas — Agents & Configuration: added System prompt override row (`agents.defaults.systemPromptOverride`, 2026.4.7)
- Feature Atlas — Tools & Automation: added `openclaw infer` CLI hub and Webhook ingress plugin rows (2026.4.7)
- Feature Atlas — Security & Hardening: added Runtime event trust hardening, Plugin archive integrity, Gateway config exec write lock, and Dotenv runtime-control env blocking rows (2026.4.7–2026.4.9)
- Note: security-review.md version checklist items for 2026.4.7 and 2026.4.9 could not be written — the `.claude/commands/` path was blocked by the automated environment's permission system despite being listed as an allowed path in CLAUDE.md

## 2026-04-06 — OpenClaw 2026.4.1 → 2026.4.5

- Added version notes for 2026.4.2 security changes to Phase 3: exec now defaults to YOLO mode (security=full, ask=off) for host exec, gateway session kill scope enforcement, channel setup plugin hardening, additional exec env injection blocks, dotenv OPENCLAW_PINNED_PYTHON protection, and transport policy centralization
- Added version notes for 2026.4.5 security changes to Phase 3: plugin tool allowlists enforced and fail-closed on `before_tool_call` crash, `/allowlist` requires owner access, SSRF redirect bypass blocked, plugin route scope fix, Claude CLI env isolation, device pairing hardening, and legacy config alias removal (`agents.*.sandbox.perSession`, `browser.ssrfPolicy.allowPrivateNetwork`, `hooks.internal.handlers`, channel `allow` toggles)
- Added Memory Dreaming section to Phase 2: covers the new experimental background memory promotion feature (light/deep/REM phases), basic config (`dreaming.enabled`, `dreaming.frequency`), aging controls (`recencyHalfLifeDays`, `maxAgeDays`), and CLI tooling (`rem-harness`, `promote-explain`)
- Added Amazon Bedrock embeddings provider to Phase 2 memory search providers table (Titan, Cohere, Nova, TwelveLabs; AWS credential-chain auto-detection)
- Added `compaction.notifyUser` version note to Phase 2 (opt-in suppression of the compacting notice, since 2026.4.2)
- Updated Feature Atlas Sessions & Memory table: added Amazon Bedrock embeddings, memory dreaming (enabled/frequency), dreaming aging controls, dreaming REM tooling, and compaction notifyUser rows
- Updated Feature Atlas Channels table: added `contextVisibility` per-channel config (filter supplemental context by sender allowlist)
- Updated Feature Atlas Tools table: added `video_generate` (native, xAI/Wan/Runway providers), `music_generate` (native, Google Lyria/MiniMax), and ComfyUI workflow plugin rows
- Updated Feature Atlas Internals table: added `before_agent_reply` hook (short-circuit LLM with synthetic replies, since 2026.4.2); updated plugin hook count in diagram from 4 to 6

## 2026-04-02 — OpenClaw 2026.3.28 → 2026.4.1

- Added SearXNG as a self-hosted `web_search` provider option in Phase 5, with config example showing `provider: "searxng"` and `searxng.host` — no API key required, queries stay on-prem (v2026.4.1)
- Added `memorySearch.qmd.extraCollections` note in Phase 2 QMD section for per-agent cross-agent session search without flattening all collections into a shared namespace (v2026.3.31)
- Added `agents.defaults.params` global default provider parameters entry to the Feature Atlas and Reference config quick reference (v2026.4.1)
- Added QQ Bot bundled channel plugin row to Feature Atlas Channels table with `channels.qqbot` config key (v2026.3.31)
- Added WhatsApp emoji reactions row to Feature Atlas Channels table with `reactionLevel` config key (v2026.3.31 + v2026.4.1)
- Added `cron --tools` per-job tool allowlist feature to Feature Atlas and Reference, with CLI example showing how to restrict cron jobs to specific tools (v2026.4.1)
- Added `openclaw flows list|show|cancel` background task flow control to Feature Atlas Tools section and Reference useful commands (v2026.3.31)
- Added `QMD cross-agent collections` row to Feature Atlas Sessions & Memory table (v2026.3.31)
- Added three security feature rows to Feature Atlas Security table: exec env injection blocking, plugin install fail-closed, and gateway auth hardening (v2026.3.31)
- Updated Reference tool list to reflect expanded `web_search` provider support (SearXNG, xAI, and others)
- Added version compatibility rows for 2026.3.31 (breaking changes summary) and 2026.4.1 (new features) in Reference version notes table
- Bumped `.guide-version` to `2026.4.1`, updated "last reviewed against" callout in `content/docs/_index.md`, and updated prerequisite line in `content/docs/hardened-multi-agent.md`

## 2026-03-30 — OpenClaw 2026.3.24 → 2026.3.28

- Updated version references to 2026.3.28 in `.guide-version`, `content/docs/_index.md`, and `content/docs/hardened-multi-agent.md` (mechanical housekeeping)
- Added `openclaw config schema` command (new in 2026.3.28) to the Config Validation section and Useful Commands in `reference.md`, and as a new row in the Feature Atlas Agents & Configuration table
- Updated `tools.sandbox.tools.alsoAllow` gotchas in `reference.md`: the key is now honored as of 2026.3.28 (previously documented as non-functional); users on older versions still need the full `allow` list
- Added async `requireApproval` to `before_tool_call` plugin hook documentation in `reference.md` Plugin Hooks table and Feature Atlas internals table — plugins can now pause tool execution and prompt for user approval via exec overlay, Telegram, Discord, or `/approve`
- Added MiniMax `image-01` image generation provider support to Feature Atlas Tools & Automation image-gen plugin row (2026.3.28)
- Added version entry for 2026.3.28 to the Version Compatibility table in `reference.md`, including the breaking Config/Doctor migration change: legacy config keys older than two months now fail validation instead of being silently rewritten; run `openclaw doctor --fix` on the old version before upgrading old configs
- Added Config/Doctor breaking change as gotcha #28a in `reference.md`
- Added version ≥ 2026.3.28 checklist item to `.claude/commands/security-review.md` noting that `openclaw security audit` now recognizes Gemini, Grok/xAI, Kimi, Moonshot, and OpenRouter credentials (write was blocked by session permissions — requires manual addition of: `- [ ] Version ≥ 2026.3.28 (security audit now recognizes Gemini, Grok/xAI, Kimi, Moonshot, OpenRouter credentials)`)

## 2026-03-26 — OpenClaw 2026.3.13-1 → 2026.3.24

- **Security hardening (2026.3.22)**: Added version note to Phase 3 documenting `jq` removal from default exec safe-bin allowlist, new `tools.exec.strictInlineEval` option, exec macOS allowlist spoofing hardening, gateway auth scope + loopback hop fixes, voice-call webhook pre-auth body limits (64 KB/5 s), and device pairing profile binding fix (`GHSA-7jrw-x62h-64p8`)
- **Security hardening (2026.3.23–2026.3.24)**: Added version note to Phase 3 for sandbox media dispatch `mediaUrl`/`fileUrl` alias bypass fix and canvas/admin-scope gateway auth hardening
- **Security review checklist**: Added version ≥ 2026.3.22 and ≥ 2026.3.24 checklist items to `.claude/commands/security-review.md` (note: write was permission-blocked in this run — entries need manual verification)
- **Feature Atlas — Security**: Added `tools.exec.strictInlineEval` (exec inline eval hardening, since 2026.3.22) and marketplace manifest security (reject remote manifests that expand outside repo, since 2026.3.22)
- **Feature Atlas — Tools**: Updated web search providers row to include Exa, Tavily, and Firecrawl as bundled plugins (since 2026.3.22); added native `image_generate` tool row with `agents.defaults.imageGenerationModel.primary` config key (since 2026.3.22); added `before_dispatch` plugin hook row (since 2026.3.24)
- **Feature Atlas — Agents**: Added per-agent thinking/reasoning/fast defaults row (`agents.list[].defaults.think`, since 2026.3.22) and native image generation model config row
- **Feature Atlas — Internals**: Added Plugin SDK row documenting migration from `openclaw/extension-api` to `openclaw/plugin-sdk/*` (since 2026.3.22)
- **Node.js minimum floor**: Updated Phase 1, Pragmatic Single Agent, feature atlas, and reference version notes from Node.js 22.16.0+ to 22.14+ (Node 24 recommended), reflecting the floor reduction in 2026.3.24
- **Reference version notes**: Added entries for 2026.3.22 and 2026.3.24 to the version compatibility table

## 2026-03-16 — OpenClaw 2026.3.11 → 2026.3.13-1

- Updated guide baseline version to 2026.3.13-1 in `.guide-version`, docs index, and hardened-multi-agent prerequisite line
- Added security-review checklist item for ≥ 2026.3.12 covering workspace plugin auto-load disabled, exec approval Unicode/obfuscation hardening, `/config`+`/debug` owner-only enforcement, device pairing bootstrap token improvements, and gateway auth scope fixes
- Added Phase 3 version note for 2026.3.12 documenting all CVE-tagged security fixes (GHSA-99qw-6mr3-36qr, GHSA-pcqg-f7rg-xfvv, GHSA-9r3v-37xh-2cf6, GHSA-f8r2-vg7x-gh8m, GHSA-r7vr-gr74-94p8, GHSA-2pwv-x786-56f8, GHSA-rqpp-rjj8-7wv8, GHSA-jv4g-m82p-2j93/GHSA-xwx2-ppv2-wx98)
- Added Phase 2 memory version note for new `agents.defaults.compaction.postIndexSync` and `agents.defaults.memorySearch.sync.sessions.postCompactionForce` config options (2026.3.12)
- Updated Node.js minimum version requirement from 22+ to 22.16.0+ in Phase 1, pragmatic-single-agent guide, to match the runtime guard enforced since 2026.3.13-1
- Added Phase 6 Docker notes: `OPENCLAW_TZ` timezone environment variable support and warning against passing secrets as Docker build args (token leak fix from 2026.3.13-1)
- Added Signal `groups` config block to Phase 6 Signal config example and noted schema support added in 2026.3.13-1
- Fixed session key format throughout the guide: `:dm:` → `:direct:` in sessions.md, architecture.md, phase-4-multi-agent.md, and google-chat.md (correcting a long-standing documentation error confirmed by upstream fix in 2026.3.13-1)
- Added version table entries for 2026.3.12 and 2026.3.13-1 to reference.md

## 2026-03-12 — OpenClaw 2026.3.8 → 2026.3.11

- Added version ≥ 2026.3.11 checklist item to security-review.md covering the cross-site WebSocket hijacking fix (GHSA-5wcw-8jjv-m286) in trusted-proxy mode, secret file symlink hardening, and plugin/session auth fixes
- Added cron delivery breaking change gotcha to reference.md (2026.3.11): isolated cron jobs can no longer notify via ad hoc `message` tool calls or fallback main-session summaries; migrate to `delivery.mode: "announce"` and run `openclaw doctor --fix` for legacy cron storage migration
- Updated phase-2-memory.md provider table: `gemini-embedding-2-preview` is now available (2026.3.11+) with configurable output dimensions
- Added version note to phase-2-memory.md `extraPaths` section: opt-in multimodal image/audio indexing is now available with the `gemini` provider using `gemini-embedding-2-preview` (2026.3.11+)
- Bumped guide version to 2026.3.11 in `.guide-version`, `content/docs/_index.md`, and `content/docs/hardened-multi-agent.md`

## 2026-03-09 — OpenClaw 2026.3.2 → 2026.3.8

- Updated Brave Search plan name from "Data for Search" to "Search" (plan was renamed upstream; free tier includes $5/month credits)
- Added `brave.mode: "llm-context"` opt-in config to Phase 5 web search — calls Brave's LLM Context endpoint and returns grounding snippets with source metadata
- Added `agents.defaults.compaction.postCompactionSections` config option to Phase 2 compaction docs — lets deployments choose which AGENTS.md sections are re-injected after compaction
- Added `openclaw backup create` / `openclaw backup verify` CLI commands to Phase 7 migration as the recommended backup method, alongside the existing manual tar approach
- Added `OPENCLAW_EXTENSIONS` build arg documentation to Custom Sandbox Images — pre-bakes bundled extension npm dependencies into Docker images for faster, more reproducible container starts
- Added Version ≥ 2026.3.7 security checklist item to `/security-review`: ACP `/acp spawn` sandbox bypass via command-path was closed
- Bumped guide version to 2026.3.8 across `.guide-version`, docs index callout, and hardened-multi-agent prerequisite line

## 2026-03-03

### Guide updated for OpenClaw 2026.2.22 → 2026.3.2

- Added tool profile default note (`tools.profile: "messaging"`) to Phase 1
- Documented SSRF policy key rename (`allowPrivateNetwork` → `dangerouslyAllowPrivateNetwork`), exec obfuscation detection, config snapshot redaction, and exec trusted dirs hardening (2026.2.23–2026.2.25)
- Documented ACP sandbox bypass fix, gateway WebSocket security, workspace FS hardening, LaunchAgent `Umask=077`, plugin HTTP auth changes, and multi-platform reaction auth (2026.2.26–2026.3.2)
- Updated Phase 6 deployment with LaunchAgent plist permission guidance
- Updated reference config with new options
- Updated Docker isolation setup script

### Guide updated for OpenClaw 2026.2.19 → 2026.2.22

- Documented shell startup-file env injection blocking, heredoc body expansion token blocking, and per-segment shell allowlist evaluation (2026.2.21)
- Documented Control UI secure context enforcement, Tailscale header auth scoping, sandbox browser container hardening, and TTS provider switching opt-in (2026.2.21)
- Documented `config get` credential redaction, `safeBins` trusted directory changes, `sessions_history` token redaction, `groupPolicy: "allowlist"` fail-closed behavior (2026.2.22)
- Added new security audit findings: `open_groups_with_runtime_or_fs`, `allow_commands_dangerous`
- Updated reference config: compaction `reserveTokens`/`keepRecentTokens`, subagent `announceTimeoutMs`, `safeBinTrustedDirs`

### Signal groups and version reference fixes

- Fixed Signal group configuration guidance in Phase 3 and reference
- Corrected version references across docs
- Updated example config for consistency

## 2026-02-20

### Guide updated for OpenClaw 2026.2.17 → 2026.2.19

- Documented gateway token auto-generation default behavior
- Added SSRF hardening notes for IPv6 transition addresses (NAT64, 6to4, Teredo)
- Updated browser SSRF policy documentation (`browser.ssrfPolicy`)
- Added plugin/hook path containment enforcement notes

### Recipes, corrections, and content-guard improvements

- Added knowledge vault and morning briefing recipes
- Fixed content-guard plugin for group messaging scenarios
- Updated content-guard tests for edge cases
- Clarified group messaging security guidance in Phase 3 and Phase 4
- Corrected and updated example configs (`openclaw-basic.json`, `openclaw-pragmatic.json`)
- Updated custom sandbox image documentation and reference

### Custom sandbox images

- Added `content/docs/custom-sandbox-images.md` — building, deploying, and using custom Docker images
- Added `scripts/custom-sandbox/` — Dockerfile and build script
- Updated Docker isolation scripts and reference docs
