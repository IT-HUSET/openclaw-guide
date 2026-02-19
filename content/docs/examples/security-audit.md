---
title: "Security Audit Example"
description: "Worked example of openclaw security audit output."
weight: 122
---

Real output from `openclaw security audit` on a hardened multi-agent installation, with explanations. The summary below is from the basic audit — `openclaw security audit --deep` adds a CRITICAL `plugins.code_safety` finding (documented separately below).

**Date:** 2026-02-09
**OpenClaw version:** 2026.2.3-1

---

## Audit Results

```
Summary: 0 critical · 1 warn · 1 info
```

### WARN — `gateway.trusted_proxies_missing`

**Non-issue for this setup.** The warning fires because `gateway.bind` is `loopback` and `trustedProxies` is empty. It means: *if* you ever put a reverse proxy in front of the gateway, configure `trustedProxies` so the gateway reads real client IPs from `X-Forwarded-For`. Without a reverse proxy, there's nothing to spoof. Safe to ignore.

**Do not add `trustedProxies` preemptively.** Without the setting, the gateway ignores `X-Forwarded-For` entirely — the client IP is always the TCP source address and cannot be spoofed. Setting `"trustedProxies": ["127.0.0.1"]` without an actual proxy tells the gateway to trust XFF headers from any loopback connection. Any local process on the host — any user, any service — could forge `X-Forwarded-For` in a request to the gateway port, including a prompt-injected agent with `exec`. Only add `trustedProxies` when you deploy a reverse proxy, and only list the proxy's IP.

### CRITICAL (--deep) — `plugins.code_safety`

> **Note:** `CRITICAL` is the severity label reported by the `--deep` audit tool. The actual risk for this specific finding is low — see below.

The `--deep` scan flags `env-harvesting` when it detects environment variable access combined with network calls in the same file. In this case, the finding is a **false positive for the image-gen plugin's gateway entrypoint** (`index.ts`): the plugin's gateway code receives its API key via config and never reads `process.env`. The standalone CLI utility (`generate.ts`) does read `OPENROUTER_API_KEY` from env, but it is not loaded by the gateway — only `index.ts` is.

The heuristic is pattern-based and cannot distinguish "plugin reads its own configured API key and sends it to the intended service" from "malicious plugin reads arbitrary env vars and exfiltrates them." For any plugin where this fires:
1. Confirm the file flagged is the gateway entrypoint (not a CLI tool)
2. Verify the env var read is only sent to the declared API endpoint
3. Check that `baseUrl` validation is present (image-gen enforces HTTPS)

**Best practice for plugin authors:** Pass API keys via config using OpenClaw's `${ENV_VAR}` substitution rather than reading `process.env` in the gateway entrypoint. This avoids the heuristic and keeps config as the single source of truth for credentials.

If you see this finding on a third-party plugin, verify: does the plugin only send credentials to its *intended* API endpoint? Check the baseUrl and any `fetch()` calls in the source.

### INFO — Attack surface summary

- Groups: open=0, allowlist=2
- tools.elevated: disabled
- hooks: disabled
- browser control: enabled (see recommendation below)

---

## Recommended Changes

### 1. Fix WhatsApp session file permissions

All files in `credentials/whatsapp/default/` are `rw-r--r--` (644), including `creds.json` with WhatsApp session credentials. Parent directories are 755.

```bash
sudo chmod 700 ~/.openclaw/credentials/whatsapp
sudo chmod 700 ~/.openclaw/credentials/whatsapp/default
sudo chmod -R 600 ~/.openclaw/credentials/whatsapp/default/*
```

### 2. Disable browser control

The audit reports `browser control: enabled`. If you don't need browser automation:

```json
{
  "gateway": {
    "nodes": {
      "browser": { "mode": "off" }
    }
  }
}
```

And/or add `"browser"` to each agent's deny list.

### 3. Add `logging.redactSensitive`

Redacts tool call details from logs:

```json
{
  "logging": {
    "redactSensitive": "tools"
  }
}
```

### 4. Tighten the main agent tool deny list

If the main agent doesn't need shell execution:

```json
{
  "id": "main",
  "tools": {
    "deny": ["exec", "process", "canvas", "gateway", "nodes"]
  }
}
```

### 5. Move secrets out of openclaw.json

API keys and gateway tokens in plaintext config risk leaking in backups or git accidents. Use environment variable substitution:

```json
{
  "gateway": {
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
```

Store actual values in the service plist or `~/.openclaw/.env`.

### 6. Add `plugins.allow`

Without `plugins.allow`, any plugin in `~/.openclaw/extensions/` loads at startup. Set an explicit allowlist:

```json
{
  "plugins": {
    "allow": ["whatsapp", "signal", "channel-guard", "content-guard"]
  }
}
```

### 7. Consider `dmPolicy: "allowlist"` over `"pairing"`

`allowlist` blocks unknown senders entirely (no pairing prompt). Trade-off: lose self-onboarding, eliminate pairing code attack vector.

### 8. Add `logging.redactPatterns`

Custom regex for environment-specific secrets:

```json
{
  "logging": {
    "redactSensitive": "tools",
    "redactPatterns": ["pplx-[A-Za-z0-9]+"]
  }
}
```

### 9. Prune old session transcripts

Session files (`agents/<agentId>/sessions/*.jsonl`) contain full message history and tool output. Clean up old sessions if long retention isn't needed.

---

## Already Correct

| Setting | Status |
|---------|--------|
| `gateway.bind: "loopback"` + token auth | OK |
| `trustedProxies` empty (no reverse proxy) | OK |
| `elevated.enabled: false` | OK |
| Chat commands disabled (`bash`, `config`, `debug`, `restart`) | OK |
| `session.dmScope: "per-channel-peer"` | OK |
| `groupPolicy: "allowlist"` on both channels | OK |
| `discovery.mdns.mode: "minimal"` | OK |
| Skills allowlisted | OK |
| Tailscale ACLs configured | OK |
| SOUL.md hard prohibitions in both workspaces | OK |
| Docker sandboxing enabled for channel agents (OrbStack) | OK |

---

## Commands

```bash
# Basic audit
openclaw security audit

# Deep probe against running gateway
openclaw security audit --deep

# Auto-apply safe guardrails (review first!)
openclaw security audit --fix
```

See [Security](../phases/phase-3-security.md) for the full security baseline.
