# Project profile: proofdesk-pins

## Sources of truth
- Brief: `product/brief.md`
- Decisions: `docs/adr/` (Accepted ADRs are binding)
- Delivery rules: `docs/delivery/operating-defaults.md`, status in `docs/delivery/status.md`

## Invariants (hard constraints)
1. **Tenant isolation:** every workspace-owned record is reachable only by members of that workspace (or by a valid guest link scoped to it). Enforced server-side.
2. **Immutable history:** approval decisions, the comments on a version, and asset versions are never edited or deleted after creation.
3. **Version-scoped feedback:** a comment belongs to one asset version; a new version never moves or hides earlier comments.
4. **Pins are resolution-independent:** pin positions are stored as fractions (0–1) of the drawing, so they land in the same spot at any size.

## Gate evidence specific to this project
- Any authorization change ships with an **allowed-path test and a denied-path test**.
- Any UI change ships with an E2E test; the **recorded E2E video** is the feature-run evidence.
- Security review is required for PRs touching members/roles, guest links or authorization.

## Escalate to the human
Accepting ADRs, merging to `main`, any change to the invariants, new runtime dependencies.
