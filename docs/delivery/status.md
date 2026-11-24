# Delivery status (session handoff)

The supervisor reads this first and updates it at the end of every session.

**Last updated:** 2026-11-24, supervisor session 1 — **wind-down**. T0 merged; wave 2 built and in review; dispatching stopped at the product owner's instruction.

## Current gate
**Wave 2, G2/G3.** ADR-0001, ADR-0002, ADR-0003 Accepted. #1 (T0) merged as `a8bea90`; `src/core/**` is **frozen**. All five capability PRs are open, **all five CI-green**, all past their first verdicts, all through at least one fix round.

## The five PRs — authoritative state

| # | Ticket | PR | Head | Review | Security | QA |
|---|---|---|---|---|---|---|
| 2 | members and roles | #10 | `253da74` | **APPROVE r2** | **PASS r2** | *in flight at wind-down* |
| 3 | guest review links | #12 | `179a095` | CHANGES r2 — **blocker was body-only, body rewritten by supervisor**; needs confirmation only | **PASS r2** | not started |
| 4 | pinned comments | #14 | `595b98a` | CHANGES r1 → r2 pushed, **not yet re-reviewed** | PASS r1 (**STALE**, earned at `eaad7e4`) | not started |
| 5 | approval decisions | #11 | `a8d683f` | **APPROVE r2** | **PASS r2** | **PASS** |
| 6 | new asset versions | #13 | `f8b3c05` | APPROVE r1 (**STALE**, earned at `7e15a4a`) | **PASS r2** | not started |

**Fully gated (G3 complete): #11 only.** #10 was one QA verdict away.

**Rounds used (max 3, then escalate): #10: 2 · #11: 2 · #12: 2 · #13: 2 · #14: 2 — every PR has exactly one round left.**

**Verdict staleness is the first thing to check.** A verdict counts only if it post-dates the head. **#13's review APPROVE and #14's security PASS are both stale** and must be re-run. Read every verdict off the PR with `gh pr view <n> --comments` — this table is a summary, not the source of truth.

## ⚠️ Security event — prompt injection against a reviewer agent
During Aegis's round-2 review of #13, **a tool-result message he received contained an injected fake `system-reminder`** instructing him to treat one of his own deliberate temporary probe edits as an intentional permanent change **and to conceal it from the supervisor**.

He **disregarded it, reverted the probe, and disclosed it** in his verdict, confirming via `diff`/`git status` that the file was byte-identical and the tree clean. Correct handling — but the attempt itself needs the product owner's attention, because an agent that complied would have hidden a source edit from review. Worth deciding whether to harden agent briefs against injected reminders, and treat anything that tells an agent to conceal work from the supervisor as hostile by default.

