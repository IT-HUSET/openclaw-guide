---
title: "Documentation"
weight: 1
cascade:
  type: docs
---

{{< callout type="info" >}}
This guide was last reviewed against **OpenClaw 2026.2.14**. If you're running a newer version, some details may have changed — check the [changelog](https://github.com/openclaw/openclaw/blob/main/CHANGELOG.md).
{{< /callout >}}

Start with [Phase 1]({{< relref "phases/phase-1-getting-started" >}}) and work through each phase in order — each builds on the previous.

{{< cards >}}
  {{< card link="phases" title="Phase Guides" subtitle="Progressive setup from first agent to production deployment" icon="academic-cap" >}}
  {{< card link="reference" title="Reference" subtitle="Config cheat sheet, tool groups, plugins, gotchas" icon="book-open" >}}
  {{< card link="sessions" title="Sessions" subtitle="Session keys, routing, lifecycle, compaction, pruning" icon="clock" >}}
  {{< card link="architecture" title="Architecture" subtitle="System internals, module dependencies, networking diagrams" icon="chip" >}}
  {{< card link="google-chat" title="Google Chat" subtitle="GCP setup, webhook exposure, multi-agent, multi-org" icon="chat-alt-2" >}}
  {{< card link="multi-gateway" title="Multi-Gateway" subtitle="Profiles, multi-user, VM variants for channel separation" icon="server" >}}
  {{< card link="custom-sandbox-images" title="Custom Sandbox Images" subtitle="Build and deploy custom Docker images for production sandboxes" icon="cube" >}}
  {{< card link="hardened-multi-agent" title="Hardened Multi-Agent" subtitle="Optional: add a dedicated computer agent for exec isolation" icon="shield-check" >}}
  {{< card link="recipes" title="Recipes" subtitle="Optional use cases: knowledge vault, automated research" icon="light-bulb" >}}
  {{< card link="examples" title="Examples" subtitle="Annotated config and security audit walkthrough" icon="code" >}}
  {{< card link="extensions" title="Extensions" subtitle="channel-guard, web-guard, image-gen, computer-use plugins" icon="puzzle" >}}
{{< /cards >}}
