# Brief: Review pins

**From:** Product owner · **Date:** 2026-11-24

Architecture studios send design drawings to clients for review. Today feedback arrives as vague emails ("the wall near the kitchen?"). We want clients to **drop a pin exactly where they mean, write a comment, and formally approve the design**, with a trustworthy record of who decided what, on which version.

## Scope for this slice (five capabilities)
1. **Workspace members and roles:** owners can add members; members see only their own workspace's work.
2. **Guest review links:** a studio member creates a secure link for a client who has no account; links expire and can be revoked.
3. **Pinned comments:** comments are pinned to an exact point on a specific design version, through an API and a review page where you click the drawing to drop a pin.
4. **Approval decisions:** a reviewer approves or requests changes on a submission. The decision is final and becomes part of the record.
5. **New versions:** the studio uploads a new version of a design; earlier versions and their comments stay exactly as they were.

## Must hold
- One studio must never see another studio's data.
- Approvals and the history around them can't be edited or deleted afterwards.
- Works on a phone.

## Open questions for the team
How tenant isolation is enforced everywhere, and exactly what "can't be changed" means for comments, approvals and versions, are **not decided yet**.