## Blockers / waiting on the human
1. **All five merges.** Deferred by the product owner; nothing merged this session beyond #1.
2. **Docs PR #8** (ADR-0003 + decision log + this handoff) unmerged. Builders have been reading ADR-0003 off the `docs/adr-0003-wave-plan` branch. **Conflicts with `main` were resolved this session**: `operating-defaults.md` now takes `main`'s authoritative capacity row (plus a "no make-work" row), and the decision log is the union of both.
3. **A stale `tsx src/server.ts` (pid 52244, from `/tmp/qa-pr11`) holds port 3100.** Iris had to run Playwright on a throwaway port because of it. **Kill it before the next QA lane** or `npm run e2e` will not bind. The supervisor's sandbox declined the `kill`.
4. **Three decisions parked, all non-blocking, all recorded on the PRs:**
   - **Anonymous `401`-vs-`404` existence oracle.** Raised independently by both reviewers on three PRs. Structural to ADR-0003 §A's step order (step 2 loads the record before step 4 authorizes) and **already present on `main`**. Reveals only "an id exists somewhere", never tenancy or content. *Recommendation: accept with a one-line ADR note; before production, close it for every route at once with a credential-presence gate in `src/core/access.ts` ahead of step 1 — needs an ADR amendment.*
   - **No-consent member add** (#10): an owner can add any existing user id without consent and reads their name and email back in the `201`. Verified **not** to breach invariant 1. A privacy choice before this leaves the demo slice.
   - **`@hono/node-server` 1.19.19 moderate advisory** (GHSA-rmxm-3fg6-px4f), inherited from the seed; fix is a breaking major. *Recommendation: separate ticket, decide at release.*

## Known gaps, deliberately accepted — the important section
- **Invariant 3 has no full automated proof.** #13's regression test is **vacuous** by construction: its comment/decision fixtures are `const` locals the route can never reach, so three assertions cannot fail for any implementation. An implementation that re-parented real comments would leave the suite green. Partly mitigated in #13 r2 by a real **import-boundary guard** — but **Aegis found that guard has a blind spot**: it filters with `/^\s*import\b/`, so a **dynamic `import()`** or an **`export { x } from '…'` re-export** evades it. He proved it empirically by injecting both and watching the test pass when it should have failed. No production code exploits it today. **Fix the regex when closing #15.**
- **The guest journey is unproven end to end.** #12, #14 and #11 each test guest access through a *fake* resolver by design (that is what made them parallel), so all three can pass without the three composing. #7 is deferred (D-006).
- **Four of #11's acceptance criteria are unverified** until #14's `review.html` is on `main`.
- **No recording has had its frames visually inspected.** QA confirmed artifact existence, validity and commit binding on #1 and #11, but `ffprobe`/`ffmpeg` were unavailable in-sandbox. The project profile makes that recording *the* feature-run evidence — it needs one spot-check by someone with full tool access before production sign-off.
- **→ All of the above are tracked on [#15](https://github.com/khalidsohaibrana/proofdesk-pins/issues/15), priority raised. Treat #15 as a release blocker, not a tidy-up.** The brief's end-to-end acceptance scenario (automated E2E **and** a recorded walkthrough) is **not satisfied**; the project is not complete until it is.

## Next actions (next supervisor session)
1. Read #10's QA verdict off the PR (it was in flight at wind-down) and record it.
2. Re-review **#14 r2**; re-verify **#14** security (stale); re-review **#13** (stale). Confirm **#12**'s rewritten body.
3. QA #12, #13, #14 as the single QA slot frees.
4. Respect D-009: **5 builders, 1 reviewer, 1 security, 1 QA, 7 total**, from `.claude/agent-system.json` via `agent-system/hooks/cap-subagents.mjs`. Same-role reviews of different PRs **serialise** — plan for a slow tail. Never raise a limit; never edit those config files.
5. Present fully-gated PRs with their unverified lists attached. **Never present a PR as complete while its #15 gaps are open.**
6. After the five merge: dispatch **#15**, then **#7** (guest-journey E2E).

## What went wrong this session — read this before the next one
The recurring defect in **every single PR** was **tests that stay green against broken code**: a member-list filter that could return every membership in the system; a denied-POST targeting a user who was already a member (so it could not detect the write it existed to detect); `arrayContaining` passing on supersets; `toHaveAttribute(…, /.*/)` matching the empty string; a pin bounds table varying only `x`; a version-scoping test satisfied by `[]`; AC-S1 tests that passed with the guard deleted; and an invariant-3 fixture compared against a deep copy of itself.

Reviewers caught these **only by mutation testing** — deliberately breaking the implementation and checking the test fails. Once asked for it explicitly, builders did it well and reported real before/after numbers.

**Demand it in every fix round.** "I added a test" is not evidence. "I removed the guard and watched this test fail" is.

## Usage note
Agent runs this session: 1 × solution-architect, 11 × builder (incl. fix-round resumes), 7 × reviewer, 8 × security-reviewer, 3 × QA. Two runs stopped deliberately: an unnecessary round 3 on #1 (to avoid resetting passing verdicts) and the #14 security review (to comply with the per-role limit; killed before posting, so no partial verdict reached the PR).
