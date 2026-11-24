# proofdesk-pins: rules for every agent in this repo

A small, real slice of ProofDesk, built by a supervised team of AI agents (`agent-system/`).

## Read first
- Brief: `product/brief.md`
- Project profile and invariants: `docs/delivery/project-profile.md`
- Decisions: `docs/adr/` (Accepted ADRs are binding)
- Delivery rules: `docs/delivery/operating-defaults.md`; handoff: `docs/delivery/status.md`

## Roles
- **Human:** product owner. Accepts ADRs and merges to `main`.
- **Supervisor:** plans, files tickets, assigns and unblocks. **Never writes application code.**
- **Builders:** one ticket, one worktree/branch, one PR. Stay inside the ticket's module folder.
- **Reviewer / security reviewer:** separate sessions, never edit code. Max 3 review rounds.
- **QA:** runs the tests and checks the recorded E2E feature run before `QA: PASS`.

## Hard rules
- Never read, print or commit `.env*` files or secrets.
- No new dependency unless the ticket names it.
- Don't add roles, entities or features that aren't in the brief.
- Authorization is enforced server-side; every such change ships with an allowed-path and a denied-path test.
- Never claim something passed without the command output.
- Branch names follow `docs/delivery/operating-defaults.md` (`agent/<issue#>-<slug>`); this overrides the builder's generic default.
- Commands: `npm run check` (typecheck + unit tests), `npm run e2e` (recorded Playwright run). Install deps in a fresh worktree with `npm ci`.
