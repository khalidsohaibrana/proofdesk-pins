// Module-local GuestLink collection (ADR-0003 §B). Owned exclusively by this module: no
// other module imports this file, and this module never imports another module's store.
// Append-only + immutable replace, same discipline as src/core/store.ts.

export interface GuestLink {
  readonly id: string;
  readonly workspaceId: string;
  readonly submissionId: string;
  /** sha256(token) hex digest. The plaintext token is never stored anywhere. */
  readonly tokenHash: string;
  readonly label: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** One-way: once set, never unset. Revocation replaces the array element, never this field in place. */
  readonly revokedAt: string | null;
}

let guestLinks: ReadonlyArray<GuestLink> = [];

// O(1) resolver lookup by tokenHash (ADR-0003 §B: "looks the link up by hash... hash
// lookup, not a scan over secrets"). tokenHash never changes after creation — not even on
// revocation — so this map's keys are stable for a link's whole lifetime; only the mapped
// value is ever replaced, alongside the array, by the same two mutation points below.
const byTokenHash = new Map<string, GuestLink>();

export function addGuestLink(link: GuestLink): void {
  guestLinks = [...guestLinks, link];
  byTokenHash.set(link.tokenHash, link);
}

export function findGuestLinkById(id: string): GuestLink | undefined {
  return guestLinks.find((link) => link.id === id);
}

/** O(1) lookup by tokenHash for the resolver. Returns the current record (which may be
 * revoked or expired) — callers decide what that means, this is lookup only. */
export function findGuestLinkByTokenHash(tokenHash: string): GuestLink | undefined {
  return byTokenHash.get(tokenHash);
}

export function listGuestLinksForSubmission(submissionId: string): ReadonlyArray<GuestLink> {
  return guestLinks.filter((link) => link.submissionId === submissionId);
}

/** Read access for tests and introspection only — never mutated outside this file. */
export function allGuestLinks(): ReadonlyArray<GuestLink> {
  return guestLinks;
}

/**
 * Revokes a link by id. Idempotent: revoking an already-revoked link returns the existing
 * record unchanged (revokedAt is one-way and is never unset, never blanked, never reused as
 * a "deny" sentinel — denial is entirely driven by `revokedAt !== null`). Replaces the array
 * element immutably; never mutates a field on the existing object. Updates the hash index's
 * value for the same key, never its key (tokenHash is immutable per link).
 */
export function revokeGuestLink(id: string): GuestLink | undefined {
  const existing = guestLinks.find((link) => link.id === id);
  if (!existing) return undefined;
  if (existing.revokedAt !== null) return existing;
  const revoked: GuestLink = { ...existing, revokedAt: new Date().toISOString() };
  guestLinks = guestLinks.map((link) => (link.id === id ? revoked : link));
  byTokenHash.set(revoked.tokenHash, revoked);
  return revoked;
}
