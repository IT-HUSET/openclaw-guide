# Changelog

All notable guide content updates are documented here.
This changelog tracks documentation changes — not OpenClaw releases themselves.

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
