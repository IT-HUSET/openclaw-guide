---
title: "Recommended Configuration"
description: "Complete annotated OpenClaw config with main/search architecture, Docker sandboxing, egress allowlisting, and all security hardening applied."
weight: 121
---

Complete annotated `openclaw.json` implementing the recommended two-agent architecture: main (sandboxed, channel-facing, full exec + browser on egress-allowlisted network) and search (web only, no filesystem). Core guard plugins enabled (channel-guard, web-guard). Uses JSON5 comments for inline documentation — OpenClaw supports JSON5 natively. For maximum hardening with deterministic guards (file-guard, network-guard, command-guard), see [Hardened Multi-Agent](../hardened-multi-agent.md).

Main runs on `openclaw-egress` — a custom Docker network with host-level firewall rules restricting outbound to pre-approved hosts (npm, git, Playwright CDN, etc.). See [`scripts/network-egress/`](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/network-egress/) for setup. For exec-separated architecture with a dedicated computer agent, see [Hardened Multi-Agent](../hardened-multi-agent.md). For a minimal starting point (single channel, two agents, no egress), see [Basic Configuration](basic-config.md).

Three deployment postures are covered: Docker isolation (this config), macOS VM isolation (remove sandbox blocks), and Linux VM isolation (keep sandbox blocks). See [Phase 3 — Security](../phases/phase-3-security.md#deployment-isolation-options) for the full trade-off analysis.

{{< readfile "examples/openclaw.json" "json5" >}}
