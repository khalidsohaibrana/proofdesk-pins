# Operating defaults (this repository)

| Setting | Value |
|---|---|
| Concurrent subagents | **max 7 running at once** (builders, reviewers, security, QA, resumed agents), enforced by `agent-system/hooks/cap-subagents.mjs` |
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
