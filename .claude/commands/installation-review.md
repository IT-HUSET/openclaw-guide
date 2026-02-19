---
description: Review a live OpenClaw installation against the guide's setup requirements
argument-hint: [username or home path — e.g. openclaw or /Users/openclaw] (optional, auto-detected if omitted)
---

You are an OpenClaw installation reviewer. Your job is to inspect the user's live system and assess how well it matches the recommendations in this guide, phase by phase.

## Context

Read the following guide files before starting — they provide the baseline to review against:

@content/docs/_index.md
@content/docs/phases/phase-1-getting-started.md
@content/docs/phases/phase-2-memory.md
@content/docs/phases/phase-4-multi-agent.md
@content/docs/phases/phase-5-web-search.md
@content/docs/phases/phase-6-deployment.md
@content/docs/reference.md
@examples/openclaw.json
@.guide-version

## Instructions

- **Run commands to inspect the live system** — don't ask the user for information you can discover yourself
- **Be direct** — lead with findings, not preamble
- **Use severity levels:** ✅ OK / ⚠️ Warning / ❌ Issue
- **Reference guide sections** by name when flagging gaps (e.g., "Phase 2: Memory", "Reference: Config Quick Reference")
- **Read more guide files as needed** — if a finding requires deeper context, read the relevant file (e.g., `content/docs/phases/phase-3-security.md` for security config gaps, `content/docs/phases/phase-6-deployment.md` for service setup details)
- **Cross-check guide version** — compare the installed OpenClaw version against `.guide-version`; flag if the user is behind a version where known issues exist (see Reference: Version Compatibility)

## Step 1: Resolve Target User

The argument provided was: `$ARGUMENTS`

OpenClaw commonly runs as a dedicated non-admin OS user. Resolve the correct user and home directory before running any other commands:

```bash
# Resolve target user and home: explicit argument takes priority, then running process, then current user.
if [ -n "$ARGUMENTS" ]; then
  if echo "$ARGUMENTS" | grep -q '^/'; then
    TARGET_HOME="$ARGUMENTS"
    TARGET_USER=$(ls -ld "$TARGET_HOME" 2>/dev/null | awk '{print $3}')
  else
    TARGET_USER="$ARGUMENTS"
    TARGET_HOME=$(eval echo "~$TARGET_USER")
  fi
else
  RUNNING_USER=$(ps aux | grep -i "[o]penclaw" | grep -v grep | awk '{print $1}' | head -1)
  # Common dedicated usernames to probe if process not found:
  if [ -z "$RUNNING_USER" ]; then
    for u in openclaw openclaw-agent; do
      id "$u" 2>/dev/null && RUNNING_USER="$u" && break
    done
  fi
  TARGET_USER="${RUNNING_USER:-$(whoami)}"
  TARGET_HOME=$(eval echo "~$TARGET_USER")
fi
echo "Reviewing: user=$TARGET_USER  home=$TARGET_HOME"
```

**From this point, use `$TARGET_HOME` for all file paths and `sudo -u $TARGET_USER` for all `openclaw` CLI commands.** If `sudo` is not available or denied, fall back to direct file reads where possible and note the limitation.

## Step 2: Environment Discovery

Run these commands using the resolved user and home directory:

```bash
# Binary location and version
sudo -u $TARGET_USER which openclaw 2>/dev/null || which openclaw
sudo -u $TARGET_USER openclaw --version 2>/dev/null || openclaw --version

# Config file
ls -la $TARGET_HOME/.openclaw/openclaw.json 2>/dev/null || echo "config not found"
ls -la $TARGET_HOME/.openclaw/.env 2>/dev/null || echo "no .env file"

# Gateway health (run as the target user so it finds the right gateway socket/token)
sudo -u $TARGET_USER openclaw health 2>/dev/null || echo "gateway not responding"
sudo -u $TARGET_USER openclaw status 2>/dev/null || echo "status unavailable"
sudo -u $TARGET_USER openclaw doctor 2>/dev/null || echo "doctor unavailable"

# Service setup
# macOS LaunchDaemon (system domain — preferred for dedicated user):
sudo launchctl list 2>/dev/null | grep -i openclaw
sudo ls -la /Library/LaunchDaemons/*openclaw* 2>/dev/null
# macOS LaunchAgent (gui/<uid> domain):
launchctl list 2>/dev/null | grep -i openclaw
ls -la $TARGET_HOME/Library/LaunchAgents/*openclaw* 2>/dev/null
# Linux:
systemctl status openclaw 2>/dev/null
sudo -u $TARGET_USER systemctl --user status openclaw 2>/dev/null

# Network exposure (gateway must only bind to loopback)
sudo lsof -i :18789 2>/dev/null | grep LISTEN
ss -tlnp 2>/dev/null | grep 18789  # Linux

# Plugins installed
ls -la $TARGET_HOME/.openclaw/extensions/ 2>/dev/null || echo "no extensions dir"

# Agent workspaces
ls $TARGET_HOME/.openclaw/agents/ 2>/dev/null
for agent_dir in $TARGET_HOME/.openclaw/agents/*/agent/; do
  echo "=== $agent_dir ===" && ls "$agent_dir" 2>/dev/null
done

# Channel credentials
ls $TARGET_HOME/.openclaw/credentials/ 2>/dev/null || echo "no credentials dir"

# Memory index
sudo -u $TARGET_USER openclaw memory status 2>/dev/null || echo "memory status unavailable"

# Cron jobs
sudo -u $TARGET_USER openclaw cron list 2>/dev/null || echo "cron list unavailable"
```

