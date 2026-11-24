# Operating defaults (this repository)

| Setting | Value |
|---|---|
| Parallel builders | **5** (demo repo; one ticket = one builder = one branch = one PR) |
| Builder model | sonnet · Reviewer / security / QA: per agent file |
| Review rounds | **max 3** per PR; after round 3 the supervisor escalates to the human |
| Stuck rule | a builder stops after 2 failed attempts at the same failure |
| Branches | `agent/<issue#>-<slug>`, created by the builder in its own git worktree |
| Commits | Conventional Commits |
| Verdicts | PR comments whose **first line** is exactly `REVIEW: APPROVE — round k`, `REVIEW: REQUEST CHANGES — round k`, `SECURITY: PASS — round k`, `SECURITY: FAIL — round k`, `QA: PASS` or `QA: FAIL` |
| Merge requires | CI green, `REVIEW: APPROVE`, `SECURITY: PASS` when required, `QA: PASS` with the recorded feature run linked, and the human's approval |
| Who merges | the human product owner |
| ADRs | agents write **Proposed**; only the human accepts |
