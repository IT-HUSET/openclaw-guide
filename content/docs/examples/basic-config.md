---
title: "Basic Configuration"
description: "Minimal OpenClaw config with security baseline, single channel, and web search isolation — a clean starting point."
weight: 120
---

Minimal secure `openclaw.json` covering the security baseline (Phase 3), a single WhatsApp channel routing to the main agent (Phase 4), and isolated web search delegation (Phase 5). Two agents only: main + search. Uses JSON5 comments for inline documentation — OpenClaw supports JSON5 natively.

> For production deployments with Docker sandboxing, egress allowlisting, multiple channels, and image generation — see [Recommended Configuration](config.md).

Deployment postures are covered for macOS, Linux, and Windows: Docker isolation (this config), macOS VM isolation (remove sandbox blocks), and Linux VM isolation (keep sandbox blocks). On Windows, use Docker Desktop's WSL2 backend and forward-slash paths such as `C:/Users/openclaw/.openclaw/...`; use a Linux VM/WSL2-side firewall for strict egress allowlisting. See [Phase 3 — Security](../phases/phase-3-security.md#deployment-isolation-options) for the full trade-off analysis.

{{< readfile "examples/openclaw-basic.json" "json5" >}}
