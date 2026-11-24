# Delivery status (session handoff)

The supervisor reads this first and updates it at the end of every session.

**Last updated:** 2026-11-24, supervisor session 1 — T0 merged, wave 2 dispatched

## Current gate
**Wave 2 in progress.** ADR-0001, ADR-0002, ADR-0003 all Accepted. #1 (T0) merged to `main` as `a8bea90`. Five builders are building #2–#6 in parallel.

## Done
- Seed app (pre-session): core domain, demo identity, module discovery, health and submission read endpoints, CI.
- **ADR-0003 Accepted** — answers both questions `product/brief.md` left open, plus the guest-access seam, immutability verb tables, the pin contract and the per-ticket file-ownership map.
- **Backlog #1–#7 filed** to the ticket template, each with acceptance criteria, allowed-path and denied-path tests, governing ADRs, sensitive-change flags and its branch name.
- **#1 (T0) merged.** `src/core/access.ts` + app shell. Two review rounds, security review twice (round 2 re-run because the authorization branch moved), QA pass. `src/core/**` is now **frozen** for every capability ticket.

## Wave plan
| Wave | Tickets | State |
|---|---|---|
| 1 | #1 T0 core access seam + shell | **merged** (`a8bea90`) |
| 2 | #2–#6 T1–T5, five builders in parallel, zero shared paths | **in progress** |
| 3 | #7 T6 guest-journey E2E | **deferred** (D-006), issue open and unassigned |

## Tickets in flight
| # | Ticket | Branch | PR | State |
|---|---|---|---|---|
| 2 | T1 members and roles | `agent/2-members-and-roles` | — | builder dispatched |
| 3 | T2 guest review links | `agent/3-guest-review-links` | — | builder dispatched |
| 4 | T3 pinned comments | `agent/4-pinned-comments` | — | builder dispatched |
| 5 | T4 approval decisions | `agent/5-approval-decisions` | — | builder dispatched |
| 6 | T5 new asset versions | `agent/6-new-asset-versions` | — | builder dispatched |

All five trip the security triggers (each touches authorization or tenancy), so every PR goes to Iris **and** Aegis, then Quinn.

## Blockers / waiting on the human
- **T1–T5 merges** are deferred by the product owner; PRs will sit review-complete until they merge.
- **This docs PR (#8)** still needs merging so ADR-0003 is on `main`; builders currently read it off the `docs/adr-0003-wave-plan` branch.
- **`@hono/node-server` 1.19.19 moderate advisory** (GHSA-rmxm-3fg6-px4f), pre-existing from the seed. A bump is a dependency change, so it is the product owner's call. Supervisor recommendation: separate ticket, decide at release, do not block wave 2.

## Known gaps, deliberately accepted
- **No end-to-end proof of the guest journey** while #7 is deferred (D-006). #3, #4 and #5 each test guest access through a *fake* resolver, so all three can pass without the three composing.
- The brief's end-to-end acceptance scenario (automated E2E **and** a recorded walkthrough) is therefore **not yet satisfied**. The project is not complete until it is.

## Next actions (supervisor)
1. As each wave-2 PR opens: route to Iris, and to Aegis (required for all five). Max 3 rounds; fixes go back to the same builder.
2. Quinn QA on each PR once review and security pass.
3. Report all five PRs with their verdicts to the product owner; hold merges.
4. When the owner is ready to merge: order is unconstrained (no shared paths), then dispatch #7.

## Usage note
Agent runs dispatched this session: 1 × solution-architect (ADR-0003), 6 × builder (#1 plus one resume for round 2, and #2–#6), 2 × reviewer (#1 rounds 1–2), 2 × security-reviewer (#1 rounds 1–2), 1 × QA (#1). One builder run was stopped mid-flight (an unnecessary round 3 on #1) to avoid resetting passing verdicts.
