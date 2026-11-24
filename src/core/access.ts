// The guest access seam (ADR-0003 §B). Verification and authorization of guest access lives
// here; issuing, expiring and revoking guest links belongs to the guest-links module, which
// registers its resolver into this file at `register()` time. Core never imports a module.
import type { Context } from 'hono';
import type { Role, Submission } from './types.js';
import { requireMember } from './auth.js';
import { notFound } from './http.js';

/** The header a guest presents. Guest tokens are never read from a query string, path or body. */
export const GUEST_HEADER = 'x-guest-token';

/** What a caller may do on one submission. Guests never hold 'manage'. */
export type Action = 'view' | 'comment' | 'decide' | 'manage';

/** A resolved, least-privilege capability: one workspace, one submission, a fixed action set. */
export interface GuestGrant {
  readonly kind: 'guest';
  /** Audit handle for the link. Safe to log and to store on records. Never the token. */
  readonly linkId: string;
  readonly workspaceId: string;
  readonly submissionId: string;
  readonly actions: ReadonlyArray<Action>;
  /** Display name for the record, e.g. 'Guest reviewer' or the client name the member typed. */
  readonly label: string;
}

/**
 * Resolves a raw guest token to a grant.
 * MUST return `undefined` — indistinguishably — when the token is unknown, malformed,
 * expired or revoked. Callers must never be able to tell these cases apart.
 */
export type GuestResolver = (token: string) => GuestGrant | undefined;

const denyAll: GuestResolver = () => undefined;

let currentResolver: GuestResolver = denyAll;

/**
 * Installs the resolver. In production the guest-links module calls this once from its
 * `register(app)`. Last call wins; the returned function restores the previous resolver,
 * which is how tests install a fake grant. Fails closed: until something is installed,
 * the default resolver returns `undefined` for every token.
 */
export function setGuestResolver(resolve: GuestResolver): () => void {
  const previous = currentResolver;
  currentResolver = resolve;
  return () => {
    currentResolver = previous;
  };
}

/** The grant for this request, or `undefined`. Reads `x-guest-token` and nothing else. */
export function guestGrantOf(c: Context): GuestGrant | undefined {
  const token = c.req.header(GUEST_HEADER);
  if (!token) return undefined;
  return currentResolver(token);
}

/** Who was allowed. Records that must name their author store these fields, never the token. */
export type Principal =
  | { readonly kind: 'user'; readonly userId: string; readonly role: Role; readonly label: string }
  | { readonly kind: 'guest'; readonly linkId: string; readonly label: string };

/**
 * The single authorization call every submission-scoped route makes, at step 4 of the
 * mandatory route shape, with a `submission` derived from the record being touched.
 *
 * Semantics, in order:
 *  1. If the `x-guest-token` header is present, the guest path is taken and there is NO
 *     fallback to member authorization — a present-but-bad token is a denial, never an
 *     opportunity to be re-judged as a member. (Prevents a confused-deputy escalation.)
 *     Denies with `notFound()` when: the resolver returns undefined; or
 *     grant.submissionId !== submission.id; or grant.workspaceId !== submission.workspaceId;
 *     or !grant.actions.includes(action). All four are the same 404 'Not found'.
 *  2. Otherwise delegates to `requireMember(c, submission.workspaceId)`: `401` when no
 *     `x-user-id`, `404` when the user is not a member of that workspace. Every member of
 *     the owning workspace holds every action, including 'manage'.
 *
 * Throws (never returns) on denial. Returns the `Principal` on success.
 */
export function requireSubmissionAccess(c: Context, submission: Submission, action: Action): Principal {
  const token = c.req.header(GUEST_HEADER);
  if (token) {
    const grant = currentResolver(token);
    if (
      !grant ||
      grant.submissionId !== submission.id ||
      grant.workspaceId !== submission.workspaceId ||
      !grant.actions.includes(action)
    ) {
      throw notFound();
    }
    return { kind: 'guest', linkId: grant.linkId, label: grant.label };
  }

  const role = requireMember(c, submission.workspaceId);
  // requireMember throws on denial (401 with no x-user-id, 404 for a non-member), so the
  // header is guaranteed to be present here.
  const userId = c.req.header('x-user-id') as string;
  return { kind: 'user', userId, role, label: userId };
}
