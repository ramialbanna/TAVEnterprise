#!/usr/bin/env zsh
# memory.sh — launch Claude with project context injected as system prompt

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
GLOBAL_CLAUDE="$HOME/.claude/CLAUDE.md"
LESSONS="$REPO_DIR/tasks/lessons.md"
MEMORY="$REPO_DIR/.claude-memory.md"

# Build context
PRIMER=""
if [[ -f "$GLOBAL_CLAUDE" ]]; then
  PRIMER=$(cat "$GLOBAL_CLAUDE")
fi

COMMITS=$(git -C "$REPO_DIR" log --oneline -5 2>/dev/null)
BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)
MODIFIED=$(git -C "$REPO_DIR" diff --name-only HEAD 2>/dev/null)

LESSONS_CONTENT=""
if [[ -f "$LESSONS" ]]; then
  LESSONS_CONTENT=$(cat "$LESSONS")
fi

MEMORY_CONTENT=""
if [[ -f "$MEMORY" ]]; then
  MEMORY_CONTENT=$(cat "$MEMORY")
fi

SYSTEM_PROMPT="$(cat <<EOF
$PRIMER

---
## Session Context

**Branch:** $BRANCH

**Last 5 commits:**
$COMMITS

**Modified files:**
$MODIFIED

**Lessons learned:**
$LESSONS_CONTENT

**Commit memory:**
$MEMORY_CONTENT
EOF
)"

claude \
  --permission-mode acceptEdits \
  --allowedTools "Bash(git:*) Bash(npm:*) Edit Write Read" \
  --system-prompt "$SYSTEM_PROMPT"
