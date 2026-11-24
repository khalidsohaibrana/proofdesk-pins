# Delivery status (session handoff)

The supervisor reads this first and updates it at the end of every session.

**Last updated:** 2026-11-24, supervisor session 1 (brief → accepted ADR → backlog → wave 1 dispatched)

## Current gate
**G1 Ready for #1 only.** ADR-0001, ADR-0002, ADR-0003 all Accepted. Backlog filed as issues #1–#7.
Wave 1 (#1) is in progress. #2–#6 are **Ready but deliberately not started** — they are blocked until #1 merges.

## Decisions this session
- **D-003:** ADR-0003 (access, guest links, immutability, pin coordinates) Accepted by the product owner ("approved"), with all five of its defaults: per-version decision finality; guests may approve (`view`/`comment`/`decide`, never `manage`); link lifetime 7d default / 30d max; guests named by member-supplied `label` else `'Guest reviewer'`; cross-tenant requests answer `404`, not `403`.
- **D-004:** three waves, not one parallel batch (ADR-0003 §F). Five-way parallelism from a standing start would have put three builders in `src/core/auth.ts` simultaneously, because capabilities 3 and 4 both need guest access while capability 2 owns guest links.

## Wave plan
| Wave | Tickets | Gate to leave the wave |
|---|---|---|
| 1 | **#1** T0 core access seam + shell | merged to `main` by the human |
| 2 | **#2–#6** T1–T5, five builders in parallel, zero shared paths | each merged after review + security + QA |
| 3 | **#7** T6 guest journey E2E | needs #3, #4, #5 merged |

## Tickets in flight
| # | Ticket | Owner | Branch | PR | State |
|---|---|---|---|---|---|
| 1 | T0 access seam + shell | wave-1 builder | `agent/1-access-seam-and-shell` | — | builder dispatched |

## Blockers / waiting on the human
- **#1 must be merged to `main` before wave 2 can start.** This is the only thing standing between here and five parallel builders. Merge requires CI green + `REVIEW: APPROVE` + `SECURITY: PASS` + `QA: PASS`.
- This docs PR (`docs/adr-0003-wave-plan`) needs merging too, so ADR-0003 is on `main` where builders read it from the checkout rather than from the branch.

## Next actions (supervisor)
1. Gate #1: Iris review, Aegis security review (mandatory — touches authorization and tenancy), Quinn QA with the recorded feature run. Max 3 review rounds; fixes go back to the same builder.
2. Hand #1 to the human with evidence for the merge.
3. On #1 merged: dispatch five builders in parallel on #2–#6, one worktree and one PR each.
4. On #3, #4, #5 merged: dispatch #7.

## Usage note
Agent runs dispatched this session: 1 × solution-architect (Atlas, ADR-0003), 1 × builder (#1). Reviewer/security/QA runs to follow on #1.

## Done
- Seed app: core domain, demo identity, module discovery, health and submission read endpoints, CI.
- ADR-0003 drafted, reviewed by the supervisor and accepted by the product owner.
- Backlog #1–#7 filed to the ticket template, each with acceptance criteria, required allowed-path and denied-path tests, governing ADRs, sensitive-change flags and its branch name.
