# Final Handoff Checklist

Status: Active handoff checklist  
Date: 2026-05-18  
Audience: Rami, incoming developers, reviewers

This checklist confirms the state of the project before official v2 handoff.

## 1. Repository State

| Item | Status | Notes |
|---|---|---|
| GitHub repository cleanup | Done | Current docs are under numbered folders; historical docs are archived. |
| V2 control packet | Done | See `docs/06-platform/`. |
| New developer handoff | Done | See `docs/06-platform/18-new-developer-handoff.md`. |
| Master docs index | Done | See `docs/INDEX.md`. |
| Onboarding email draft | Done | See `docs/04-operations/onboarding-email.md`. |
| First v2 code slice | Not started | Start after this handoff PR merges. |

## 2. Current GitHub PR

Current handoff PR:

```text
PR #64 — docs: add current architecture map
```

The PR contains documentation only. It does not start v2 implementation code.

Before merging, verify:

- CI passes.
- Secret-leak guard passes.
- Vercel preview passes.
- Reviewer/subagent check is either green or explicitly waived if stuck.
- No unintended product/code files are included.

## 3. What Was Cleaned Up

The repo used to have too many historical markdown files competing with current
instructions. The cleanup created a clearer structure:

```text
docs/
  01-architecture/
  02-product/
  03-api/
  04-operations/
  05-process/
  06-platform/
  archive/
```

What moved:

- old MVP handoffs/specs/plans into archive
- superseded Manheim/API/runtime notes into archive
- current roadmap/product/API/runbook docs into numbered folders
- v2/v3 control docs into `docs/06-platform/`

Why:

- new developers can find the current source of truth quickly
- old context is preserved but no longer noisy
- v2 implementation now has one traceability chain
- Obsidian can point to stable repo docs instead of duplicating everything

## 4. Obsidian Sync Checklist

The repo is the source of truth. Obsidian should keep lightweight navigation and
session notes in sync.

Update/verify these vault files:

| Vault file | Required content |
|---|---|
| `Topics/TAV-AIP.md` | Links to `docs/INDEX.md`, platform docs, handoff, implementation index. |
| `ClaudeCode/TAV-AIP/START HERE.md` | Current repo path, PR #64, next action after merge. |
| `Sessions/2026-05-18-tav-aip-v2-handoff-docs.md` | Summary of final handoff docs and first v2 slice. |
| `Sessions/2026-05-18-tav-aip-environment-cleanup.md` | Cleanup summary and repo/GitHub/Obsidian alignment. |

Do not copy every repo doc into Obsidian. Link to repo docs so one source of
truth remains.

## 5. First V2 Work Package

After PR #64 merges, start from clean `main` and implement:

```text
Read-only Opportunities
  -> GET /app/opportunities
  -> GET /app/opportunities/:id
  -> /opportunities table + preview
  -> badges + honest states
  -> no mutation workflows
```

Required docs before coding:

- `docs/06-platform/02-functional-requirements.md`
- `docs/06-platform/03-data-model.md`
- `docs/06-platform/04-state-machines.md`
- `docs/06-platform/05-api-contract.md`
- `docs/06-platform/06-ux-spec.md`
- `docs/06-platform/09-test-strategy.md`

## 6. Stop Conditions

Stop and update docs/open questions before coding if:

- the work changes schema without matching FR/API/test traceability
- a UI action implies a mutation not covered by state machines
- near-miss or repeated-sighting behavior is ambiguous
- estimated mileage/style/MMR would display without a badge
- any browser path would call Supabase/Cox/Manheim directly
- any v3 approval/disposition feature is sneaking into v2

## 7. Final Handoff Statement

The project is ready for v2 implementation after PR #64 merges. The first code
step is intentionally narrow: read-only Opportunities. The broader workflow
build should proceed in the sequence defined by
`docs/06-platform/19-v2-implementation-index.md`.

