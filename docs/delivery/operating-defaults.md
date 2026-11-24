# Operating defaults (this repository)

| Setting | Value |
|---|---|
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
| **Concurrent agents** | **Hard limit 7 at any one time**, counting builders, reviewers, security reviewers, QA, and discovery/helper agents and any resumed agent. The supervisor counts what is still running **before every dispatch or resume**; at the limit, it waits for one to finish |
| **Per-role limits** | **builders 5 · reviewer 1 · security reviewer 1 · QA 1**, concurrent. Two reviews of different PRs cannot run in the same role at the same time — they are serialised. Exceeding **any** of these limits, or the total of 7, requires the **product owner's explicit approval in chat first**. The supervisor **never raises these limits itself** |
| **Off limits to agents** | `.claude/agent-system.json` and `.claude/settings.json` are never edited by any agent, including the supervisor |
| **No make-work** | Never open a review round, or dispatch any agent, to keep agents busy. Getting open PRs through their **first** verdicts outranks starting new rounds |
