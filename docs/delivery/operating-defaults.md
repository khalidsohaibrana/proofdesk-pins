# Operating defaults (this repository)

| Setting | Value |
|---|---|
| Team capacity | **max 7 subagents running at once**; per role max **5 builders, 1 reviewer, 1 security reviewer, 1 QA** (discovery/helper agents count toward 7). Set in `.claude/agent-system.json` → `agentLimits`, enforced by `agent-system/hooks/cap-subagents.mjs`. **More needs the human's explicit approval**; agents never edit the limits |
| Parallel builders | **5** (demo repo; one ticket = one builder = one branch = one PR) |
| Builder model | sonnet · Reviewer / security / QA: per agent file |
| Review rounds | **max 3** per PR; after round 3 the supervisor escalates to the human |
| Stuck rule | a builder stops after 2 failed attempts at the same failure |
| Branches | `agent/<issue#>-<slug>`. **Every ticket states its branch name**; the builder creates it inside its isolated worktree (the worktree starts on an auto-named branch) |
| Commits | Conventional Commits |
| Verdicts | PR comments whose **first line** is exactly `REVIEW: APPROVE — round k`, `REVIEW: REQUEST CHANGES — round k`, `SECURITY: PASS — round k`, `SECURITY: FAIL — round k`, `QA: PASS` or `QA: FAIL` |
| Merge requires | CI green, `REVIEW: APPROVE`, `SECURITY: PASS` when required, `QA: PASS` with the recorded feature run linked, and the human's approval |
| Who merges | the human product owner |
| ADRs | agents write **Proposed**; only the human accepts |
| Review fixes | the supervisor sends findings back to the **same** builder (resume it), not a new one |
| **No make-work** | Never dispatch an agent or open a review round to keep agents busy. Getting open PRs through their **first** verdicts outranks starting new rounds |
