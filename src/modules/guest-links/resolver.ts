// The GuestResolver implementation (ADR-0003 §B). Installed into src/core/access.ts by
// this module's register(app) via setGuestResolver. Must return `undefined` —
// indistinguishably — for an unknown, malformed, expired or revoked token, and must never
// return a grant whose actions include 'manage' (AC-S2).
import { timingSafeEqual } from 'node:crypto';
import type { Action, GuestGrant, GuestResolver } from '../../core/access.js';
import { allGuestLinks } from './store.js';
import { hashToken } from './token.js';

/**
 * Fixed literal action set for every guest grant (AC-S2 / ADR-0003 §B). This is the only
 * place a GuestGrant's `actions` field is ever constructed, and it is a hardcoded literal —
 * never derived from stored data, request input or anything else that could introduce
 * 'manage'. A guest link can never grant more than this.
 */
const GUEST_ACTIONS: ReadonlyArray<Action> = ['view', 'comment', 'decide'];

function hashesMatch(storedHex: string, presentedHex: string): boolean {
  const stored = Buffer.from(storedHex, 'hex');
  const presented = Buffer.from(presentedHex, 'hex');
  // timingSafeEqual throws on mismatched lengths rather than returning false, so the
  // length check must come first; both are sha256 hex digests so they're equal length
  // in the normal case, but a corrupted/garbage stored hash must never throw here.
  return stored.length === presented.length && timingSafeEqual(stored, presented);
}

/**
 * Resolves a raw guest token to a grant. AC-S1: an empty or whitespace-only token must
 * resolve to `undefined` before any hash comparison — the seam hands this resolver the raw
 * header value whenever `x-guest-token` was present at all, including "" and "   ", and
 * there must be no code path (startsWith/includes/substring or otherwise) that lets a blank
 * token match a real one.
 */
export const resolveGuestToken: GuestResolver = (token) => {
  if (token.trim().length === 0) return undefined;

  const presentedHash = hashToken(token);

  for (const link of allGuestLinks()) {
    if (!hashesMatch(link.tokenHash, presentedHash)) continue;

    // Matched by hash. Revocation and expiry are checked by field only — never by
    // blanking tokenHash, which would turn a blank presented token into a false match.
    if (link.revokedAt !== null) return undefined;
    if (Date.parse(link.expiresAt) <= Date.now()) return undefined;

    const grant: GuestGrant = {
      kind: 'guest',
      linkId: link.id,
      workspaceId: link.workspaceId,
      submissionId: link.submissionId,
      actions: GUEST_ACTIONS,
      label: link.label,
    };
    return grant;
  }

  return undefined;
};
