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
- `content/docs/phases/phase-1-getting-started.md` — Phase 1: Install → single agent → first channel → verify
- `content/docs/phases/phase-1-5-memory.md` — Phase 1.5: Two-layer memory architecture, semantic/hybrid search, pre-compaction flush, memory CLI
- `content/docs/phases/phase-2-security.md` — Phase 2: Threat model, security baseline, SOUL.md, file permissions
- `content/docs/phases/phase-3-multi-agent.md` — Phase 3: Multiple agents, routing, workspace isolation
- `content/docs/phases/phase-4-web-search.md` — Phase 4: Isolated search + browser agents, web-guard plugin
- `content/docs/phases/phase-5-deployment.md` — Phase 5: VM isolation, LaunchDaemon/LaunchAgent/systemd, secrets management, firewall, Tailscale, Signal setup
- `content/docs/google-chat.md` — Google Chat: GCP setup, webhook exposure, multi-agent, multi-org, known issues
- `content/docs/reference.md` — Config cheat sheet, tool groups, plugins, gotchas, useful commands
- `content/docs/architecture.md` — System internals: core components, module dependencies, networking, diagrams

### Examples
- `examples/openclaw.json` — Complete annotated config (Docker isolation: 6 agents, all hardening applied)
- `content/docs/examples/security-audit.md` — Worked example of `openclaw security audit` output

### Scripts
- `scripts/docker-isolation/` — Automated setup for Docker isolation deployment (3 bash scripts + README)

### Test Environment
- `.openclaw-test/` — Local OpenClaw gateway config + integration tests. Requires `openclaw` installed globally (`npm i -g openclaw`) and `.env` with `ANTHROPIC_API_KEY` + `OPENCLAW_GATEWAY_TOKEN`

### Extensions
- `extensions/web-guard/` — OpenClaw plugin (TypeScript): pre-fetch prompt injection scanning for `web_fetch` using local DeBERTa ONNX model
- `extensions/channel-guard/` — OpenClaw plugin (TypeScript): prompt injection scanning for incoming channel messages (WhatsApp, Signal, Google Chat) using local DeBERTa ONNX model
- `extensions/image-gen/` — OpenClaw plugin (TypeScript): image generation via OpenRouter API (FLUX, Gemini, GPT models)

## Key Context

- Target deployment: macOS (Apple Silicon) or Linux
- Three deployment postures: **Docker isolation** (recommended — dedicated OS user + Docker/OrbStack), **VM: macOS VMs** (Lume / Parallels, stronger host isolation, no Docker inside), **VM: Linux VMs** (Multipass / KVM, strongest combined — VM boundary + Docker inside)
- **Docker isolation:** single gateway on host, 6 agents (main + whatsapp + signal + googlechat + search + browser), Docker sandboxing
- **VM: macOS VMs:** single macOS VM, dedicated standard user, 6-agent gateway, no Docker. macOS hosts only. Optional: 2 VMs for channel separation
- **VM: Linux VMs:** single Linux VM with Docker inside, dedicated user (docker group, no sudo), 6-agent gateway. macOS or Linux hosts. No VM count limit
- Official docs: https://docs.openclaw.ai

## Testing

### Unit tests (per plugin, no OpenClaw needed)
```bash
cd extensions/channel-guard && npm install && npm test
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
