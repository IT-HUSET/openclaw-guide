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
>}}

{{< hextra/hero-badge link="https://github.com/IT-HUSET/openclaw-guide" >}}
  <span>Open Source</span>
{{< /hextra/hero-badge >}}

{{< hextra/hero-headline >}}
  OpenClaw Guide
{{< /hextra/hero-headline >}}

{{< hextra/hero-subtitle style="margin-bottom:1.5rem" >}}
  A progressive, security-first guide to deploying and hardening&nbsp;<br class="sm:block hidden" />OpenClaw — from single agent to production multi-agent setup.
{{< /hextra/hero-subtitle >}}

{{< hextra/hero-button text="Get Started" link="docs/phases/phase-1-getting-started" >}}

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
    subtitle="Sandboxed search and browser agents with prompt injection scanning via DeBERTa ONNX model."
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
