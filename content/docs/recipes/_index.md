---
title: "Recipes"
description: "Optional use cases and workflows building on the core phase guides."
weight: 115
---

Practical setups that extend your OpenClaw deployment beyond the basics. Each recipe assumes you've completed the relevant [phase guides]({{< relref "../phases" >}}) and layers on additional configuration, AGENTS.md instructions, and cron jobs.

## Recipes

| Recipe | What it does | Prereqs |
|---|---|---|
| [Knowledge Vault]({{< relref "knowledge-vault" >}}) | Persistent knowledge base with semantic search and cron-driven autonomous research | Phases 1–5, search agent |
| [Morning Briefing]({{< relref "morning-briefing" >}}) | Scheduled daily briefing — weather, calendar, inbox, tasks, and news — delivered to your channel | Phases 1–5, search agent |

---

## Use Case Ideas

Not every use case warrants a full recipe page. The following are patterns with strong community adoption — enough to get started with the right AGENTS.md instructions and cron jobs on top of the phase guides.

### Personal Productivity

| Use Case | What it does | Key tools |
|---|---|---|
| **Personal CRM** | Auto-track contacts from Gmail + Calendar, filter newsletters/bots, score by interaction strength, queryable via chat | `gog` skill, `memory_search`, SQLite via `exec`, cron |
| **Meeting → task extraction** | Parse transcripts (Fathom, Otter.ai) → extract action items → approval gate → create in Todoist/Linear | `web_fetch`, `memory`, approval in AGENTS.md |
| **Smart inbox triage** | Flag urgent email, summarize newsletters into a digest, auto-reply to known senders | `gog` skill, cron, AGENTS.md triage rules |
| **Second brain** | Text anything via chat → stored in memory; agent builds a searchable Next.js dashboard on request | Memory tools, `exec`, Telegram/iMessage |
| **Family calendar assistant** | Aggregate family calendars → morning briefing; monitor messages for appointment confirmations; pantry inventory from photos | `gog` skill, `image` tool, cron, iMessage |

### Development & DevOps

| Use Case | What it does | Key tools |
|---|---|---|
| **GitHub PR review** | New PR → fetch diff → analyze → notify developer via channel (read-only: `gh pr view`, `gh run view`) | `exec` (gh CLI), `message`, cron or webhook |
| **Self-healing home server** | Hourly health checks (Gatus, ArgoCD); auto-restart failing services; page only when auto-remediation fails | `exec` (kubectl/ssh), cron, `message` |
| **CI/CD monitor** | Watch build status, detect regressions, post summaries to Slack/Discord | `exec`, `web_fetch`, cron, `message` |
| **Overnight mini-app builder** | Brain-dump goals → agent generates + executes daily tasks, including building a small app overnight | `exec`, `browser`, `sessions_spawn`, cron |

### Multi-Agent Orchestration

| Use Case | What it does | Key config |
|---|---|---|
| **Hub-and-spoke team** | Orchestrator agent delegates to specialized workers (Coder, Researcher, Automation). Workers run in Docker with minimal tools | Multiple agents in `agents.list`, `subagents.allowAgents`, Docker sandbox |
| **Autonomous project management** | Subagents coordinate via a shared `STATE.yaml` file. Main agent stays thin (strategy only). Workers self-assign, update state, and report back | `sessions_spawn`, `group:fs`, AGENTS.md delegation rules |
| **Multi-agent content factory** | Research, writing, and thumbnail agents in separate Discord/Slack channels, each specialized and channel-bound | Bindings, multiple agents, `subagents.allowAgents` |

### Business & Analytics

| Use Case | What it does | Key tools |
|---|---|---|
| **Nightly business briefing** | Multi-persona AI council (GrowthStrategist, RevenueGuardian, SkepticalOperator) reviews business signals and produces ranked recommendations | `sessions_spawn`, cron, AGENTS.md persona definitions |
| **Competitor monitoring** | Daily web search on competitor names + products; append findings to a knowledge file; alert on significant changes | `web_search` via search agent, cron, `memory` |
| **Multi-channel customer service** | 24/7 auto-responses across WhatsApp, Instagram, Email, Google Reviews with escalation rules | Channel bindings, AGENTS.md response rules, `message` |
| **YouTube analytics** | Track channel metrics, monitor competitor videos, generate weekly performance charts | `web_fetch`, `exec`, cron, `memory` |
| **Dynamic dashboard** | Cron every 15 min spawns parallel sub-agents for GitHub/social/server metrics; aggregates to a database | `sessions_spawn`, `exec`, PostgreSQL/SQLite |

### Research & Intelligence

| Use Case | What it does | Key tools |
|---|---|---|
| **Multi-source tech news digest** | 109+ sources (46 RSS + 44 Twitter/X KOLs + 19 GitHub repos + web search), quality-scored and deduplicated | [`tech-news-digest`](https://clawhub.ai/skills/tech-news-digest) ClawHub skill |
| **Market research → MVP factory** | Mine Reddit + X for pain points in any niche (Last 30 Days skill) → rank opportunities → build MVP | [`last-30-days`](https://github.com/matvanhorde/last-30-days) skill, `exec`, `browser` |
| **AI earnings tracker** | Track tech/AI earnings reports with automated previews, alerts, and summaries | `web_search` via search agent, cron, `memory` |

### Infrastructure & Integrations

| Use Case | What it does | Key config |
|---|---|---|
| **n8n credential isolation** | Agent calls n8n webhooks for all external API interactions — API keys live in n8n only, never in agent environment. Visual, lockable pipelines | `web_fetch` (webhook calls), Docker Compose ([openclaw-n8n-stack](https://github.com/caprihan/openclaw-n8n-stack)), AGENTS.md workflow conventions |
| **Phone-based assistant** | Access your agent via phone call or SMS — calendar, Jira, web search hands-free | [ClawdTalk](https://github.com/team-telnyx/clawdtalk-client) plugin (Telnyx) |
| **AI voice calls (batch)** | Call a list of people using an AI persona — guest confirmations, appointment reminders | [SuperCall](https://github.com/xonder/supercall) plugin (Twilio + GPT-4o Realtime) |

### Home Automation

| Use Case | What it does | Key tools |
|---|---|---|
| **Home Assistant control** | Natural language device control, automations, and status queries via any channel | Home Assistant add-on, `web_fetch` (HA REST API), `message` |
| **Smart energy monitoring** | IoTawatt calibration alerts, anomaly detection, usage reports | `web_fetch`, cron, `memory` |
| **EV charge scheduling** | Tesla/EV charge scheduling and status queries via chat | `web_fetch` (Tesla API or TeslaMate), `message` |

---

{{< callout type="info" >}}
**Contribute a recipe.** If you've built something that works reliably, the community collection at [awesome-openclaw-usecases](https://github.com/hesamsheikh/awesome-openclaw-usecases) accepts pull requests. Each entry needs a working setup you've tested for at least a day.
{{< /callout >}}
