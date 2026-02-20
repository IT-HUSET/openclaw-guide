---
title: "OpenClaw Guide"
layout: hextra-home
---

{{< hextra/hero-container
  image="/images/banner.jpg"
  imageWidth=600
  imageHeight=420
  imageClass="hx:rounded-xl"
  imageTitle="OpenClaw Guide"
  class="hx:items-center"
>}}

{{< hextra/hero-badge link="https://github.com/IT-HUSET/openclaw-guide" >}}
  <span>IT-HUSET/openclaw-guide</span>
{{< /hextra/hero-badge >}}

{{< hextra/hero-headline >}}
  OpenClaw Guide
{{< /hextra/hero-headline >}}

{{< hextra/hero-subtitle style="margin-bottom:1.5rem" >}}
  This is sort of a guide to the **[guide](https://docs.openclaw.ai)**, with the aim of providing a somewhat cleaner path to getting started and with a stronger focus on security hardening best practices. It's not meant to replace the official docs, but rather to complement them with a more practical, security-focused walkthrough of deploying OpenClaw.
{{< /hextra/hero-subtitle >}}

{{< hextra/hero-button text="Get Started!" link="docs/phases/phase-1-getting-started" >}}

{{< callout type="error" >}}
**REMEMBER:** _Only use OpenClaw in a dedicated, isolated environment and take necessary security precautions. This is a powerful tool that can cause real damage if misused or left unsecured._
{{< /callout >}}
{{< callout type="warning" >}}
**NOTE:** This guide is a _**work in progress**_ that attempts to track the latest OpenClaw releases as best as possible. OpenClaw has many rough edges, lots of open issues and is evolving rapidly, so this guide may contain inaccuracies, outdated info, or incomplete sections. If in doubt, see the <u>**[official docs](https://docs.openclaw.ai)**</u>.
{{< /callout >}}

<div style="margin-top:1rem"></div>



{{< /hextra/hero-container >}}

<div style="margin-top:3rem"></div>

{{< hextra/feature-grid >}}
  {{< hextra/feature-card
    title="Multi-Agent"
    subtitle="Composable core + channel agents with flexible routing, workspace isolation, and per-agent tool restrictions."
    icon="user-group"
    link="docs/phases/phase-4-multi-agent"
    style="background: radial-gradient(ellipse at 50% 80%, rgba(59,130,246,0.1), transparent 60%);"
  >}}
  {{< hextra/feature-card
    title="Security First"
    subtitle="Threat model, SOUL.md boundaries, prompt injection scanning, and deployment isolation."
    icon="shield-check"
    link="docs/phases/phase-3-security"
    style="background: radial-gradient(ellipse at 50% 80%, rgba(244,63,94,0.1), transparent 60%);"
  >}}
  {{< hextra/feature-card
    title="Production Deployment"
    subtitle="Docker and VM isolation, secrets management, firewall rules, and automated setup scripts."
    icon="server"
    link="docs/phases/phase-6-deployment"
    style="background: radial-gradient(ellipse at 50% 80%, rgba(139,92,246,0.1), transparent 60%);"
  >}}
  {{< hextra/feature-card
    title="Channel Integration"
    subtitle="Connect WhatsApp, Signal, and Google Chat with dedicated channel agents and message routing."
    icon="chat-alt"
    link="docs/phases/phase-4-multi-agent"
    style="background: radial-gradient(ellipse at 50% 80%, rgba(16,185,129,0.1), transparent 60%);"
  >}}
  {{< hextra/feature-card
    title="Web Search Isolation"
    subtitle="Isolated search agent with prompt injection scanning via DeBERTa ONNX model."
    icon="globe-alt"
    link="docs/phases/phase-5-web-search"
    style="background: radial-gradient(ellipse at 50% 80%, rgba(245,158,11,0.1), transparent 60%);"
  >}}
  {{< hextra/feature-card
    title="Plugin Extensions"
    subtitle="TypeScript plugins for image generation, web content guard, and channel message scanning."
    icon="puzzle"
    link="docs/extensions"
    style="background: radial-gradient(ellipse at 50% 80%, rgba(99,102,241,0.1), transparent 60%);"
  >}}
{{< /hextra/feature-grid >}}
