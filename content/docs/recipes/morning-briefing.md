---
title: "Morning Briefing"
description: "Scheduled daily briefing delivered to your channel — weather, calendar, inbox, tasks, and news."
weight: 20
---

A cron-driven briefing delivered to your phone every morning. The agent runs in an isolated session, fetches the information you care about, and sends a formatted summary before you start your day.

```
Cron (7 AM)
    │
    ▼
Isolated Session (main agent)
    ├── web_search  → weather forecast
    ├── sessions_send → search agent → news headlines
    ├── gog skill  → calendar events for today
    ├── gog skill  → inbox summary (unread, flagged)
    └── memory_search → open tasks / reminders
         │
         ▼
    Synthesize → Deliver to channel
```

No new agents or plugins required beyond a working search agent. Calendar and email sections need the `gog` skill or equivalent Google/Outlook access.

{{< callout type="info" >}}
**Prerequisites:** [Phases 1–5]({{< relref "../phases" >}}) complete, search agent with `web_search` ([Phase 5]({{< relref "../phases/phase-5-web-search" >}})), channel connected ([Phase 4]({{< relref "../phases/phase-4-multi-agent" >}})).
{{< /callout >}}

---

## Step 1: Add briefing instructions to AGENTS.md

Paste the following into your main agent's `AGENTS.md` (`~/.openclaw/workspaces/main/AGENTS.md`). This defines what to include, in what order, and how to format it.

{{< details title="Morning Briefing — AGENTS.md snippet" closed="true" >}}

```markdown
## Morning Briefing

When running the morning briefing cron job, produce a concise daily brief.

### Sections (in order)

1. **Weather** — current conditions + high/low for today + any weather warnings.
   Use web_search for "[your city] weather today".

2. **Calendar** — today's events and any scheduling conflicts for the next 3 days.
   Use the calendar skill or gog to fetch from Google Calendar / Outlook.

3. **Inbox** — count of unread emails; surface any flagged or urgent messages
   (subject + sender only — no full email content in the brief).
   Use the gog skill for Gmail, or equivalent.

4. **Tasks** — open reminders and tasks. Search memory for items tagged
   [TASK] or [REMINDER] that are due today or overdue.

5. **News** — 3–5 headline summaries on topics I follow. Delegate to the
   search agent: "Summarize today's top tech/AI news headlines, 3-5 items,
   one sentence each."

6. **Focus suggestion** — based on calendar, tasks, and inbox: one sentence
   on the highest-priority thing for the day.

### Format

Use short markdown. Keep the whole brief under 400 words. Lead with date and
greeting. Example:

**Good morning — Monday, 3 Feb 2026**

☁️ **Weather** — Overcast, 8°C / high 12°C. No alerts.

📅 **Calendar** — 2 events: standup at 9 AM, dentist at 3 PM. No conflicts.

📬 **Inbox** — 14 unread. Flagged: reply from Sarah re: contract (action needed).

✅ **Tasks** — 1 overdue: submit invoice (was due Friday). 2 due today.

📰 **News** — Claude 4 released with extended context window. OpenAI launches
o4-mini. GitHub Copilot adds voice input.

💡 **Focus** — Clear the invoice before standup; afternoon is free before dentist.

### Rules
- Skip a section entirely if data is unavailable — don't pad with "no data found"
- No emoji required — only use if it matches the channel (WhatsApp: fine; Signal: fine; iMessage: fine)
- For inbox: never include email body content in the brief
- Deliver via the channel session, not via the main chat history
```

{{< /details >}}

Adjust the sections list to match your actual tools — if you don't use Gmail, remove the inbox section; if you don't use Google Calendar, replace with memory-based task lookup.

---

## Step 2: Add the cron job

Add the following to the `cron.jobs` array in your `openclaw.json`:

```json5
{
  jobId: "morning-briefing",
  agentId: "main",
  schedule: {
    kind: "cron",
    expr: "0 7 * * 1-5",  // Weekdays at 7am — change to "0 7 * * *" for every day
    tz: "Europe/Stockholm" // Replace with your timezone (IANA format)
  },
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Run the morning briefing. Follow the Morning Briefing instructions in AGENTS.md. Deliver the result to my channel."
  },
  delivery: {
    mode: "announce",
    channel: "whatsapp"  // Replace with your channel: "signal", "telegram", "googlechat", etc.
  }
}
```

