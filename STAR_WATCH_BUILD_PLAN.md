# STAR Watch — Build Plan
## Phased delivery: Background intelligence layer for OASIS SOPs

---

## Strategic framing

The SOP app is a **power-user tool** for SOP authors, CS managers, and compliance leads.
`star-watch` is the **zero-friction entry point** for everyone else — teams that won't adopt a new app but will benefit from STAR intelligence surfacing in tools they already use.

These two products reinforce each other: star-watch drives passive adoption, the SOP app handles active authoring and audit. Same STAR API, same holons, same STARNET proofs.

---

## Phase 1 — Core Daemon + Slack Intelligence
**Goal:** Prove the concept end-to-end. One connector (Slack), one delivery channel (Slack), one org, pattern matching via BRAID.

**Outcome:** A CS team at a pilot company can install star-watch, connect Slack, and receive sign-off prompts for their Customer Onboarding SOP — without opening the SOP app once.

### Issues

**SW-1 · Scaffold `star-watch` CLI package**
Set up the Node.js/TypeScript project: `package.json`, `tsconfig`, `bin/star.ts` entry point, commander.js CLI structure with subcommands (`connect`, `add`, `watch`, `link`, `status`). Wire to STAR API base URL and JWT auth. Output: installable via `npm install -g @oasis/star-watch`.

**SW-2 · Config management (`~/.star/config.json`)**
Implement `star connect` command: prompts for OASIS username/password, authenticates against STAR API, stores JWT and org settings to `~/.star/config.json`. Implement `star status` to show connected connectors and active runs. Config schema versioned from day one.

**SW-3 · Slack watcher (Socket Mode)**
Implement the Slack connector using Socket Mode (no public webhook required). `star add slack` triggers OAuth flow, stores bot token. Watcher subscribes to configured channels and normalises messages to `ObservedEvent` schema. Handle reconnect logic and rate limiting.

**SW-4 · BRAID matcher — semantic SOP step detection**
Implement the matching pipeline: load active SOP runs from STAR API, run rule-based pre-filter (connector type + trigger conditions), call `POST /api/braid/match` with event + candidate steps + run context, return `{ stepId, confidence, reasoning }`. Cache active runs locally with 30s TTL.

**SW-5 · Rule-based trigger conditions in SOP templates**
Extend the SOP template schema (`SOPStep`) to support `triggerConditions` — structured conditions for zero-latency matching before BRAID (e.g. `{ field: 'StageName', operator: 'changed_to', value: 'Closed Won' }`). Update the SOP app's Authoring page to allow authors to set these when building steps.

**SW-6 · Slack delivery adapter — interactive sign-off messages**
Implement the Slack delivery adapter. When the matcher requires escalation, post a structured Block Kit message to the assignee's DM (or configured channel) with four actions: `sign_off`, `flag_deviation`, `snooze_1h`, `open_in_app`. Handle button callbacks via Socket Mode. Record response back to STAR API run state.

**SW-7 · Auto-completion + StepCompletionHolon**
When confidence ≥ 0.92 and the step doesn't require sign-off, automatically advance the run via STAR API and write a `StepCompletionHolon` to STARNET. Include evidence: event ID, source connector, BRAID-extracted excerpt, confidence score, timestamp.

**SW-8 · Avatar linking (`star link`)**
Implement `star link slack <user_id> --avatar <email>` so Slack users map to OASIS Avatars. Store mappings in `~/.star/links.json`. Include reverse lookup: when an actor triggers a step, resolve their Avatar ID for the proof holon. Support `star link me --slack` for self-service DM-based linking.

**SW-9 · Daemon mode (`star watch --daemon`)**
Implement background process management. `--daemon` flag forks the process, writes PID to `~/.star/star-watch.pid`, redirects stdout/stderr to `~/.star/logs/star-watch.log`. `star stop` and `star restart` commands. `--install` registers as a launchd service (macOS) or systemd unit (Linux).

