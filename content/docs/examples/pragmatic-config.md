---
title: "Pragmatic Single Agent Configuration"
description: "Complete annotated OpenClaw config with a single unsandboxed agent, full OS access, and all five guard plugins as the primary defense layer."
weight: 119
---

Complete annotated `openclaw.json` implementing the pragmatic single-agent architecture: one main agent with `sandbox.mode: "off"`, full tool access (exec, browser, web search, filesystem), and all five guard plugins enabled. Uses JSON5 comments for inline documentation — OpenClaw supports JSON5 natively.

No Docker, no multi-agent delegation. Security comes from guard plugins (channel-guard, web-guard, file-guard, network-guard, command-guard) plus OS-level isolation (non-admin user or VM boundary). See [Pragmatic Single Agent](../pragmatic-single-agent.md) for the full deployment guide, security analysis, and deployment target options.

> For the recommended 2-agent Docker-sandboxed setup, see [Recommended Configuration](config.md). For maximum hardening with exec isolation, see [Hardened Multi-Agent](../hardened-multi-agent.md). For a minimal starting point, see [Basic Configuration](basic-config.md).

Deploy as a non-admin OS user on a dedicated machine, or inside a Lume VM (macOS) / Multipass VM (Linux). See [Pragmatic Single Agent — Deployment Target](../pragmatic-single-agent.md#step-1-deployment-target) for setup instructions.

{{< readfile "examples/openclaw-pragmatic.json" "json5" >}}
