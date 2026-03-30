# STAR Watch — Technical Architecture
## Background Intelligence Layer for the OASIS SOP System

> "You don't change how your team works. You install STAR once, connect your tools, and it starts watching."

---

## 1. The Core Idea

`star-watch` is a long-running background process (daemon) that:

1. **Observes** activity across a company's existing tools (Slack, Salesforce, email, Jira, GitHub, etc.)
2. **Recognises** when observed events match steps in published SOP templates (via BRAID pattern matching)
3. **Auto-advances** SOP runs when evidence is clear — no human action needed
4. **Escalates** only when a human decision is required (sign-off, deviation, ambiguity)
5. **Records proofs** as holons on STARNET for every auto-completed step

The result: most team members never open the SOP app. They receive a Slack DM or email prompt at the moment their input is needed, act on it in seconds, and carry on. The audit trail is built automatically.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        star-watch daemon                        │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Watchers   │───▶│   Matcher    │───▶│   Action Engine  │  │
│  │  (per tool)  │    │   (BRAID)    │    │                  │  │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘  │
│        │                                          │             │
│  Slack · Salesforce                    ┌──────────▼──────────┐  │
│  Email · GitHub                        │  Delivery Adapters  │  │
│  Jira · Notion                         │  Slack · Email      │  │
│  Zapier webhook                        │  Browser · Sidebar  │  │
│                                        └──────────┬──────────┘  │
│                                                   │             │
│                                        ┌──────────▼──────────┐  │
│                                        │   STAR API / OASIS  │  │
│                                        │   Holon creation    │  │
│                                        │   SOP run tracking  │  │
│                                        └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Installation and Configuration

### Install (single command, global)
```bash
npm install -g @oasis/star-watch
# or
curl -sSL https://get.oasis.earth/star-watch | sh
```

### Authenticate and connect
```bash
star connect
# Interactive prompts:
# > OASIS username: OASIS_ADMIN
# > OASIS password: ••••••••••
# > STAR API endpoint: https://api.oaisweb4.one  [Enter for default]
# ✓ Connected. Avatar: OASIS_ADMIN (Mainnet)

star add slack          # OAuth flow opens in browser
star add salesforce     # OAuth flow opens in browser
star add github         # OAuth flow opens in browser
star add email          # IMAP/SMTP or Gmail OAuth
```

### Config file: `~/.star/config.json`
```json
{
  "avatar": "OASIS_ADMIN",
  "token": "<jwt>",
  "apiBase": "https://api.oaisweb4.one",
  "org": "acme-corp",
  "connectors": {
    "slack": {
      "token": "<bot_token>",
      "channels": ["#customer-success", "#engineering", "#ops"],
      "deliverTo": "#star-alerts"
    },
    "salesforce": {
      "clientId": "...",
      "instanceUrl": "https://acme.salesforce.com",
      "watchObjects": ["Opportunity", "Case", "Account"]
    },
    "github": {
      "token": "ghp_...",
      "repos": ["acme/backend", "acme/frontend"]
    },
    "email": {
      "imap": "imap.gmail.com",
      "account": "cs@acme.com"
    }
  },
  "sops": {
    "autoLoad": true,
    "orgId": "acme-corp",
    "pinnedTemplates": ["enterprise-onboarding-v3", "customer-churn-response"]
  },
  "escalation": {
    "defaultChannel": "slack",
    "requireSignOff": true,
    "digestSchedule": "0 9 * * MON-FRI"
  }
}
```

### Start the daemon
```bash
star watch              # foreground (dev/debug)
star watch --daemon     # background service
star watch --daemon --install  # register as system service (launchd/systemd)
```

---

## 4. Watcher Layer

Each connector runs an independent watcher. Watchers normalise raw events into a common `ObservedEvent` schema.

