# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Product owner (human)

## Context
This codebase is built by a supervised team of AI agents working in parallel. Each agent starts with no memory of earlier sessions. Without a written record, agents re-decide settled questions, contradict each other across pull requests, and reviewers have nothing objective to check against.

## Decision
We record every significant architecture decision as an Architecture Decision Record (ADR) in `docs/adr/`, following Michael Nygard's format (Context, Decision, Consequences), as described by Martin Fowler: https://martinfowler.com/bliki/ArchitectureDecisionRecord.html

- ADRs are numbered and never deleted. A changed decision gets a new ADR that supersedes the old one.
- Agents may write ADRs with status **Proposed**. Only the human product owner may mark an ADR **Accepted**.
- Every ticket names the ADRs that govern it. Builders follow them, and reviewers reject PRs that violate an Accepted ADR.
- Work that depends on an undecided question waits for its ADR to be accepted.

## Consequences
- Decisions are explicit, reviewable and traceable from ticket to PR to review.
- A small amount of writing up front; much less rework and fewer contradictory PRs.
