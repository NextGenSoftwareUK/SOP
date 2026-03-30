# STAR Watch — Next Steps & UI Experiences

---

## The three UI moments

STAR Watch has three distinct "interfaces" — each designed for a different person and context.

---

## UI 1 — The terminal (admin, one-time setup)

The person installing star-watch is typically a technical admin or CS ops lead. They see this once.

### `star connect`
```
★ STAR Watch  — Connect to OASIS

? STAR API endpoint: https://api.oaisweb4.one
? OASIS username: OASIS_ADMIN
? OASIS password: ••••••••••••
? Organisation ID (e.g. acme-corp): acme-corp

  ⠸  Authenticating with OASIS…
  ✓  Connected as OASIS_ADMIN

Config saved to ~/.star/config.json

Next: add your first connector with star add slack
```

### `star add slack`
```
Connecting Slack (Socket Mode — no public URL required)

? Slack Bot Token (xoxb-…):  xoxb-123-456-abc
? Slack App-Level Token (xapp-…):  xapp-1-abc
? Channel for STAR alerts (e.g. #star-alerts):  #star-alerts
? Channels to watch (comma-separated, blank = all):  #customer-success,#ops

  ✓  Slack connector saved. Restart `star watch` to activate.
```

### `star watch` (live, foreground)
```
★ STAR Watch  background SOP intelligence

2026-03-28T09:00:01Z  ok      Slack watcher connected (watching 2 channels)
2026-03-28T09:00:01Z  info    Run cache refreshed — 12 active runs
2026-03-28T09:00:01Z  ok      STAR Watch running — monitoring 1 connector(s)
2026-03-28T09:00:01Z  info    Active SOP runs: 12
2026-03-28T09:00:01Z  info    Press Ctrl+C to stop.

2026-03-28T09:14:22Z  event   slack · message_sent · Kelly A.
2026-03-28T09:14:22Z  match   "Go-live sign-off" · 97% · escalate
2026-03-28T09:14:23Z  ok      Sign-off request sent to @kelly.a

2026-03-28T09:18:07Z  event   slack · file_shared · Max G.
2026-03-28T09:18:07Z  match   "Upload evidence" · 94% · auto_complete
2026-03-28T09:18:08Z  ok      Step auto-completed. Proof holon written to STARNET.
```

**Design principles:**
- Teal accent (`#2DD4BF`) for positive signals (connected, ok, match)
- Dim timestamps — data is the focus, not the metadata
- `match` lines show the step name, confidence %, and routing decision
- No spinner loops — discrete log lines only

---

## UI 2 — The browser setup wizard (admin, per-connector)

When an admin clicks "Connect" on the Connections page (or runs `star add slack`), a setup panel appears explaining exactly what to do. Designed for a non-engineer who can follow instructions.

**This is now live in the SOP app at `/connections`.**

### What it contains (per connector):
1. **Numbered steps** — concrete instructions (create the app, enable the scope, copy the token)
2. **Direct links** — "Open Slack" button takes them directly to `api.slack.com/apps`
3. **Terminal command** — copy-paste ready, with a one-click copy button
4. **Context** — "The CLI will walk you through authentication interactively"

### Design decisions:
- Bottom-sheet panel (slides up) — keeps context visible behind it
- No OAuth redirect within the app itself for Phase 1 — the CLI handles auth, the panel explains why and what to get
- Phase 2 will add in-app OAuth for Salesforce (the flow is too complex for CLI-only)

---

## UI 3 — Slack (end users, daily)

This is the most important interface — it's what 95% of team members experience. They never open the SOP app.

### Sign-off request (Slack DM or channel)
```
┌──────────────────────────────────────────────────────────────┐
│  STAR  ·  Enterprise Onboarding v3                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 6 of 7 — Go-live sign-off                             │
│  ──────────────────────────────────────────────────────      │
│  Customer        Acme Corp                                   │
│  Evidence        Salesforce Opportunity closed               │
│  Confidence      97%                                         │
│  Detected        2 min ago                                   │
│                                                              │
│  "Opportunity stage changed to Closed Won. Matches           │
│   the go-live sign-off step with 97% confidence."           │
│                                                              │
│  [Sign off]  [Flag deviation]  [Snooze 1h]  [Open in app ↗] │
└──────────────────────────────────────────────────────────────┘
```

After sign-off:
```
┌──────────────────────────────────────────────────────────────┐
│  STAR · Signed off · Step 6 · Enterprise Onboarding v3      │
│  Proof recorded on STARNET. ✓                               │
└──────────────────────────────────────────────────────────────┘
```

### Auto-completion notice (optional, configurable)
```
STAR auto-completed Step 3 of Enterprise Onboarding v3
  ·  "Upload evidence"  ·  Confidence 94%  ·  slack · file_shared
```

### Design principles:
- Delivered as a DM (direct, personal) not a channel blast
- Four actions only: sign off, flag, snooze, open app
- Confirmation updates the original message in-place (no noise)
- Auto-completion notices are off by default — turned on per team

---

## Immediate next steps

### This week (Phase 1 unblocked)

**1. STAR API endpoints**
Four endpoints needed before the matcher can work end-to-end:
```
POST  /api/braid/match                    ← semantic step matching
GET   /api/workflow/runs?orgId=&status=   ← active run list
POST  /api/workflow/runs/:id/steps/:sid/complete    ← advance step
POST  /api/workflow/runs/:id/steps/:sid/escalate    ← record escalation
```

**2. Create the Slack app**
- Go to api.slack.com/apps → Create New App
- Enable Socket Mode
- Add scopes: `channels:history`, `chat:write`, `im:write`, `reactions:read`, `files:read`
- Install to your Slack workspace
- Run `star connect` then `star add slack`

**3. First trigger conditions on an existing SOP**
Open the Customer Onboarding SOP in AI Authoring and add trigger conditions to 2 steps:
- "Send welcome email" → `{ source: 'slack', action: 'message_sent', contains: 'welcome email' }`
- "Go-live sign-off" → `{ source: 'salesforce', field: 'StageName', operator: 'changed_to', value: 'Closed Won' }`

**4. Pilot run**
Run `star watch --verbose` while someone uses Slack normally. Observe which events are detected and what confidence scores come back. Calibrate thresholds.

### Next two weeks

- Salesforce watcher (SW-11 from build plan)
- SOP auto-start on trigger (SW-15)
- Email digest (SW-14)
- Avatar linking for the pilot team

---

## The pitch for Kelly's network

> "Your team keeps using Slack and Salesforce exactly as they do today. You install a small background service once. From that point on, STAR watches what's happening, recognises which SOP step is being completed, and records the proof automatically. When it needs a human decision, it sends a Slack DM with one button. The audit trail is built without anyone changing how they work."

> "The SOP app is for you — to design the SOPs, review analytics, see what AI wants to improve. Most of your team never opens it."
