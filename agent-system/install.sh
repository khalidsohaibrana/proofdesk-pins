#!/usr/bin/env bash
# Install the agent system into a host project.
# Usage: agent-system/install.sh [project-dir]   (default: parent of this folder)
# Safe to re-run: it never overwrites existing project files.
set -euo pipefail

SYSTEM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${1:-$SYSTEM_DIR/..}" && pwd)"
REL_SYSTEM="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$SYSTEM_DIR" "$PROJECT_DIR")"

copy_if_missing() { # src dest
  if [[ -e "$2" ]]; then echo "  keep    $2"; else mkdir -p "$(dirname "$2")"; cp "$1" "$2"; echo "  create  $2"; fi
}

echo "Installing agent system from $REL_SYSTEM into $PROJECT_DIR"

# 1. Agents: relative symlinks, so edits in agent-system/ apply immediately.
mkdir -p "$PROJECT_DIR/.claude/agents"
for agent in "$SYSTEM_DIR"/agents/*.md; do
  name="$(basename "$agent")"
  ln -sfn "../../$REL_SYSTEM/agents/$name" "$PROJECT_DIR/.claude/agents/$name"
  echo "  link    .claude/agents/$name"
done

# 2. Project-owned files: copied once, then owned by the project.
copy_if_missing "$SYSTEM_DIR/templates/pull_request_template.md" "$PROJECT_DIR/.github/pull_request_template.md"
copy_if_missing "$SYSTEM_DIR/templates/adr-template.md" "$PROJECT_DIR/docs/adr/0000-template.md"
copy_if_missing "$SYSTEM_DIR/templates/project-profile.md" "$PROJECT_DIR/docs/delivery/project-profile.md"

if [[ ! -e "$PROJECT_DIR/.claude/agent-system.json" ]]; then
  cat > "$PROJECT_DIR/.claude/agent-system.json" <<JSON
{
  "profile": "docs/delivery/project-profile.md",
  "docsOnlyPaths": ["product/", "docs/", "$REL_SYSTEM/", ".claude/", ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/"]
}
JSON
  echo "  create  .claude/agent-system.json"
fi

# 3. Hook: printed, not merged, so an existing settings.json is never clobbered.
cat <<EOF

Add this hook to $PROJECT_DIR/.claude/settings.json (if not already present):
  "hooks": { "PreToolUse": [ { "matcher": "Write|Edit|MultiEdit|NotebookEdit",
    "hooks": [ { "type": "command", "command": "node \"\$CLAUDE_PROJECT_DIR/$REL_SYSTEM/hooks/guard-main-checkout.mjs\"" } ] } ] }

Then fill in docs/delivery/project-profile.md and run:  claude --agent supervisor
EOF