Read the config file and resolve any `$include` references:
```bash
cat $TARGET_HOME/.openclaw/openclaw.json 2>/dev/null || echo "config not found"
# If $include is present, read the included files too:
grep -r '\$include' $TARGET_HOME/.openclaw/openclaw.json 2>/dev/null
```

Read SOUL.md and AGENTS.md for each configured agent:
```bash
find $TARGET_HOME/.openclaw/agents \( -name "SOUL.md" -o -name "AGENTS.md" \) -print0 2>/dev/null \
  | xargs -0 -I{} sh -c 'echo "=== {} ===" && cat "{}"'
```

## Review Checklist

After gathering system state, evaluate and report on each area:

### 1. Installation (Phase 1)
- [ ] `openclaw` binary found and version detected
- [ ] Config file exists at the resolved location
- [ ] `openclaw doctor` returns no errors
- [ ] Gateway responds to `openclaw health`
- [ ] `gateway.mode: "local"` is set in config

### 2. Service Setup (Phase 6)
- [ ] Gateway is running as a system service (not just foreground)
- [ ] Service restarts on boot (LaunchDaemon/LaunchAgent/systemd)
- [ ] Gateway runs as the dedicated OS user (not as admin or root)
- [ ] Log files are being written

### 3. Agents & Routing (Phase 1 + Phase 4)
- [ ] At least one agent defined (main), with `"default": true`
- [ ] Search agent configured (prerequisite for Phase 5)
- [ ] Agent workspaces are in separate directories (no shared `agentDir`)
- [ ] Channel bindings configured (if multi-agent)

### 4. Channels (Phase 4)
- [ ] Channel credentials directory exists (if channels configured)
- [ ] At least one channel linked (or HTTP-only use is intentional)
- [ ] `dmPolicy` set per channel (not absent)
- [ ] `allowFrom` has no placeholder values like `+46XXXXXXXXX`

### 5. Memory Search (Phase 2)
- [ ] `memorySearch` configured in agent defaults or per-agent
- [ ] `openclaw memory status` shows an active index
- [ ] `compaction.memoryFlush` enabled

### 6. Plugins (Phase 5)
- [ ] Extensions directory exists
- [ ] Plugins in `plugins.allow` have matching directories in `extensions/`
- [ ] `content-guard` configured if search agent is in use
- [ ] `channel-guard` configured if any channel is connected

### 7. Guide Version Drift
- [ ] Installed version ≥ guide baseline (`.guide-version`)
- [ ] If newer: flag relevant version notes from Reference
- [ ] If older: flag known issues for the installed version (especially 2026.1.29 security patch)

## Output Format

```
## OpenClaw Installation Review
**Target user:** $TARGET_USER  |  **Home:** $TARGET_HOME
**Installed version:** X.X.X  |  **Guide baseline:** Y.Y.Y

### Summary
[1-2 sentence overall assessment]

### Findings

**1. Installation**
✅ / ⚠️ / ❌ [item]: [finding + what to do if not OK]

**2. Service Setup**
...

[etc. for each section]

### Priority Actions
[Ranked list of the most important things to fix, if any]
```

Keep findings concise — one line per item unless an explanation is needed. If everything looks good in a section, a single ✅ line is fine.

> **For a security audit of hardening settings, run `/security-review`.**
