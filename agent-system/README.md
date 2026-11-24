# Agent System: supervised multi-agent software delivery

A reusable delivery system for Claude Code. A **supervisor** agent plans, gates and routes the work, parallel **builder** agents implement one ticket each in isolated git worktrees, separate **reviewer** and **QA** agents verify every PR, and a **human product owner** approves anything that goes to production.

It currently lives inside its first host project and is developed alongside it. It is kept **self-contained** so it can be pulled out as its own product.

## Boundary rule
Nothing in `agent-system/` may mention a specific project. Project facts belong in the host project's `docs/delivery/project-profile.md`. Check with:

```bash
grep -rniE "<project-name>" agent-system/ && echo "LEAK: project-specific reference" || echo "clean"
```

## Contents

| Path | Purpose |
|---|---|
| `agents/supervisor.md` | Supervisor persona: gates G0–G4, dispatch protocol, operating rules, escalation, reporting format |
| `agents/builder.md` | One ticket → one worktree → one PR with evidence |
| `agents/reviewer.md` | Independent review against the ticket; read-only; `REVIEW:` verdict comment |
| `agents/security-reviewer.md` | Threat review for auth/access/tenancy/files/records; read-only; `SECURITY:` verdict comment |
| `agents/qa.md` | Verifies acceptance criteria with evidence; `QA:` verdict comment + QA summary |
| `agents/product-analyst.md` | Discovery: SRS, acceptance criteria, edge cases (docs only) |
| `agents/ux-designer.md` | Discovery: screens, flows, wireframes, visual direction (docs only) |
| `agents/solution-architect.md` | Discovery: domain/auth ADRs, contracts, environment plan (docs only) |
| `hooks/guard-main-checkout.mjs` | Blocks code edits in the main checkout; builders work in worktrees |
| `templates/` | Ticket, QA summary, PR, ADR and project-profile templates |
| `docs/MULTI_AGENT_SYSTEM_BASELINE.md` | Roles, authority and delivery workflow |
| `install.sh` | Wires the system into a host project |

## How a host project uses it

```
host-project/
├── agent-system/                  ← this folder (vendored, submodule, or plugin later)
├── .claude/agents/*.md            → symlinks to agent-system/agents/*.md
├── .claude/agent-system.json      ← docs-only paths for the guard hook
├── .claude/settings.json          ← registers the guard hook
└── docs/delivery/
    ├── project-profile.md         ← project facts: sources of truth, invariants, scope
    ├── operating-defaults.md      ← project's process decisions
    └── decision-log.md
```

```bash
agent-system/install.sh            # from the host project root
claude --agent supervisor
```

## Extracting it later
1. Move this folder to its own repository (for example with `git subtree split --prefix=agent-system`, which keeps its history).
2. Bring it back into each project as a git submodule at `agent-system/`, or package it as a Claude Code plugin.
3. Projects keep their own `docs/delivery/` files untouched.
