#!/usr/bin/env bash
# setup-global-instructions.sh
# Bootstraps user-level (Tier 4) Claude Code memory + sane defaults for TAV-AIP work.
# Safe to re-run: backs up any file it would overwrite.

set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${CLAUDE_DIR}"
mkdir -p "${CLAUDE_DIR}/agents"
mkdir -p "${CLAUDE_DIR}/commands"

backup_if_exists() {
  local f="$1"
  if [[ -f "$f" ]]; then
    cp "$f" "${f}.bak.${TS}"
    echo "  backed up → ${f}.bak.${TS}"
  fi
}

# -------- Global CLAUDE.md (Tier 4: personal memory) --------
GLOBAL_MD="${CLAUDE_DIR}/CLAUDE.md"
backup_if_exists "${GLOBAL_MD}"
cat > "${GLOBAL_MD}" <<'EOF'
# Global Instructions (Tier 4 — User Memory)

Personal defaults that apply across every project — including TAV-AIP.
Project-specific rules belong in that project's CLAUDE.md, not here.

## Working style
- Default to **Plan Mode** for any change that spans more than one file.
- Always run the project's verification loop before declaring "done".
- Prefer **small, reviewable diffs** over sweeping rewrites.
- When uncertain, ask one focused question rather than guessing.

## Code preferences
- Typed languages: enable strict mode by default.
- Test framework: whatever the project uses — do not introduce a new one without an ADR.
- Logging: structured (JSON) over printf debugging in committed code.
- Comments: explain *why*, never *what*.

## Communication preferences
- TL;DR first, details after.
- Cite file paths and line numbers when discussing code.
- No emojis. No exclamation points. No marketing adjectives.
- If a request conflicts with project CLAUDE.md, surface the conflict before acting.

## Security defaults
- Never paste secrets into chat or commits.
- Never run destructive shell without explicit confirmation.
- Treat `.env*` and `.dev.vars` as read-only via config loaders.

## TAV-AIP defaults (loaded per-project from its CLAUDE.md, restated here for cross-project consistency)
- Facebook listings rarely have VIN — never assume it.
- Never collapse Raw / Normalized / Vehicle Candidate / Lead.
- Every rejection writes a `reason_code`. Silent drops are forbidden.
- Service role key lives only in the Cloudflare Worker.

## Subagent defaults
- Use subagents for: parallel review, research, exploration of large codebases, schema work.
- Do not use subagents for: trivial single-file edits.
EOF
echo "wrote ${GLOBAL_MD}"

# -------- Global settings.json (permissions baseline) --------
SETTINGS_JSON="${CLAUDE_DIR}/settings.json"
backup_if_exists "${SETTINGS_JSON}"
cat > "${SETTINGS_JSON}" <<'EOF'
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(npm test)",
      "Bash(npm run lint)",
      "Bash(npm run typecheck)",
      "Bash(npm run build)",
      "Bash(npx vitest:*)",
      "Bash(wrangler dev:*)",
      "Bash(wrangler tail:*)"
    ],
    "ask": [
      "Edit",
      "Write",
      "Bash(git commit:*)",
      "Bash(git push:*)",
      "Bash(wrangler deploy:*)",
      "Bash(wrangler secret put:*)",
      "Bash(supabase db push:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(sudo:*)",
      "Bash(curl:* | sh)",
      "Bash(curl:* | bash)",
      "Read(.dev.vars)",
      "Read(.env)",
      "Read(.env.*)"
    ]
  }
}
EOF
echo "wrote ${SETTINGS_JSON}"

# -------- Global slash command: /verify --------
VERIFY_CMD="${CLAUDE_DIR}/commands/verify.md"
backup_if_exists "${VERIFY_CMD}"
cat > "${VERIFY_CMD}" <<'EOF'
---
description: Run the project's standard verification loop and report results.
---

Run, in order, stopping at the first failure:

1. Lint  (use the project's lint command from CLAUDE.md §4)
2. Typecheck
3. Unit tests
4. Integration tests if the diff touches I/O, sources, or migrations.

After running, output:
- Each step: command, exit code, last 20 lines of output on failure.
- A one-line PASS/FAIL summary.
- If FAIL: a proposed minimal fix, no edits yet.
EOF
echo "wrote ${VERIFY_CMD}"

# -------- Global slash command: /plan --------
PLAN_CMD="${CLAUDE_DIR}/commands/plan.md"
backup_if_exists "${PLAN_CMD}"
cat > "${PLAN_CMD}" <<'EOF'
---
description: Force a structured plan-mode response before any edit.
---

You are in Plan Mode. Do not edit files.

Produce a plan with these sections:

1. **Goal** — one sentence, restated in your own words.
2. **Files to read** — paths you intend to inspect, with reason.
3. **Files to change** — paths + nature of change (new / modify / delete).
4. **Approach** — 3–7 bullets, in execution order.
5. **Risks** — what could break, and how you'd detect it.
6. **Verification** — exact commands you will run after implementing.
7. **Out of scope** — things you will *not* touch in this change.

End with: "Approve plan? (y / revise)".
EOF
echo "wrote ${PLAN_CMD}"

cat <<MSG

✓ Global Claude Code instructions installed at ${CLAUDE_DIR}
  - CLAUDE.md      (user memory, TAV-aware)
  - settings.json  (permission baseline)
  - commands/verify.md
  - commands/plan.md

Next steps:
  1. Open the TAV-AIP project, copy this starter kit's .claude/ and CLAUDE.md into it.
  2. Run \`claude\` and try:  /plan  then  /verify
MSG
