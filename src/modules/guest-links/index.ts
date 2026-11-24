// Guest review links (ADR-0003 §B, ticket #3): issuing, listing and revoking guest links.
// Owns its own GuestLink collection and installs the resolver that lets #4/#5 recognize a
// guest via core's requireSubmissionAccess. Never imports another module.
import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { requireSubmissionAccess, setGuestResolver } from '../../core/access.js';
import { badRequest, notFound } from '../../core/http.js';
import { findSubmission } from '../../core/store.js';
import { resolveGuestToken } from './resolver.js';
import { addGuestLink, findGuestLinkById, listGuestLinksForSubmission, revokeGuestLink } from './store.js';
import type { GuestLink } from './store.js';
import { generateToken, hashToken } from './token.js';

const DEFAULT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_LABEL = 'Guest reviewer';

interface CreateLinkBody {
  readonly label?: unknown;
  readonly expiresAt?: unknown;
  readonly workspaceId?: unknown;
  readonly submissionId?: unknown;
}

/** The public view of a link: everything except `tokenHash`. Never returned with the hash,
 * and the plaintext token is returned only once, by the creation route, as a sibling field. */
type PublicGuestLink = Omit<GuestLink, 'tokenHash'>;

function toPublicLink(link: GuestLink): PublicGuestLink {
  const { tokenHash, ...publicFields } = link;
  void tokenHash;
  return publicFields;
}

function resolveExpiresAt(raw: unknown, now: number): string {
  if (raw === undefined) return new Date(now + DEFAULT_LIFETIME_MS).toISOString();
  if (typeof raw !== 'string') throw badRequest('expiresAt must be an ISO date string');
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) throw badRequest('expiresAt must be a valid date');
  if (parsed <= now) throw badRequest('expiresAt must be in the future');
  if (parsed > now + MAX_LIFETIME_MS) throw badRequest('expiresAt may not exceed 30 days from now');
  return new Date(parsed).toISOString();
}

function resolveLabel(raw: unknown): string {
  if (raw === undefined) return DEFAULT_LABEL;
  if (typeof raw !== 'string') throw badRequest('label must be a string');
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_LABEL;
}

export function register(app: Hono): void {
  // Installed once at app composition time (src/app.ts discovers and calls register() for
  // every module). This is the only call to setGuestResolver in the whole codebase.
  setGuestResolver(resolveGuestToken);

  app.post('/api/submissions/:id/guest-links', async (c) => {
    const submission = findSubmission(c.req.param('id'));
    if (!submission) throw notFound();
    // Issuing a link is a workspace-management action: members only, never a guest, and
    // never any token's grant (guest grants never include 'manage' — AC-S2).
    const principal = requireSubmissionAccess(c, submission, 'manage');

    const body = (await c.req.json().catch(() => ({}))) as CreateLinkBody;
    if (body.workspaceId !== undefined || body.submissionId !== undefined) {
      // ADR-0003 §A step 1: identifiers the path already determines are rejected, not
      // silently ignored, if the body also carries them.
      throw badRequest('workspaceId and submissionId are determined by the path, not the body');
    }

    const now = Date.now();
    const expiresAt = resolveExpiresAt(body.expiresAt, now);
    const label = resolveLabel(body.label);

    const token = generateToken();
    const link: GuestLink = {
      id: `gl-${randomUUID()}`,
      workspaceId: submission.workspaceId,
      submissionId: submission.id,
      tokenHash: hashToken(token),
      label,
      createdBy: principal.kind === 'user' ? principal.userId : principal.linkId,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      revokedAt: null,
    };
    addGuestLink(link);

    // The plaintext token appears here, in this response, exactly once. It is never
    // stored (only tokenHash is) and never returned again by any other route.
    return c.json({ token, link: toPublicLink(link) }, 201);
  });

  app.get('/api/submissions/:id/guest-links', (c) => {
    const submission = findSubmission(c.req.param('id'));
    if (!submission) throw notFound();
    requireSubmissionAccess(c, submission, 'manage');
    const links = listGuestLinksForSubmission(submission.id).map(toPublicLink);
    return c.json({ links });
  });

  app.post('/api/guest-links/:id/revoke', (c) => {
    const link = findGuestLinkById(c.req.param('id'));
    if (!link) throw notFound();
    const submission = findSubmission(link.submissionId);
    if (!submission) throw notFound();
    requireSubmissionAccess(c, submission, 'manage');
    const revoked = revokeGuestLink(link.id) as GuestLink;
    return c.json({ link: toPublicLink(revoked) }, 200);
  });
}