**SW-10 · Phase 1 pilot: end-to-end test**
Run star-watch against a staging Slack workspace with the Customer Onboarding SOP. Verify: Slack messages are matched to steps, sign-off prompts are delivered, button clicks advance the run, proof holons are written to STARNET. Document any STAR API gaps found and create follow-up issues.

---

## Phase 2 — Salesforce + Email + Daily Digest
**Goal:** The two most important enterprise connectors. A CS leader can see all active SOPs across their Salesforce pipeline without touching the SOP app.

### Issues

**SW-11 · Salesforce watcher (Streaming API)**
Implement the Salesforce connector. `star add salesforce` triggers OAuth. Subscribe to PushTopics for configured objects (Opportunity, Case, Account) using CometD/Bayeux. Normalise stage changes, task completions, and field updates to `ObservedEvent`. Handle session expiry and re-authentication.

**SW-12 · Salesforce trigger conditions**
Map common Salesforce SOP patterns to trigger conditions: Opportunity stage changed, Case status changed, Task marked complete, Account field updated. Create a library of 10 pre-built trigger conditions for the most common CS and sales SOPs (Customer Onboarding, Churn Response, Renewal, Upsell).

**SW-13 · Email watcher (IMAP IDLE)**
Implement the email connector. `star add email` supports Gmail OAuth and standard IMAP credentials. Use IMAP IDLE for push-based delivery (no polling). Extract sender, subject, body text, and attachments. Normalise to `ObservedEvent`. Useful for approval chain SOPs and client communication tracking.

**SW-14 · Daily digest delivery (email)**
Generate a structured HTML email digest on a configurable schedule (default: 9am weekdays). Digest includes: steps auto-completed since last run, steps awaiting sign-off (with one-click action links), deviations flagged, AI suggestions ready to review. Send via configurable SMTP or SendGrid.

**SW-15 · SOP auto-start from connector event**
When a trigger condition fires for a SOP that isn't yet running, auto-start a new run. Example: Salesforce Opportunity changes to Closed Won → auto-start Customer Onboarding SOP for that record. Assign the run to the Opportunity owner. Notify via Slack DM. Record the SOP run creation event as a holon.

**SW-16 · Multi-run state management**
Handle multiple concurrent SOP runs for the same template (e.g. 20 active onboardings at once). Each run is keyed by a `contextId` (e.g. Salesforce Opportunity ID). The matcher routes events to the correct run based on context. Local run cache syncs from STAR API on startup and every 5 minutes.

---

## Phase 3 — GitHub + Jira + Browser Extension
**Goal:** Extend to engineering and project management workflows. Ship the browser extension as a lightweight companion to the daemon.

### Issues

**SW-17 · GitHub watcher (webhooks or polling)**
Implement the GitHub connector. Support both webhook mode (requires public URL, good for servers) and polling mode (for local installs). Watch: PR opened/merged/approved, issue closed, deployment triggered. Useful for: code review SOPs, release checklists, security review workflows.

**SW-18 · Jira watcher**
Implement the Jira connector via Jira webhook subscriptions. Watch: issue status changed, sprint completed, epic closed. Useful for: sprint retrospective SOPs, escalation procedures, QA sign-off checklists.

**SW-19 · Browser extension — menu bar companion**
Build a minimal browser extension (Chrome/Firefox) or macOS menu bar app (Electron/Tauri) that:
- Shows a dot indicator when steps need attention
- Lists pending sign-offs with one-click actions
- Shows today's auto-completed steps
- Links to the full SOP app for deeper review
No new UI paradigm — just a fast access point for the star-watch state.

**SW-20 · Confidence calibration and feedback loop**
Implement a feedback mechanism: when a user rejects a BRAID match ("This wasn't that step"), record the negative signal and send it back to the matching engine. Over time, per-org calibration improves confidence thresholds. Store calibration data in `~/.star/calibration.json` and sync to STAR API.

---

## Phase 4 — Full Passive Intelligence
**Goal:** The SOP app becomes purely optional for the majority of users. star-watch handles the entire run lifecycle end-to-end.

### Issues

