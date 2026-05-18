# TAV Enterprise — Full Architectural Review

**Subject:** Buying-side platform — design review covering identity & tiers, offers & approvals, dispositions & validation, closer dashboard UX, plus a critical evaluation of weaknesses and recommendations.

**Author hat:** Architect + Senior Business Analyst. Logic-first. No code.

**Scope:** Buying side only (Acquisition + Closing). Logistics, money, titles, AR, and customer portal are explicitly out of scope and remain in Sheets/AppSheet for now.

**Status of decisions:** All sections below are **working drafts**. Open questions are flagged at the end of each section. Nothing is locked until you sign off.

---

## Table of Contents

- [A. Identity, Tiers, Claim Logic](#a-identity-tiers-claim-logic)
- [B. `lead_offers` Schema + Customer Counter / Closer Review Flow](#b-lead_offers-schema--customer-counter--closer-review-flow)
- [C. `lead_dispositions` + Validator Queue](#c-lead_dispositions--validator-queue)
- [D. Closer Dashboard UX](#d-closer-dashboard-ux)
- [E. Full Evaluation — Weaknesses & Recommendations](#e-full-evaluation--weaknesses--recommendations)
- [F. Consolidated Open Questions](#f-consolidated-open-questions)
- [G. Revised PR & Milestone Sequence](#g-revised-pr--milestone-sequence)

---

## A. Identity, Tiers, Claim Logic

### A.1 The tier model

Tiers do **one thing**: gate whether a closer can submit an offer to the customer without a higher-tier sign-off.

| Tier | Can submit offer without approval? | Approval required from |
|---|---|---|
| **Junior Closer** | Never | Senior Closer **or** VIP Closer (either works) |
| **Closer** | Never | VIP Closer only |
| **Senior Closer** | Yes, if offer ≤ **$200,000** | VIP Closer if offer > $200,000 |
| **VIP Closer** | Always | None |

**Approvals must be followed regardless of amount or context. No carve-outs, no exceptions.** TAV average purchase price is $45K, so ~80%+ of deals fall well below the $200K Senior self-approval ceiling — VIP is not the bottleneck for routine work.

Claiming a lead, working a lead, countering internally, marking lost — none of that is gated. **Only the act of sending an offer to the customer is gated.** That's the bright line.

### A.2 `tav.users` table — logic

```
tav.users
─────────────────────────────────────────
id                  uuid pk
email               text unique not null      -- Google OIDC subject
display_name        text not null
role                enum('admin','closer','viewer')
tier                enum('junior','closer','senior','vip')  -- only meaningful when role='closer'
is_active           boolean not null default true
concurrent_lead_cap int  not null default 1    -- hoarding guard; 1 for everyone unless overridden
created_at          timestamptz
updated_at          timestamptz
deactivated_at      timestamptz null
```

**Decisions baked in:**

- `tier` lives on the user. Promotions = single UPDATE.
- `concurrent_lead_cap` defaults to **1** for every tier. Per-user override possible without schema change (e.g., a specific VIP at cap=2). Don't bake "VIP gets 2" into the tier itself.
- `can_validate` boolean removed — derivable from `tier`.
- `role='viewer'` for finance/ops read-only access.

### A.3 Approval authority — derived, not stored

```
can_approve_offer(approver_tier, offer_amount) →
  approver_tier = 'vip'                              → true
  approver_tier = 'senior' AND offer_amount ≤ 200000 → true   -- self-approval
  else                                                → false

can_approve_for(approver_tier, submitter_tier, offer_amount) →
  approver_tier = 'vip'                                              → true
  approver_tier = 'senior' AND submitter_tier IN ('junior')          → true
  approver_tier = 'senior' AND submitter_tier = 'senior' AND offer_amount ≤ 200000 → true (self)
  else                                                                → false
```

### A.4 The offer-submission gate — logic flow

When a closer hits "Submit Offer to Customer":

1. Load submitter tier from `tav.users`.
2. Load offer_amount from the draft.
3. If `can_approve_offer(submitter.tier, offer_amount)`:
   - offer goes out immediately
   - write `lead_offers` row with `approval_status='self_approved'`, `approver_id=submitter.id`
4. Else:
   - offer enters `approval_status='pending_approval'`
   - write `lead_offers` row with `required_approver_tier` set
   - notify all online users with sufficient tier
   - offer is **not** sent to customer until approved
5. On Approve:
   - **re-check `can_approve_for(...)` at click time** (tier or amount may have changed)
   - flip to `approval_status='approved'`, record `approver_id` + `approved_at`
   - fire customer-facing send
6. On Reject:
   - `approval_status='rejected_internal'`, record `approver_id` + reason
   - offer returns to submitter as a draft with reason attached
   - **does NOT count as a customer-facing disposition** (lead stays in negotiating)

### A.5 The claim logic — first-come-first-serve with cap

Atomic SQL claim:

```sql
UPDATE tav.leads
SET    status      = 'claimed',
       claimed_by  = :user_id,
       claimed_at  = now()
WHERE  id = :lead_id
  AND  status = 'new'
  AND  (
         SELECT count(*)
         FROM tav.leads
         WHERE claimed_by = :user_id
           AND status IN ('claimed','contacted','negotiating')
       ) < (SELECT concurrent_lead_cap FROM tav.users WHERE id = :user_id)
RETURNING id;
```

Zero rows returned → UI shows the right error:

- Lead already taken → "Someone else got this one."
- Cap reached → "Finish your current lead first."

**No queueing, no priority, no auto-assignment.** Pure FCFS.

### A.6 The hoarding guard — idle sweep

Every 5 minutes:

- Find leads where `status IN ('claimed','contacted')` AND `last_activity_at < now() - interval '30 minutes'`.
- Auto-release: `status` back to `new`, `claimed_by=null`.
- Write `lead_events` row: `type='auto_released'`, `reason='idle_30m'`, prior_owner=...
- Notify prior owner: "Your lead X was released due to inactivity."

**Idle threshold:** 30 minutes, same for everyone.

**"Activity" definition:** any write to the lead (note added, offer drafted, status touched, phone call logged). Viewing doesn't count.

**Negotiation-stage leads** (`status='negotiating'` with an outstanding offer) are **exempt** from idle sweep — the 72-hour customer clock is the SLA, not closer activity.

### A.7 Out of scope for this PR

- No full approval audit beyond the `lead_offers` row itself (full audit log lands with PR 5).
- No SLA timers on the approval step.
- No "delegate approval" feature.

### A.8 Things to push back on yourself about

1. **"Senior cap should be $250K, not $200K."** Pick once and stop tuning. Closers will game whatever threshold exists.
2. **"Junior should self-approve under $20K."** No. The whole point of Junior is supervised reps.
3. **"Two Seniors can co-approve >$200K instead of needing a VIP."** Tempting, won't work. If VIPs are a bottleneck, hire more VIPs.
4. **"Cap=1 will frustrate fast closers."** It will. Then they'll either dispose faster or you'll find out who was actually fast vs. who was hoarding.

### A.9 Open questions

1. **Senior-approves-Senior over $200K**: yes or no? *(Default: no — VIP-only above $200K regardless of submitter tier.)*
2. **Internal rejection visibility**: when a Senior rejects a Junior's offer, is the reason visible to all Juniors (training feed) or only the original submitter? *(Default: submitter-only for now.)*

---

## B. `lead_offers` Schema + Customer Counter / Closer Review Flow

The same tier-gating from A applies to **every offer that goes to the customer**, including counters. Internal moves (drafting, revising, rejecting a junior's draft) are not gated.

### B.1 `tav.lead_offers` — the table

```
tav.lead_offers
─────────────────────────────────────────
id                      uuid pk
lead_id                 uuid fk → tav.leads
seq                     int                       -- 1,2,3... order within the lead
direction               enum('to_customer','from_customer')
amount                  numeric(10,2) not null
notes                   text
submitted_by            uuid fk → tav.users null  -- null when direction='from_customer'
submitted_at            timestamptz not null default now()

approval_status         enum(
                          'self_approved',
                          'pending_approval',
                          'approved',
                          'rejected_internal',
                          'n_a'                   -- direction='from_customer'
                        )
required_approver_tier  enum('senior','vip') null
approver_id             uuid fk → tav.users null
approved_at             timestamptz null
rejection_reason        text null

sent_to_customer_at     timestamptz null
expires_at              timestamptz null          -- 72hr clock starts at sent_to_customer_at
superseded_at           timestamptz null
superseded_by_offer_id  uuid fk → tav.lead_offers null
source                  enum('manual','email','sms','portal') not null default 'manual'

created_at              timestamptz
updated_at              timestamptz
```

**Decisions baked in:**

- **One table, both directions.** Customer counters are first-class offers, not a sub-table.
- **No `status` beyond `approval_status`.** "Live" is derived: `sent_to_customer_at IS NOT NULL AND superseded_at IS NULL AND expires_at > now()`.
- **`expires_at` is per-offer**, not per-lead.
- **`superseded_by_offer_id`** lets you walk the chain cleanly.
- **`id uuid` is PK; `seq` is stored** (not generated) and accepts rare race-condition gaps.

### B.2 Direction rules — who can write what

| Direction | Who creates the row | Approval gate? |
|---|---|---|
| `to_customer` | Closer (any tier) drafts | Yes — same tier gates as A |
| `from_customer` | System writes when customer responds | No — `approval_status='n_a'` |

A `from_customer` offer is data capture only. The closer responds with their own new `to_customer` offer, which goes through the gate again.

### B.3 The counter flow — step by step

**Scenario:** Junior submits $18K → Senior approves → customer counters $22K → Junior counters $20K.

```
T0  Junior drafts $18K to_customer
    → seq=1, direction='to_customer', amount=18000,
      submitted_by=junior, approval_status='pending_approval',
      required_approver_tier='senior'
    → NOT sent to customer yet

T1  Senior clicks Approve
    → re-check can_approve_for(senior, junior, 18000) → true
    → flip seq=1: approval_status='approved',
      approver_id=senior, approved_at=now,
      sent_to_customer_at=now, expires_at=now+72h
    → customer notified

T2  Customer counters $22K (portal / email / verbal logged)
    → seq=2, direction='from_customer', amount=22000,
      submitted_by=null, approval_status='n_a'
    → UPDATE seq=1: superseded_at=now, superseded_by_offer_id=seq2
    → lead surfaces in Junior's queue: "Customer countered, your move"

T3  Junior drafts counter $20K to_customer
    → seq=3, direction='to_customer', amount=20000,
      submitted_by=junior, approval_status='pending_approval'
    → UPDATE seq=2: superseded_at=now, superseded_by_offer_id=seq3
    → NOT sent until Senior approves
    → loop continues from T1
```

**Key rule:** every `to_customer` row goes through the gate. Opener, counter, or seventh round-trip — same gate.

### B.4 What the closer sees — by tier

| Tier | "Submit" button behavior |
|---|---|
| Junior | Always "Submit for Approval" |
| Closer | Always "Submit for VIP Approval" |
| Senior | ≤ $200K: "Send to Customer" / > $200K: "Submit for VIP Approval" |
| VIP | Always "Send to Customer" |

### B.5 What the approver sees

"Awaiting Approval" panel on Senior + VIP dashboards. Each row:

- Lead summary (VIN, MMR, current buybox grade)
- Submitter name + tier
- Offer amount + full counter thread
- Submitter notes
- **Full buybox context: system_grade, MMR, MMR delta vs offer amount, freshness, region, source confidence**
- Two buttons: **Approve** / **Reject with Reason**

**Approval is not assignment.** The submitter keeps the lead, claim count, and disposition obligation.

### B.6 Counter from customer — ingestion paths

All write to the same row shape:

1. **Manual log** (v1): closer logs verbal counter. `source='manual'`.
2. **Email parse** (v2): inbound email parsed for amount. `source='email'`.
3. **Portal counter** (v3): customer clicks. `source='portal'`.

Schema unchanged across versions.

### B.7 Out of scope for this PR

- No partial acceptance (logistics is a Deal-side concern — out of scope entirely for buying side).
- No expiry auto-disposition. Expired offers surface in "Expired, follow up" queue. Disposition still requires human action.
- No multiple live offers per lead. Drafting a new `to_customer` auto-supersedes the prior.

### B.8 Things to push back on yourself about

1. **"Let Juniors send under $5K without approval."** No — breaks training feedback.
2. **"Approvers should edit offer amount before approving."** No — confuses authorship. Reject with reason instead.
3. **"Store full email/SMS text on the offer row."** No. Communications live at the deal/lead level (separate table, later PR). Offer rows store deal terms only.
4. **"Use seq as PK."** No. `id uuid` is PK. `seq` is a stored column.

### B.9 Settled answers

1. **Superseded offers' `expires_at` becomes informational only.** New clock starts at next `sent_to_customer_at`.
2. **Withdraw = supersede with a new `to_customer` offer** at the appropriate amount, through the same gate. No special "withdraw" action.
3. **Approver UI shows full buybox context**, not just dollar amount.

---

## C. `lead_dispositions` + Validator Queue

Real-time approval lives in offers (B). Dispositions are **post-hoc training data** — what actually happened on the lead, and how well closer judgment lined up with system judgment.

### C.1 What a "disposition" is

Final accounting on a lead when it leaves the active pipeline. Every lead exits to exactly one of:

- **closed_won** — bought
- **lost_*** — not bought, with reason code
- **duplicate** — merged with another lead
- **stale** — system aged out (no human disposition, no training signal)

**Forced disposition rule:** a closer cannot claim a new lead while any prior lead sits in `claimed`/`contacted`/`negotiating` without disposition. Idle sweep (A.6) handles abandonment; closer handles intentional exits.

### C.2 `tav.lead_dispositions` — the table

```
tav.lead_dispositions
─────────────────────────────────────────
id                    uuid pk
lead_id               uuid fk → tav.leads unique   -- one disposition per lead, ever
disposed_by           uuid fk → tav.users
disposed_at           timestamptz not null default now()

outcome               enum(
                        'closed_won',
                        'lost_price',
                        'lost_condition',
                        'lost_salvage',
                        'lost_mmr_off',
                        'lost_already_sold',
                        'lost_no_response',
                        'lost_seller_flake',
                        'lost_mileage_misrep',
                        'lost_undisclosed_damage',
                        'lost_duplicate',
                        'lost_out_of_buybox',
                        'lost_other'
                      )
outcome_notes         text                          -- required when outcome='lost_other' or grade delta ≥ 2

closer_grade          enum('green','blue','yellow','orange','red') not null
closer_mmr            numeric(10,2) null
final_offer_amount    numeric(10,2) null

system_grade          enum('green','blue','yellow','orange','red') not null  -- snapshot at disposition
system_mmr            numeric(10,2) null            -- snapshot at disposition
grade_delta           int generated
mmr_delta             numeric(10,2) generated

validation_status     enum(
                        'not_required',
                        'pending',
                        'approved',
                        'overridden',
                        'disputed'
                      ) not null default 'pending'
validated_by          uuid fk → tav.users null
validated_at          timestamptz null
validator_notes       text null
override_outcome      enum(...) null
override_closer_grade enum(...) null

training_eligible     boolean generated

created_at            timestamptz
updated_at            timestamptz
```

**Decisions baked in:**

- **One disposition per lead, ever.** UNIQUE on `lead_id`. Revival = **new lead** linked via `parent_lead_id`.
- **`closer_grade` required on every disposition.**
- **`system_grade` + `system_mmr` are snapshots at disposition time** — never recomputed.
- **`grade_delta` and `mmr_delta` generated**, so the validator queue can sort by biggest disagreements.
- **`training_eligible` generated.** Only validated dispositions feed training.
- **`override_*` columns** preserve closer's original claim alongside validator's correction.

### C.3 The forced-disposition UX gate

When closer hits "Mark Lost" or "Mark Won":

Modal opens. Required:

- **outcome** (dropdown, grouped: Won / Lost-Customer / Lost-Vehicle / Lost-Other)
- **closer_grade** (5 colored buttons)
- **closer_mmr** (numeric input, pre-filled with system_mmr as nudge)
- **outcome_notes** (required when `outcome='lost_other'` OR `grade_delta ≥ 2`)

On submit:

- write `lead_dispositions` row
- snapshot `system_grade` + `system_mmr` from current lead state
- set `validation_status` per `TAV_VALIDATION_MODE`
- flip `lead.status` to terminal state matching outcome
- release closer's cap slot

**Required-when-delta rule:** if closer's grade differs from system's by ≥ 2 ordinal steps, notes are required.

### C.4 The validator queue

Visible to Seniors + VIPs.

```
Default sort: pending dispositions, ordered by:
  1. submitter tier (junior first)
  2. grade_delta (largest disagreement first)
  3. disposed_at (oldest first)

Each row shows:
  - Lead summary (VIN, year/make/model, mileage)
  - Closer name + tier
  - Outcome
  - Closer's call: grade + mmr
  - System's call: grade + mmr (at disposition time)
  - Delta badges
  - Notes
  - Counter thread (collapsed, expandable)

Three actions:
  - Approve     → validation_status='approved'
  - Override    → opens form for override fields + notes → validation_status='overridden'
  - Dispute     → kicks back to closer with notes → validation_status='disputed'
```

**Approval scope by tier:**

| Validator tier | Can validate dispositions from |
|---|---|
| Senior | Junior, Closer |
| VIP | Junior, Closer, Senior |
| VIP | Own dispositions allowed but flagged `self_validated` in reporting |

A Senior cannot validate another Senior's disposition.

### C.5 `TAV_VALIDATION_MODE` — feature flag

Drives `validation_status` at disposition write:

| Mode | New disposition's validation_status |
|---|---|
| `all` | `pending` (everyone validated) |
| `juniors_only` | `pending` if `disposed_by.tier='junior'`, else `not_required` |
| `sample_10` | `pending` for 10% random (hash mod, deterministic per lead_id) |
| `off` | `not_required` for everyone |

**Recommended launch sequence:**

1. Start `all` for first 30 days.
2. Move to `juniors_only` once senior tiers are calibrated.
3. Drop to `sample_10` permanently. Never go to `off`.

### C.6 Value delivered

1. **Coaching evidence** — "Junior X graded 47 leads red that system graded green. Review three with him."
2. **Buybox tuning signal** — "VIPs' `closed_won` deals were graded yellow by system 60% of the time → buybox too pessimistic in that segment."
3. **Promotion data** — "Closer Y: 200 validated, 92% approved, 8% overridden, 0 disputed → promote to Senior."
4. **Disagreement triage** — sort by `grade_delta DESC` for most-interesting cases first.

### C.7 Out of scope

- No closer-side rebuttal beyond `disputed`. Track dispute count for HR; don't build chat.
- No automated buybox retraining loop. Validated dispositions accumulate; separate later PR consumes.
- No validation SLA. Track oldest pending; that's the metric.
- No bulk-approve. Validators click each row.

### C.8 Things to push back on yourself about

1. **"12 lost reasons is too many — closers will pick `lost_other` for everything."** Two counter-measures: require notes on `lost_other`, show each closer their own `lost_other` rate. If > 20%, the dropdown is wrong; coach or reduce.
2. **"Validators will rubber-stamp."** Three defenses: sort by largest delta on top, track per-validator approve/override ratio, `sample_10` permanent audit.
3. **"Self-validation by VIPs is sketchy."** Allowed because the alternative is bottleneck. `self_validated` flag makes it visible.
4. **"Closer can game by always picking system grade."** Train on **agreement adjusted by outcome correctness**, not agreement alone.

### C.9 Open questions

1. **Validation cooling-off**: should validators be blocked from validating dispositions on leads they personally touched earlier in the lifecycle? *(Default: yes, block any prior involvement.)*
2. **Override notification**: when validator overrides, does original closer get immediate notification, daily digest, or nothing? *(Default: immediate on override (coaching moment); daily digest for approvals.)*
3. **Validate `closed_won` deals**: both wins and losses, or only losses? *(Default: both — bought-too-high is as much a coaching moment as a loss.)*

---

## D. Closer Dashboard UX

### D.1 Mental model — four modes

The dashboard is **role-aware, single-purpose per moment**. A closer at any second is doing exactly one of:

1. **Hunting** — no active lead, scanning the buybox.
2. **Working** — actively negotiating a claimed lead.
3. **Awaiting** — offer sent, 72hr clock running.
4. **Disposing** — forced disposition modal blocking everything.

The dashboard makes the current mode physically obvious. No tabs. No nested menus. The page rearranges.

### D.2 The three states

#### State 1 — Hunting (no claimed lead)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Rami Albanna · VIP Closer · 0/1 active                  [profile]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  TODAY'S BUYBOX                                    [filters: region]│
│  47 leads · 12 green · 18 blue · 9 yellow · 6 orange · 2 red       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🟢 2021 Tacoma TRD · 38K mi · $32,400 ask · MMR $34,800     │   │
│  │    Dallas · 12 min ago · sourceConf 92%        [Claim ▸]    │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 🟢 2022 F-150 XLT · 22K mi · $41,000 ask · MMR $43,200      │   │
│  │    Houston · 18 min ago · sourceConf 88%       [Claim ▸]    │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 🔵 2020 Civic EX · 51K mi · $18,500 ask · MMR $19,400       │   │
│  │    Austin · 31 min ago · sourceConf 95%        [Claim ▸]    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ─────────────── ACTIVE CLOSERS (right rail) ────────────────       │
│  🟢 Sarah Chen     VIP     working 1                                │
│  🟢 Mike Torres    Senior  working 1                                │
│  🟡 Alex Park      Closer  awaiting 1   (idle 18m)                  │
│  ⚫ Jamie Liu      Junior  offline                                  │
│                                                                     │
│  ─────────────── AWAITING YOUR APPROVAL (Sr/VIP only) ─────         │
│  📋 Alex Park · 2020 Civic EX · $17,800 offer · 4 min ago [Review]  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### State 2 — Working

Buybox collapses to a thin strip; active lead takes the canvas:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Rami · VIP · 1/1 active     ⏱ claimed 4 min ago    [Release lead]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  2021 Toyota Tacoma TRD Sport · VIN JTEBU5JR0M5...                  │
│  38,420 mi · Silver · Dallas, TX                                    │
│                                                                     │
│  ┌─ SYSTEM CALL ────────┐  ┌─ COUNTER THREAD ──────────────────┐   │
│  │ 🟢 GREEN              │  │ seq 1 · YOU → customer  $32,400   │   │
│  │ MMR $34,800           │  │   self-approved · sent 12:14pm    │   │
│  │ Buybox fit: 0.92      │  │   expires Wed 12:14pm  ⏱ 71h 48m │   │
│  │ Freshness: 12 min     │  │                                   │   │
│  │ SourceConf: 92%       │  │ seq 2 · customer → YOU  $33,500   │   │
│  │ Region: Dallas ✓      │  │   received 12:31pm                │   │
│  └───────────────────────┘  │   [Your move ▾]                   │   │
│                             └───────────────────────────────────┘   │
│                                                                     │
│  ─────────── DRAFT COUNTER ────────────                             │
│  Amount: [ $32,900 ]                                                │
│  Notes:  [ Pulled comps, 3 sold last 7d at $33.2-33.6 ]             │
│                                                                     │
│  [ Send to Customer ]   (VIP — no approval needed)                  │
│                                                                     │
│  ─────────── ACTIVITY LOG ────────────                              │
│  12:31  Customer countered $33,500                                  │
│  12:14  Offer $32,400 sent (self-approved)                          │
│  12:10  Claimed by Rami                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### State 3 — Disposing

Modal blocks the page:

```
┌─────────────────────────────────────────────────────────────────────┐
│  DISPOSE LEAD · 2021 Tacoma TRD                                     │
│                                                                     │
│  Outcome:        [ Lost · Price ▾ ]                                 │
│                                                                     │
│  Your grade:     ( ) 🟢  ( ) 🔵  (●) 🟡  ( ) 🟠  ( ) 🔴             │
│  System said:    🟢 GREEN                ⚠ 2-step disagreement      │
│                                                                     │
│  Your MMR call:  [ $33,200 ]                                        │
│  System MMR:     $34,800                  Δ -$1,600 (-4.6%)         │
│                                                                     │
│  Final offer:    $32,900 (auto-filled from last to_customer)        │
│                                                                     │
│  Notes (REQUIRED — grade disagreement ≥ 2):                         │
│  [ Recent auction prints softer than MMR shows; ___________ ]       │
│                                                                     │
│            [ Cancel ]            [ Submit Disposition ]             │
└─────────────────────────────────────────────────────────────────────┘
```

After submit: lead → terminal status, cap slot frees, closer → Hunting state.

### D.3 Where A/B/C surface

**From A (tiers + claim + cap):**

- Header shows `1/1 active`. Most important number on the page. Always visible.
- "Claim" button disabled when at cap. Tooltip: "Finish current lead first."
- Tier badge next to name. Other closers' tiers visible in the right rail.
- Idle time displayed in Active Closers — social pressure replaces nagging.

**From B (offers + counter flow):**

- "Send to Customer" button label dynamic by tier × amount.
- Counter thread rendered as vertical timeline.
- 72hr countdown on live to_customer offer, color shifts green→yellow→red as expiry approaches.
- Awaiting Approval panel **only visible to Sr/VIP**.

**From C (dispositions + validator):**

- Disposition modal forces grade + MMR + notes-when-delta-≥2.
- Pending validation badge on closer's lead history after submit. No blocker.
- Separate Validator Queue page (Sr/VIP only), accessed from nav. Reason: validation needs its own focus mode.

### D.4 Active Closers rail

Real-time WebSocket (Cloudflare Durable Objects).

| Dot | Meaning |
|---|---|
| 🟢 Working | Has claimed lead, last activity < 5 min |
| 🟡 Awaiting | Live offer out, waiting on customer |
| 🟠 Idle | Has lead but no activity 15–30 min |
| 🔴 Stale | About to be auto-released (>25 min idle) |
| ⚫ Offline | Logged out or no activity 60+ min |

Hover row → mini-card: current lead VIN, claimed at, last activity, tier, today's stats.

### D.5 Buybox sorting and filtering

**Default sort:** freshness asc within grade desc. Greens at top, newest first within each grade.

**Filters:** region (multi-select), grade floor (slider), age (slider), source (Apify region / portal / dealer referral).

**No "assigned to me" filter** — nothing is assigned. Active lead = State 2 canvas.

### D.6 What the screen does NOT have

- No global search bar (admin-tool concern).
- No notifications inbox/bell. Real-time events arrive as toasts and panel updates. Persistent inbox creates pile-up anxiety.
- No leaderboard. Performance lives on a separate page. Leaderboards corrupt FCFS into a race.
- No "easy lead" sorts (highest margin, most likely to close). Kills training signal.

### D.7 Mobile / tablet

Realistic minimum: tablet for offer drafting. Phone = **claim-only + dispose + VIP approval**. No offer drafting on phone (too easy to mistype $32,000 as $320,000).

VIP phone approval flow (one-tap Approve/Reject) is the priority mobile use case because VIPs are the bottleneck.

### D.8 Things to push back on yourself about

1. **"State 2 should show buybox in a sidebar."** No — incentivizes mentally checking out of current lead.
2. **"Show win rate prominently."** No — vanity metric that punishes risk on yellow/orange leads where training data lives.
3. **"Let closers DND incoming counters."** No. Cap=1 means commit. Want quiet? Release.
4. **"Counter thread as chat bubbles."** No. It's a financial record. Ledger, not chat.
5. **"Approval rail pings with sound."** No. Visible badge. Sound creates Pavlovian responses in a sales environment.

### D.9 Open questions

1. **Teammates' active leads — visible or hidden?** *(Default: visible — embrace competition, trust cap.)*
2. **Phone scope:** claim/dispose/VIP-approve only, or also Junior/Closer offer drafting? *(Default: tablet+ for drafting.)*
3. **Approval notes:** require approver note on Approve? *(Default: one-click approve, note optional; rejections always require reason.)*
4. **Release-lead friction:** require a "why are you releasing?" reason? *(Default: yes, one-line reason — release ≠ dispose, but not friction-free either.)*

---

## E. Full Evaluation — Weaknesses & Recommendations

### E.1 The Big Structural Weaknesses

#### E.1.1 You're designing the supply side of a marketplace without modeling supply

Everything assumes leads arrive in the buybox and closers act on them. **Nothing addresses the quality, freshness, or volume of leads coming in.** Apify `tav-tx-east` runs every 5 minutes, other regions disabled, Cox MMR path exists. That's it.

**Why this matters:** if Apify breaks for 2 hours on Tuesday, the buybox empties, closers stare at empty screens, FCFS+cap=1 becomes a starvation model. Zero observability on ingestion health as a first-class concern.

**Fix:** Before PR 1, build an **ingestion health surface** — admin panel showing leads ingested per hour by source, last successful pull per region, dedup rate, normalization failure rate. **Bake in as PR 0.**

#### E.1.2 You have no answer for "who's on duty right now?"

Cap=1 + FCFS + 30-min idle sweep + tier-based approvals all assume a populated active workforce. **Shift state is not modeled.** If a Junior is the only person online at 7am and submits a $35K offer, who approves it? They wait. Until a Senior logs in. That's a customer-facing SLA failure dressed up as an internal rule.

**Fix:** Add explicit **on-duty / off-duty** state on `tav.users`, distinct from "has lead claimed." Build approval routing: if no eligible approver on-duty within 5 min, escalate. Recommendation: **page on-call VIP via SMS**.

#### E.1.3 Buybox grade and closer grade are not the same animal

`system_grade` = signal of **opportunity quality** at lead surface time. `closer_grade` at disposition = **retrospective judgment** of how the lead actually went. Storing in same enum and computing delta as if comparable is wrong.

Example: system says 🟢 (great opportunity!), closer learns title is in deceased relative's name across state lines, marks 🔴 at disposition. "Delta = 4" looks like calibration problem. It isn't — it's two different questions answered at two different times.

**Fix:** Either (a) rename `closer_grade` → `closer_outcome_grade` and accept they measure different things, or (b) **split into two fields**: `closer_initial_grade` (first-touch, calibrated vs system_grade) and `closer_final_grade` (disposition, calibrated vs actual outcome). **Lean (b)** — separates calibration signal from outcome signal.

#### E.1.4 No model for the seller-side conversation actually happening

`lead_offers` captures dollar amounts + approval status. `lead_communications` deferred. **In between is where every deal lives.** Seller's tone, urgency, competing CarMax offer, whether they answered the phone — none in schema. Closer's only outlet is `outcome_notes` at disposition (too late).

**Fix:** Add **`lead_touches`** to PR 4 alongside `lead_offers`:

```
tav.lead_touches
─────────────────────────
id, lead_id, by_user_id, kind (call/sms/email/note),
direction (inbound/outbound/internal_note),
disposition_hint (answered/voicemail/no_answer/text_sent/etc.),
body (text), created_at
```

Validator queue without conversation context is half-blind.

#### E.1.5 Optimizing for individual closers, not team economy

FCFS + cap=1 is fair at the individual level. **At team level it has a known failure mode:** aggressive closers cherry-pick greens, leave oranges/yellows to rot. Validator queue catches this *after the fact*; the buybox itself doesn't.

**Fix options:**

1. **Mandatory mix** — must dispose 1 yellow/orange per 3 greens. Heavy-handed but honest.
2. **Time-locked greens** — new leads tier-gated for 30 seconds (Juniors only first 30s, then Closers + Juniors next 30s, then everyone). Forces Seniors/VIPs to either help juniors or wait.
3. **Recommendation engine on State 1** — show 3 personally-recommended leads + "browse all."

**Recommendation: option 2.** Uses tier authority for opportunity distribution, not just approval. Hard to game.

#### E.1.6 No cohorts, A/B testing, or experiment infrastructure

System learns from dispositions to retrain buybox. **No way to run "buybox v2 on 20% of leads and compare outcomes."** Every grading-algorithm change is global, irreversible, uncomparable.

**Fix:** Add **`bucket_id`** to `leads` table from day 1. Even if unused in v1. Free now, expensive to retrofit.

### E.2 The Sneaky Operational Weaknesses

#### E.2.1 No story for "lead came in 6 months ago, seller calls back today"

Disposed leads are immutable; revival = new lead linked via `parent_lead_id`. Good rule. **But UX doesn't surface "this VIN has a parent."** Closer re-does the work, re-discovers issues, possibly re-grades differently.

**Fix:** State 2 canvas shows **"Lead history for this VIN"** strip when `parent_lead_id` exists. Show prior dispositions, offers, closer. Optionally auto-route to original closer if on-duty and under cap.

#### E.2.2 No story for buyer-side fraud / collusion

Seniors approve Closers. VIPs approve Seniors. **This is exactly the surface area where price-fixing kickbacks happen in dealer environments.** Senior approves all Closer X's high offers → Closer X overpays → Senior takes a cut. Not accusing anyone — telling you this is a known failure mode and your design has no guard.

**Fix:**

- Track **approver/submitter pair frequencies**. Flag when Closer X's offers go to Senior Y > 60% with other Seniors available.
- Track **approval-to-MMR-delta**. Flag approvers consistently signing off on system-says-GREEN-but-actual-RED dispositions.
- Admin-only reports. Don't tell closers they're watched — but watch.

#### E.2.3 No story for leads that should never have entered the buybox

Apify/normalizer produces garbage: undecodable VINs, 999,999 mileage, salvage titles in listing, recent dupes. These hit the buybox graded *something*, closer claims, wastes 10 min, disposes. Multiplied by hundreds of leads/day.

**Fix:** Add **pre-buybox filter stage** between Normalized Listing → Vehicle Candidate. Automated disqualifiers: VIN check, mileage sanity, branded title flag, dupe within 30 days, recently disposed parent. Failed candidates → `rejected_candidates` with reason.

#### E.2.4 Junior training has no curriculum, only validation

Junior submits → Senior approves/rejects → Senior overrides disposition → Junior reads override note. **Reactive coaching only, no proactive component.**

**Fix:** Add **"Junior Learning Feed"** — low-priority page:

- Anonymized recent Sr/VIP overrides ("this lead was green, closer marked red, validator overrode to yellow — here's why")
- "Deals you would have lost" — replays of leads disposed by Sr/VIPs the Junior could learn from
- Weekly digest: top 3 grading disagreements with system

Schema-free — query over existing `lead_dispositions`. Behavior change is huge.

#### E.2.5 No cross-tier knowledge transfer

When a VIP marks 🔴 with notes "MMR shows $34K but Manheim Atlanta is $31K on this body style this week," that insight is locked in one row. Next closer seeing similar vehicle gets nothing.

**Fix (Phase 2):** `disposition_insights` view surfacing notes from recent dispositions on similar vehicles (same year/make/model within 90 days) on State 2 canvas.

### E.3 Plan-Level Process Weaknesses

#### E.3.1 You're planning in PRs, not in milestones

9 PRs scoped. PR 1 (users + tiers) and PR 9 (performance page) differ wildly in risk and reversibility. **No milestone or release boundary defined** — when does this stop being sandbox and start serving real closer activity?

**Fix:** Group into **3 milestones** (full breakdown in section G below).

#### E.3.2 No rollback story for dispositions / training data

Once dispositions accumulate, schema changes get expensive. Discovering at week 3 that the 12-outcome enum is wrong = N production rows with wrong taxonomy.

**Fix:** Decision now — **disposition outcome enum locked for 90 days after first production write.** Map current AppSheet outcome reasons to the enum **before** PR 5, not after. Add `dispositions_v` int for optionality; plan to never use it.

#### E.3.3 No explicit "killed it" criterion for AppSheet

AppSheet closer screens are the incumbent. New platform replaces. **No explicit criterion for AppSheet decommission.** Without one, dual-entry becomes permanent (known rewrite-failure mode).

**Fix:** Numeric kill criterion now. Suggestion: **"AppSheet closer screens decommissioned 14 calendar days after new dashboard handles ≥95% of daily lead intake without a P1 incident."** Write it down. Sign-off. Wall.

### E.4 Concrete Suggestions

#### E.4.1 Build the calibration loop before the validator loop

Show closer their own running grade-vs-system agreement rate **before** they dispose. Junior who sees "your grade matched system on 14 of last 20" calibrates faster than one only seeing individual overrides. Tiny PR. Big lift. Slot after PR 6.

#### E.4.2 Instrument time-to-first-offer as a north star metric

No explicit business KPI in plan. Pick one. **Nomination: time from lead-claimed to first-offer-sent, p50 and p95.** Captures whether tier/approval design helps or hurts. Watch daily. If p95 balloons after PR 4 ships, approval gate is misconfigured.

#### E.4.3 Make MMR comparison a real feature, not a value

Disposition modal shows `system_mmr` vs `closer_mmr` statically. Real question is: "Why do I think MMR is wrong?" Add **structured reason chip set** to `closer_mmr` input: ☐ recent auction comps softer ☐ regional pricing differs ☐ condition adjustment ☐ trim mispriced. Makes the delta interpretable, not just observable.

#### E.4.4 Pre-mortem your first lost customer

Imagine: seller lists truck, gets TAV offer in 8 min, Senior at lunch, no Junior offer goes out for 35 min, seller accepts CarMax offer in meantime. **You lost a green-graded deal to internal approval delay.** Walk through that scenario now. On-call escalation? VIP paging? Auto-approve under $X if no one available in 5 min? Decide before launch.

#### E.4.5 Run first 30 days in shadow mode

Before real closers do anything, run new system in **read-only shadow** for 30 days: ingestion live, grading live, dispositions captured passively from AppSheet (or just observed). Generates real dataset of "what would new system have done" with zero risk. Then Beta with confidence.

**Single highest-leverage piece of advice in this document.** Skipping it is the most common way platform rewrites in this exact pattern fail.

#### E.4.6 Designate a single "rule of thumb" arbiter

Every decision so far has gone through us riffing. When you're 6 months in and three engineers argue about whether `lead_offers.notes` should be visible to validators by default, **someone needs final-call authority.** You, your CTO, or a designated tech lead. Write it down. Without an arbiter, every micro-decision becomes a meeting.

#### E.4.7 The MMR Lab in your repo is underleveraged

Existing MMR Lab surface in Next.js app should become the **closer's secret weapon**, not internal-only. Surface "MMR Lab" button on State 2 canvas. Lets closer run what-ifs on a specific VIN. Closer queries become training data on what closers actually care about.

### E.5 Ranked Risk List

Where this project most likely fails, in order:

1. **Ingestion health** (E.1.1) — buybox empties, closers idle, trust collapses.
2. **Approval routing gaps** (E.1.2) — Junior/Closer offers stuck, real customers lost.
3. **Dual-entry sticking** (E.3.3) — AppSheet never dies, you maintain two systems forever.
4. **Outcome enum lock-in** (E.3.2) — wrong taxonomy poisons training data.
5. **Cherry-picking dynamics** (E.1.5) — Seniors take greens, juniors starve, morale dies.
6. **Approver collusion blind spot** (E.2.2) — small, but catastrophic if it happens.
7. **Calibration signal confused with outcome signal** (E.1.3) — system never properly retrains.

First three: operational, fixable today. Next three: design changes. Seventh: long-term ML problem, won't matter for 6 months.

### E.6 Top Three Things to Do Differently

1. **Add PR 0 (ingestion health) and reorder.** Don't ship closer-facing surfaces until buybox supply is provably reliable.
2. **Add `lead_touches` to PR 4 scope.** Don't defer. Validator queue without conversation context is half-blind.
3. **Build shadow mode (E.4.5).** 30 days of dual-running before any closer touches new screens. Cheapest insurance you'll buy this year.

---

## F. Consolidated Open Questions

### Section A — Tiers & Claim

1. Senior-approves-Senior over $200K — yes or no? *(Default: no, VIP-only above $200K.)*
2. Internal rejection visibility — submitter-only or team-wide training feed? *(Default: submitter-only for now.)*

### Section B — Offers — Already Resolved

- ✅ Superseded offers' `expires_at` informational only.
- ✅ Withdraw = supersede with new offer through the gate. No special action.
- ✅ Approver UI shows full buybox context.
- ✅ $200K Senior threshold stands; approvals always followed regardless of context.
- ✅ Reject-with-reason rather than edit.
- ✅ Communications stored at deal/lead level (separate, future PR).
- ✅ `id uuid` PK, `seq` stored column.

### Section C — Dispositions & Validator

1. Validation cooling-off — block validators from validating leads they personally touched? *(Default: yes, block any prior involvement.)*
2. Override notification — immediate on override (coaching moment) vs daily digest for approvals? *(Default: yes — immediate on override, digest on approve.)*
3. Validate `closed_won` deals too, or only losses? *(Default: both.)*

### Section D — Dashboard

1. Teammates' active leads — visible or hidden? *(Default: visible.)*
2. Phone scope — claim/dispose/VIP-approve only, or also offer drafting? *(Default: tablet+ for drafting.)*
3. Approver note required on Approve? *(Default: one-click approve, note optional; rejections always require reason.)*
4. Release-lead reason required? *(Default: yes, one-line reason.)*

### Section E — Evaluation: Design Decisions Pending

1. **Adopt PR 0 (ingestion health) before PR 1?** *(Recommendation: yes.)*
2. **Add `tav.users.on_duty` state + approval routing escalation?** *(Recommendation: yes, page on-call VIP via SMS.)*
3. **Split `closer_grade` into `closer_initial_grade` + `closer_final_grade`?** *(Recommendation: yes.)*
4. **Add `lead_touches` to PR 4 scope?** *(Recommendation: yes.)*
5. **Adopt time-locked greens (option 2 from E.1.5) for opportunity distribution?** *(Recommendation: yes.)*
6. **Add `leads.bucket_id` for experiment infrastructure from day 1?** *(Recommendation: yes — free now, expensive later.)*
7. **Surface `parent_lead_id` history on State 2 canvas?** *(Recommendation: yes.)*
8. **Build approver pair-frequency + MMR-delta admin reports for fraud detection?** *(Recommendation: yes, admin-only.)*
9. **Add pre-buybox filter stage with `rejected_candidates`?** *(Recommendation: yes.)*
10. **Build Junior Learning Feed?** *(Recommendation: yes, low priority slot.)*
11. **Group 9 PRs into 3 milestones with explicit boundaries?** *(Recommendation: yes.)*
12. **Lock disposition outcome enum for 90 days after first production write?** *(Recommendation: yes.)*
13. **Define explicit numeric AppSheet kill criterion?** *(Recommendation: yes — 95% intake for 14 days, no P1.)*
14. **Run 30-day shadow mode before Beta?** *(Recommendation: yes — single highest-leverage decision in this document.)*
15. **Designate a single decision arbiter for ongoing micro-disputes?** *(Recommendation: yes.)*

---

## G. Revised PR & Milestone Sequence

### Milestone Alpha — Internal Skeleton (not user-facing)

Goal: prove ingestion + identity + claim mechanics in a sandbox with test accounts. 1–2 weeks.

| PR | Description |
|---|---|
| **0** | **Ingestion health surface** — admin panel for source freshness, dedup rate, normalization failures |
| 1 | `tav.users` + tiers + `concurrent_lead_cap` + `on_duty` state |
| 2 | 5-color grade migration (green/blue/yellow/orange/red) |
| 3 | Atomic claim + one-at-a-time guard + idle sweep |

### Milestone Beta — Live Negotiation (dual-entry with AppSheet)

Goal: real closers work real leads in parallel with AppSheet. AppSheet remains source of truth. 2–4 weeks.

| PR | Description |
|---|---|
| 4 | `lead_offers` + `lead_touches` (NEW — conversation capture alongside offers) + approval gate + approval routing escalation |
| 5 | `lead_dispositions` + forced-disposition flow + disposition outcome enum (locked after first prod write) |
| 6 | Validator queue + `TAV_VALIDATION_MODE` flag |
| 6.5 | **Calibration loop** — running grade-vs-system agreement rate on closer dashboard (slot from E.4.1) |
| 7 | Buybox dashboard + closer pages + validator UI + State 1/2/3 + Awaiting Approval rail |

### Milestone GA — Production Cutover (AppSheet closer screens decommissioned)

Goal: new platform becomes source of truth for buying side. 1–2 weeks.

| PR | Description |
|---|---|
| 8 | Active-closers panel (presence + WebSocket via Durable Objects) |
| 9 | Closer performance page + promotion signals + admin reports for approver pair frequency / MMR delta |

### Cross-cutting items (slot when capacity allows)

- `parent_lead_id` history strip on State 2 canvas
- Pre-buybox filter stage + `rejected_candidates`
- Junior Learning Feed
- `bucket_id` on leads (add in PR 1; usage deferred)
- Time-locked greens (opportunity distribution) — slot in Beta
- 30-day shadow mode run **before Beta begins**
- MMR Lab "what-if" button on State 2 canvas

---

## Document Status

**Working draft.** No section is locked. All defaults in F are recommendations, not decisions. Awaiting your sign-off, swing, or "let's revisit" on each open question.

**Next action:** walk through Section F in order, or jump to whichever cluster still feels squishiest.
