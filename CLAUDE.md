# Project Memory, Rules, Operating Procedures and Guidelines for AI Coding Agents

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Documentation-only repository — a progressive, security-first guide for deploying and hardening **OpenClaw** (AI agent platform). Covers single-agent through multi-agent setups with WhatsApp, Signal, and Google Chat channels, web search isolation, and production deployment.

Primarily documentation (Markdown + one annotated JSON example), plus TypeScript plugins in `extensions/`. No build system; plugins have their own `npm test`. Integration tests run against a local OpenClaw gateway.

## Structure

### Hugo Site
- `hugo.yaml` — Hugo configuration (theme, menus, params)
- `go.mod` — Hugo module dependencies (Hextra theme)
- `.github/workflows/hugo.yml` — GitHub Actions workflow for Hugo build + GitHub Pages deploy
- `content/_index.md` — Landing page
- `content/docs/_index.md`, `content/docs/phases/_index.md`, `content/docs/examples/_index.md`, `content/docs/extensions/_index.md` — Section index pages

### Guide (progressive, each phase builds on previous)
- `README.md` — Project README with link to live site
- `content/docs/phases/phase-1-getting-started.md` — Phase 1: Install → Control UI → verify (no channels yet)
- `content/docs/phases/phase-2-memory.md` — Phase 2: Two-layer memory architecture, semantic/hybrid search, pre-compaction flush, memory CLI
- `content/docs/phases/phase-3-security.md` — Phase 3: Threat model, security baseline, SOUL.md, file permissions
- `content/docs/phases/phase-4-multi-agent.md` — Phase 4: Channel connections (WhatsApp/Signal), multiple agents, routing, workspace isolation
- `content/docs/phases/phase-5-web-search.md` — Phase 5: Isolated search + browser agents, web-guard plugin
- `content/docs/phases/phase-6-deployment.md` — Phase 6: VM isolation, LaunchDaemon/LaunchAgent/systemd, secrets management, firewall, Tailscale, Signal setup
- `content/docs/phases/phase-7-migration.md` — Phase 7: Moving a deployment to a new machine — config, credentials, memory, channels, services, cron jobs
- `content/docs/google-chat.md` — Google Chat: GCP setup, webhook exposure, multi-agent, multi-org, known issues
- `content/docs/multi-gateway.md` — Multi-Gateway: profiles, multi-user, VM variants for running multiple gateway instances
- `content/docs/hardened-multi-agent.md` — Hardened Multi-Agent: main/computer architecture with network egress allowlisting
- `content/docs/reference.md` — Config cheat sheet, tool groups, plugins, gotchas, useful commands
- `content/docs/architecture.md` — System internals: core components, module dependencies, networking, diagrams

### Examples
- `examples/openclaw.json` — Recommended config (main/computer/search, egress allowlisting, all hardening)
- `examples/openclaw-basic.json` — Minimal config (main + search, single channel)
- `content/docs/examples/security-audit.md` — Worked example of `openclaw security audit` output

### Scripts
- `scripts/docker-isolation/` — Automated setup for Docker isolation deployment (3 bash scripts + README)
- `scripts/network-egress/` — Automated setup for network egress allowlisting (4 bash scripts, allowlist template, README)

### Test Environment
- `.openclaw-test/` — Local OpenClaw gateway config + integration tests. Requires `openclaw` installed globally (`npm i -g openclaw`) and `.env` with `ANTHROPIC_API_KEY` + `OPENCLAW_GATEWAY_TOKEN`

### Extensions
- `extensions/web-guard/` — OpenClaw plugin (TypeScript): pre-fetch prompt injection scanning for `web_fetch` using local DeBERTa ONNX model
- `extensions/channel-guard/` — OpenClaw plugin (TypeScript): prompt injection scanning for incoming channel messages (WhatsApp, Signal, Google Chat) using local DeBERTa ONNX model
- `extensions/agent-guard/` — OpenClaw plugin (TypeScript): prompt injection scanning for inter-agent sessions_send messages using local DeBERTa ONNX model
- `extensions/image-gen/` — OpenClaw plugin (TypeScript): image generation via OpenRouter API (FLUX, Gemini, GPT models)

## Key Context

- Target deployment: macOS (Apple Silicon) or Linux
- Three deployment postures: **Docker isolation** (recommended — dedicated OS user + Docker/OrbStack), **VM: macOS VMs** (Lume / Parallels, stronger host isolation, no Docker inside), **VM: Linux VMs** (Multipass / KVM, strongest combined — VM boundary + Docker inside)
- **Docker isolation:** single gateway on host, core agents (main + search + browser) plus optional channel agents, Docker sandboxing
- **VM: macOS VMs:** single macOS VM, dedicated standard user, multi-agent gateway, no Docker. macOS hosts only. Optional: 2 VMs for channel separation
- **VM: Linux VMs:** single Linux VM with Docker inside, dedicated user (docker group, no sudo), multi-agent gateway. macOS or Linux hosts. No VM count limit
- **Multi-gateway options:** profiles (`--profile` flag, simplest), multi-user (separate OS users), VM variants (one VM per channel)
- Official docs: https://docs.openclaw.ai
- **Guide baseline version:** stored in `.guide-version` (currently 2026.2.14). The changelog review workflow (`.github/workflows/changelog-review.yml`) runs weekly to detect drift

## Testing

