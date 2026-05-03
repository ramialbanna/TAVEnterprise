# Plan: Buyer Workflow / Lead Lifecycle Change

```
/plan

Goal: <add lead status | change locking rules | change assignment | add escalation | wire up dashboard hook>.

Read first:
1. src/assignment/assignLead.ts, locking.ts.
2. tav.leads, tav.lead_actions schema in supabase/schema.sql.
3. tav.v_active_inbox view definition.
4. docs/architecture.md §11.

Then produce the plan:

- Pipeline trace: which transition in the LeadStatus state machine is affected, and how upstream (lead creation) and downstream (purchase outcome attribution) are impacted.
- State-machine diagram (text): list valid transitions before and after.
   Example: new → assigned → claimed → contacted → negotiating → (passed | sold | purchased | stale | duplicate | archived).
- Locking rules:
   * who can claim
   * lock duration
   * what triggers lock_expires_at refresh
   * idle timeout → return to queue
- Assignment rules: region → buyer capacity → priority → source → specialty. Document any change.
- Escalation: excellent leads, unclaimed > 15 min, no action > 2h → who is alerted, via what channel.
- Audit: every transition writes a row to tav.lead_actions with actor_id, action, notes.
- Database changes (if any): hand off to data-modeler subagent.
- Tests:
   * happy path through new state(s)
   * race condition: two buyers try to claim simultaneously → one wins, other gets duplicate-warning
   * expired lock returns lead to queue
   * abandoned lead recycling
- Verification commands.

Hard constraints:
- Only one buyer can actively work a lead at a time.
- Every action is audited in tav.lead_actions.
- v_active_inbox semantics preserved (only new/assigned/claimed/contacted, not stale_confirmed/removed, last_seen_at > now() − 30d).
- AppSheet/Sheets is acceptable as a *temporary* operator surface; do not invest in it as the long-term home.

End with: Approve plan? (y / revise / abort)
```
