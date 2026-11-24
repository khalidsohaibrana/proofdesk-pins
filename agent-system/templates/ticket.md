# Ticket template

Copy into a GitHub Issue. The supervisor will not mark a ticket **Ready (G1)** while any section is empty.

```markdown
## User outcome
<Who can do what, and why it matters, in one or two sentences.>

## Product references
- Product doc §… / SRS FR-…
- Governing ADRs: ADR-…

## Scope
**In:** …
**Out (explicitly):** …

## Flow trace
User action → UI → API/server action → authn/authz → domain → DB/storage → events/notifications → resulting UI

## Inspect first
Files/modules the builder must read before changing anything.

## Contracts & permissions to preserve
API shapes, entity fields, roles allowed / denied.

## Invariants touched (see docs/delivery/project-profile.md)
- #… → proven by test: …

## Acceptance criteria
- [ ] …

## Required tests
- Unit: …
- Integration (incl. denied-access paths): …
- E2E / visual: …

## Dependencies
Blocked by: #… | Blocks: #…

## Allowed new packages
None | `name@version` (license, reason)

## Sensitive change flags
[ ] migration [ ] auth/access control [ ] tenancy [ ] file handling [ ] CI [ ] lockfile [ ] infra/env

## Completion evidence
Screenshots / video of …, test output, QA summary.

## Lane / owner
frontend | backend | full-stack | infra — builder: …
```