### ObservedEvent schema
```typescript
interface ObservedEvent {
  id:          string          // unique event ID
  source:      ConnectorType   // 'slack' | 'salesforce' | 'github' | ...
  timestamp:   Date
  actor: {
    id:        string          // user/system ID in the source tool
    name:      string
    email?:    string
    avatarId?: string          // OASIS Avatar ID if linked
  }
  action:      string          // 'message_sent' | 'stage_changed' | 'pr_merged' | ...
  entity: {
    type:      string          // 'opportunity' | 'pull_request' | 'ticket' | ...
    id:        string
    name?:     string
    url?:      string
  }
  payload:     Record<string, unknown>  // raw connector data
  context:     string[]        // extracted text snippets for BRAID
}
```

### Watcher implementations

**Slack** — uses Slack Socket Mode (real-time, no public webhook needed):
```typescript
// Listens to all configured channels
// Triggers on: messages, reactions, thread replies, file shares
// Extracts: sender, channel, message text, linked URLs, attachments
slackApp.event('message', async ({ event }) => {
  emit(normaliseSlackMessage(event))
})
```

**Salesforce** — uses Salesforce Streaming API (CometD):
```typescript
// Subscribes to PushTopic for configured objects
// Triggers on: record created/updated, stage changed, task completed
client.subscribe('/topic/OpportunityUpdates', (event) => {
  emit(normaliseSalesforceEvent(event))
})
```

**GitHub** — uses GitHub webhooks or polling:
```typescript
// Triggers on: PR opened/merged, issue closed, commit pushed, review approved
// Useful for: code review SOPs, deployment checklists, release processes
```

**Email** — IMAP IDLE (push-based, no polling):
```typescript
// Triggers on: email received/sent matching configured patterns
// Extracts: sender, subject, body text, attachments
// Useful for: approval chains, client communications, compliance workflows
```

---

## 5. Matcher (BRAID Pattern Recognition)

The matcher is the intelligence core. It takes a stream of `ObservedEvent`s and determines whether each event is evidence of a SOP step completing.

### Matching pipeline

```
ObservedEvent
     │
     ▼
┌─────────────────────────────────────────────┐
│ Step 1: Active Run Index                    │
│ Which SOPs are currently in-progress        │
│ for this org? Which avatars are assigned?   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│ Step 2: Rule-based pre-filter               │
│ Fast checks: does the event source/action   │
│ match any step's connector type?            │
│ e.g. Salesforce stage_changed → check all  │
│ steps with connector: 'salesforce'          │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│ Step 3: BRAID semantic match                │
│ POST /api/braid/match                       │
│ {                                           │
│   event: ObservedEvent,                     │
│   candidates: SOPStep[],                    │
│   context: RunContext                       │
│ }                                           │
│ → { stepId, confidence, reasoning }         │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│ Step 4: Decision routing                    │
│                                             │
│ confidence > 0.92 + !requiresSignOff        │
│   → auto-complete, write proof holon        │
│                                             │
│ confidence > 0.75 + requiresSignOff         │
│   → escalate to assigned avatar             │
│                                             │
│ confidence 0.50–0.75                        │
│   → soft notification, await confirmation  │
│                                             │
│ confidence < 0.50                           │
│   → log only, no notification               │
└─────────────────────────────────────────────┘
```

### Rule-based triggers (zero-latency, before BRAID)

Stored in SOP template metadata as `triggerConditions`:
```json
{
  "stepId": "s1",
  "connector": "salesforce",
  "triggerConditions": {
    "object": "Opportunity",
    "field": "StageName",
    "operator": "changed_to",
    "value": "Closed Won"
  }
}
```

When a Salesforce event exactly matches a trigger condition, confidence is immediately set to 0.99 — BRAID is skipped for speed and cost.

---

## 6. Action Engine

Once the matcher produces a result, the Action Engine decides what to do:

### Auto-complete (no human required)
```typescript
async function autoComplete(match: MatchResult) {
  // 1. Advance the run state via STAR API
  await starApi.advanceRun(match.runId, match.stepId, {
    completedBy: 'star-watch',
    evidence: { eventId: match.event.id, source: match.event.source },
    timestamp: new Date(),
  })

  // 2. Write StepCompletionHolon to STARNET
  await holonWriter.writeStepCompletion({
    runId: match.runId,
    stepId: match.stepId,
    evidence: match.event,
    autoCompleted: true,
    confidence: match.confidence,
  })

  // 3. Silent notification to run owner (configurable)
  if (config.escalation.notifyOnAutoComplete) {
    await deliver.silentLog(match)
  }
}
```

### Escalation (human sign-off needed)
```typescript
async function escalate(match: MatchResult) {
  const assignee = await resolveAssignee(match.step, match.run)
  const message = await braid.generateEscalationMessage(match)

  // Deliver via the assignee's preferred channel
  await deliver.send(assignee.preferredChannel, {
    type: 'sign_off_request',
    match,
    message,
    actions: ['sign_off', 'flag_deviation', 'snooze_1h', 'open_in_app'],
    expiresAt: addHours(new Date(), 4),
  })

  // Record escalation in run state
  await starApi.recordEscalation(match.runId, match.stepId, assignee)
}
```

---

## 7. Delivery Adapters

### Slack (primary)
Interactive message with Block Kit:
```
┌─────────────────────────────────────────────┐
│ STAR  ·  Enterprise Onboarding v3           │
├─────────────────────────────────────────────┤
│ Step 6 of 7 detected — Go-live sign-off     │
│                                             │
│ Customer:  Acme Corp                        │
│ Evidence:  Salesforce Opportunity closed    │
│ Detected:  2 min ago                        │
│                                             │
│ [Sign off]  [Flag deviation]  [Open in app] │
└─────────────────────────────────────────────┘
```

Button actions POST back to `star-watch` → handled locally → holon written.

### Email digest (async, low-urgency)
Daily/weekly digest showing:
- SOPs auto-completed since last digest
- SOPs awaiting sign-off (with one-click links)
- Deviations flagged by AI
- AI improvement suggestions

### Browser extension (macOS/Windows/Linux)
- Menu bar icon: dot indicates pending actions
- Click to see: "3 steps completed today, 1 needs your attention"
- One-click sign-off without opening the full app

### Salesforce sidebar (future)
Einstein-style sidebar panel on Opportunity/Case records showing:
- Active SOP for this record
- Next required action
- History of auto-completed steps

---

## 8. Holon Creation

Every event — whether auto-completed or human-signed — produces a verified on-chain record.

```typescript
interface StepCompletionHolon {
  type:          'SOPStepCompletionHolon'
  runId:         string
  sopId:         string
  stepId:        string
  completedBy:   'star-watch' | AvatarId
  evidence: {
    source:      ConnectorType
    eventId:     string
    excerpt:     string       // BRAID-extracted relevant snippet
    url?:        string
  }
  autoCompleted: boolean
  confidence:    number
  signedBy?:     AvatarSignature  // present when human signed off
  timestamp:     Date
  chain:         'MAINNET' | 'TESTNET'
}
```

---

## 9. Linking Actors to OASIS Avatars

For the proof to be meaningful, observed actors (Slack users, Salesforce users) need to map to OASIS Avatars.

```bash
# Admin maps team members once
star link slack U12345678 --avatar kelly.johnson@acme.com
star link salesforce 0051000000AbCdE --avatar kelly.johnson@acme.com

# Or team members self-link
star link me --slack  # sends DM with link code
```

Unlinked actors are recorded as `{ name, email, source }` and can be retroactively linked — the proof holons update automatically.

---

## 10. Privacy and Security Model

- **No content stored**: `star-watch` never persists message bodies or sensitive payloads. Only extracted event metadata is sent to STAR API.
- **On-premise option**: The daemon can run entirely within a company's network, pointing to a self-hosted STAR API instance.
- **Audit log**: All observations, matches, and decisions are logged locally at `~/.star/logs/` with configurable retention.
- **Consent**: Watchers only activate for channels/objects explicitly configured. No broad surveillance.
- **GDPR**: Avatar linking is opt-in. Unlinked data uses anonymised actor IDs.