**SW-21 · Salesforce sidebar (Lightning Web Component)**
Build a Salesforce LWC sidebar that shows the active SOP for the current record. Displays: current step, assigned avatar, elapsed time, evidence collected. Sign-off button submits directly via STAR API. No need to leave Salesforce. Deploy via Salesforce package.

**SW-22 · Zapier/Make connector**
Publish a Zapier app for `star-watch` that exposes: "Trigger: SOP step requires sign-off", "Action: Mark SOP step complete", "Action: Flag deviation". This gives any team with a Zapier account instant star-watch integration with 5,000+ apps, without custom connector development.

**SW-23 · On-premise / self-hosted mode**
Package `star-watch` as a Docker container for enterprise on-premise deployments. Supports pointing to a self-hosted STAR API instance. Add environment variable config support (no `~/.star/config.json` required). Publish to Docker Hub as `oasis/star-watch`.

**SW-24 · Admin dashboard in SOP app**
Add a "Connections" page to the SOP app showing: connected star-watch instances, their health, events processed, match rates, and calibration data. Allow admins to review auto-completed steps and retro-actively adjust if needed.

**SW-25 · SOPIntel enrichment from star-watch signals**
Pipe all auto-completion events and match confidence scores into SOPIntel analytics. New chart: "AI auto-completion rate by SOP". New metric: "Steps that never need human input" vs "Steps that always need sign-off". Use this data to recommend SOP simplifications.

---

## Delivery sequence

```
Phase 1  ──────────────────────────────────────────── Weeks 1–4
  SW-1  Scaffold CLI
  SW-2  Config + auth
  SW-3  Slack watcher
  SW-4  BRAID matcher
  SW-5  Trigger conditions in templates
  SW-6  Slack sign-off delivery
  SW-7  Auto-completion + holons
  SW-8  Avatar linking
  SW-9  Daemon mode
  SW-10 Pilot test

Phase 2  ──────────────────────────────────────────── Weeks 5–8
  SW-11 Salesforce watcher
  SW-12 Salesforce trigger conditions
  SW-13 Email watcher
  SW-14 Daily digest email
  SW-15 SOP auto-start
  SW-16 Multi-run state

Phase 3  ──────────────────────────────────────────── Weeks 9–12
  SW-17 GitHub watcher
  SW-18 Jira watcher
  SW-19 Browser extension
  SW-20 Confidence calibration

Phase 4  ──────────────────────────────────────────── Weeks 13–18
  SW-21 Salesforce sidebar
  SW-22 Zapier connector
  SW-23 Docker / on-premise
  SW-24 SOP app admin dashboard
  SW-25 SOPIntel enrichment
```

---

## STAR API gaps to resolve before Phase 1

| Gap | Required endpoint | Priority |
|-----|-------------------|----------|
| BRAID match endpoint | `POST /api/braid/match` with event + step candidates | P0 |
| Run state by context | `GET /api/workflow/runs?orgId=&contextId=` | P0 |
| Advance run step | `POST /api/workflow/runs/{id}/steps/{stepId}/complete` | P0 |
| Record escalation | `POST /api/workflow/runs/{id}/steps/{stepId}/escalate` | P0 |
| Write step holon | `POST /api/holon/step-completion` | P1 |
| Org member lookup | `GET /api/org/{id}/members` | P1 |

---

## Key design decisions

**Node.js over Go for v1**
The connector ecosystem (Slack SDK, Salesforce streaming, IMAP) has far better Node.js support. Go can be evaluated for v2 if distribution size or performance become issues.

**Socket Mode over public webhooks**
Most pilot companies won't have a public URL for their local star-watch install. Slack Socket Mode and polling-based connectors work everywhere, including behind firewalls.

**Local-first, cloud-optional**
The daemon runs locally. No data is stored in the cloud beyond what STAR API already handles. This is a critical enterprise trust signal.

**BRAID as the intelligence layer**
We don't build our own ML model. BRAID is the reasoning engine. This keeps the CLI thin and deferrable: as BRAID improves, star-watch gets smarter with no code changes.