### Unit tests (per plugin, no OpenClaw needed)
```bash
cd extensions/channel-guard && npm install && npm test
cd extensions/agent-guard && npm install && npm test
cd extensions/web-guard && npm install && npm test
cd extensions/image-gen && npm install && npm test
```
Guard plugin tests use real DeBERTa ONNX model (~370 MB, cached in each plugin's `node_modules/`). First run downloads the model. Image-gen tests use mocked HTTP (no API key needed).

### Integration tests (requires running gateway)
```bash
cd .openclaw-test && npm install && npm test
```
Starts an OpenClaw gateway, sends messages via HTTP chat completions API, verifies plugin behavior. Requires `.env` at project root with `ANTHROPIC_API_KEY` and `OPENCLAW_GATEWAY_TOKEN`.

**Known behavior:** `message_received` hook (used by channel-guard) only fires for configured channel bridges (WhatsApp/Signal), not for HTTP API messages. `before_tool_call` (used by web-guard) fires for all tool calls regardless of message source.

## Conventions

- macOS primary with Linux equivalents noted inline
- Shell commands assume macOS with Homebrew at `/opt/homebrew`
- Phone numbers and tokens redacted with placeholders (`+46XXXXXXXXX`, `YOUR_GATEWAY_TOKEN_HERE`)
- Config examples use JSON5 comments for annotations (OpenClaw supports JSON5 natively)
- Cross-references between documents use relative markdown links

## Visual Validation Workflow

After changes to content or layout files, visually validate the rendered site.

### Prerequisites
- `brew install hugo go` (one-time)
- A browser MCP server (e.g. `chrome-devtools`, `playwright`) for screenshot capture — either in the current session or via `.mcp-testing.json` (headless Chrome, used by the child-instance fallback below)

### Steps

1. **Build check:** `hugo` — must complete with 0 errors, 0 warnings
2. **Start dev server:** `hugo server` (serves at `http://localhost:1313/openclaw-guide/`)
3. **Validate pages** — for each page to check, always follow this process:
   1. **Get semantic structure first** — use `take_snapshot` to inspect the element/accessibility tree before screenshotting. Verify navigation links, heading hierarchy, content order, and cross-references from the structured data.
   2. **Capture screenshots** — prefer capturing only relevant sections/components (via element `uid`) over full-page screenshots when possible.
   3. **Use `visual-validation-specialist` agent** for screenshot analysis and comparison against baselines (if available).
   4. **Make targeted fixes** to specific components based on visual diffs.
   5. **Re-capture and re-validate** only the affected components until no unexpected diffs remain.
4. **Key pages to check:**
   - Landing page: `/openclaw-guide/`
   - Any page with modified content (e.g. `/openclaw-guide/docs/phases/phase-6-deployment/`)
   - Example config: `/openclaw-guide/docs/examples/config/`
5. **Check for:**
   - Broken layout (tables, code blocks, callouts rendering correctly)
   - Sidebar navigation (new/renamed sections appear, anchors resolve)
   - Internal links (click-through from cross-references)
   - Code block syntax highlighting (JSON5 comments, bash commands)
   - Mobile responsiveness (if layout changes were made)
6. **Stop dev server** when done

### When no browser MCP is available in current session

Spawn a child Claude Code instance with browser MCP from `.mcp-testing.json`:

```bash
claude -p "<validation prompt with specific URLs and checks>" \
  --mcp-config ./.mcp-testing.json \
  --allowedTools "mcp__chrome-devtools__*,Read,Write,Bash(hugo*)" \
  --permission-mode auto \
  --no-session-persistence \
  --output-format text
```

The child instance launches a headless Chrome via the `chrome-devtools` MCP server, navigates pages, takes snapshots/screenshots, and reports back through stdout. Save screenshots to `.agent_temp/` for the parent session to review via `Read`.

**Tips:**
- The child has no parent context — include all relevant URLs, check criteria, and file paths in the prompt
- Use `--output-format json | jq -r '.result'` if you need to parse the output programmatically
- If the child only needs to inspect (no edits), restrict tools: `--allowedTools "mcp__chrome-devtools__*"`
- Falls back to `hugo` build check + manual user review if `claude` CLI is not available

### Dual source-of-truth check
When `examples/openclaw.json` is modified, always verify `content/docs/examples/config.md` matches. Run:
```bash
diff <(sed -n '/^```json5$/,/^```$/p' content/docs/examples/config.md | sed '1d;$d') examples/openclaw.json
```

## Guide Maintenance

### Version tracking
The guide tracks the OpenClaw version it was last reviewed against in `.guide-version`. This is referenced by both the changelog review workflow and the docs index page.

### Automated changelog review
`.github/workflows/changelog-review.yml` runs twice weekly (Monday + Thursday 9:00 UTC) and on manual dispatch:
1. Fetches the upstream changelog from `openclaw/openclaw`
2. Extracts entries newer than `.guide-version`
3. Runs Claude Code (Sonnet) to analyze whether any entries affect the guide
4. Opens a GitHub issue labeled `changelog-review` if updates are needed

The analysis prompt lives at `.github/prompts/changelog-review.md`.

**Setup:** Install the [Claude GitHub App](https://github.com/apps/claude), then run `claude setup-token` locally and add the output as `CLAUDE_CODE_OAUTH_TOKEN` repo secret.

### Manual review procedure
When updating the guide for a new OpenClaw version:
1. Read the changelog entries since `.guide-version`
2. For each entry, check: does it change config options, CLI flags, behavior, or security posture documented in the guide?
3. Update affected docs
4. Bump `.guide-version` to the reviewed version
5. Check "Pending Cleanup" below for version-gated TODOs that may now be resolved

## Pending Cleanup

Version-specific content that should be removed when the referenced fix lands:

- **openclaw#15176** (channel bindings regression): Remove `<!-- TODO: remove after openclaw#15176 merges -->` blocks in `examples/openclaw.json` and `content/docs/phases/phase-4-multi-agent.md`. Check with `openclaw --version` after updating — the fix restores channel bindings to non-default agents.