{{< callout type="warning" >}}
`sessionTarget: "isolated"` creates a fresh session each run — the agent has no memory of previous briefings. This keeps costs low and prevents context buildup. If you want the agent to reference previous days (e.g. "you mentioned this last week"), switch to `"main"` — but be aware this adds tokens to your main session on every run.
{{< /callout >}}

### Timezone reference

Common IANA timezone values:

| Location | Timezone |
|---|---|
| New York | `America/New_York` |
| Los Angeles | `America/Los_Angeles` |
| London | `Europe/London` |
| Stockholm | `Europe/Stockholm` |
| Tokyo | `Asia/Tokyo` |
| Sydney | `Australia/Sydney` |

---

## Step 3: Test before scheduling

Run the job manually to verify the output before it fires at 7 AM:

```bash
openclaw cron run morning-briefing
```

Check the output via your channel. If sections are missing or malformatted, adjust the AGENTS.md instructions and re-run until satisfied.

```bash
openclaw cron runs --id morning-briefing  # view run history + outputs
openclaw logs --agent main                # debug if the run failed silently
```

---

## Optional: Midday check-in

A lighter midday nudge — tasks only, no news or weather. Useful for catching items that slipped in the morning:

```json5
{
  jobId: "midday-checkin",
  agentId: "main",
  schedule: {
    kind: "cron",
    expr: "0 12 * * 1-5",
    tz: "Europe/Stockholm"
  },
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Quick midday check: search memory for any tasks tagged [TASK] or [REMINDER] due today or overdue. If there are any, list them briefly. If nothing is due, reply with a single line: 'No pending tasks for today.' Keep it under 5 lines total."
  },
  delivery: {
    mode: "announce",
    channel: "whatsapp"
  }
}
```

---

## Optional: Weekend briefing variant

A shorter weekend variant — no inbox or calendar, just weather and one leisure suggestion:

```json5
{
  jobId: "weekend-briefing",
  agentId: "main",
  schedule: {
    kind: "cron",
    expr: "0 9 * * 6,0",  // Sat + Sun at 9am
    tz: "Europe/Stockholm"
  },
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Run a short weekend briefing: (1) weather for today and tomorrow, (2) one suggestion for something interesting to do or read based on my interests in memory. Keep it under 100 words."
  },
  delivery: {
    mode: "announce",
    channel: "whatsapp"
  }
}
```

---

## Customization

### Adding a news section without the search agent

If you haven't set up the search agent yet, replace the news step with a direct `web_fetch`:

```markdown
5. **News** — fetch https://hnrss.org/frontpage and summarize the top 3 items.
```

### Parallel sub-agent fetching

For faster briefings (all sections fetched simultaneously rather than sequentially), add `sessions_spawn` instructions to AGENTS.md and ensure `subagents.allowAgents` includes `"search"`:

```markdown
## Morning Briefing — parallel mode

Spawn sub-agents for slow fetches:
- sessions_spawn(task="Search for today's tech/AI news top 5 headlines, one sentence each. ANNOUNCE_SKIP after replying.")
- sessions_spawn(task="Fetch weather for Stockholm today from web. ANNOUNCE_SKIP after replying.")
Wait for both to complete, then assemble the brief with the results.
```

This adds complexity — only worth it if your briefing is taking more than 30 seconds.

### Adjusting the delivery channel

To deliver to a specific WhatsApp group instead of your DM:

```json5
delivery: {
  mode: "announce",
  channel: "whatsapp",
  to: "120363XXXXXXXXXXXX@g.us"  // group JID from openclaw channels list
}
```

---

## Usage

**On-demand briefing** — trigger any time from any channel:
> "Give me a morning briefing"

**Check run history:**
```bash
openclaw cron runs --id morning-briefing
```

**Pause the briefing temporarily:**
```bash
openclaw cron disable morning-briefing
openclaw cron enable morning-briefing   # re-enable
```

**Edit the schedule** (e.g. push to 8 AM):
```bash
openclaw cron update morning-briefing --cron "0 8 * * 1-5"
```
