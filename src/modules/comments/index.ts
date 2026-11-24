// Pinned comments (ADR-0003 §C, §D). Comments are append-only and version-scoped: every
// field is readonly, the collection is pushed to and never spliced/indexed/popped/sorted in
// place, and this module exports no mutator — only `register` and the read-only `commentsOf`
// accessor used by the GET route and by tests.
import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { requireSubmissionAccess } from '../../core/access.js';
import type { Principal } from '../../core/access.js';
import { badRequest, notFound } from '../../core/http.js';
import { findAssetVersion, findSubmission } from '../../core/store.js';

/** Who wrote the comment. Mirrors `Principal` but never carries a token (ADR-0003 §B). */
export type CommentAuthor =
  | { readonly kind: 'user'; readonly userId: string; readonly label: string }
  | { readonly kind: 'guest'; readonly linkId: string; readonly label: string };

/** A pin, fractions (0-1) of the drawing image's own rendered box (ADR-0003 §D). */
export interface Pin {
  readonly x: number;
  readonly y: number;
}

export interface Comment {
  readonly id: string;
  readonly versionId: string;
  readonly body: string;
  readonly pin: Pin;
  readonly author: CommentAuthor;
  readonly createdAt: string;
}

// Module-local, append-only. No exported mutator reaches this array from outside the file.
const comments: Comment[] = [];

// Comments are permanent and append-only (invariant 2) in an in-memory, unbounded-lifetime
// collection, so an unbounded body is a standing resource-exhaustion risk rather than a
// one-off bad request. 10,000 characters comfortably covers any real review comment.
const MAX_BODY_LENGTH = 10_000;

/** Round to 4 decimal places — well under a pixel, keeps assertions free of float noise. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function isUnitFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validatePin(value: unknown): Pin {
  if (value === null || typeof value !== 'object') {
    throw badRequest('pin.x and pin.y must be numbers between 0 and 1');
  }
  const { x, y } = value as Record<string, unknown>;
  if (!isUnitFraction(x) || !isUnitFraction(y)) {
    throw badRequest('pin.x and pin.y must be numbers between 0 and 1');
  }
  return { x: round4(x), y: round4(y) };
}

function authorOf(principal: Principal): CommentAuthor {
  return principal.kind === 'user'
    ? { kind: 'user', userId: principal.userId, label: principal.label }
    : { kind: 'guest', linkId: principal.linkId, label: principal.label };
}

/** Read-only accessor: this version's comments only. Never a filter on a client-supplied id. */
export function commentsOf(versionId: string): ReadonlyArray<Comment> {
  return comments.filter((comment) => comment.versionId === versionId);
}

/** Loads the version from the path id, then walks up to its owning submission (ADR-0003 §A
 * steps 1-3). Both misses answer the same `notFound()` as a denied tenancy check would. */
function loadVersionAndSubmission(versionId: string) {
  const version = findAssetVersion(versionId);
  if (!version) throw notFound();
  const submission = findSubmission(version.submissionId);
  if (!submission) throw notFound();
  return { version, submission };
}

export function register(app: Hono): void {
  app.get('/api/versions/:versionId/comments', (c) => {
    const { version, submission } = loadVersionAndSubmission(c.req.param('versionId'));
    requireSubmissionAccess(c, submission, 'view');
    return c.json(commentsOf(version.id));
  });

  app.post('/api/versions/:versionId/comments', async (c) => {
    const { version, submission } = loadVersionAndSubmission(c.req.param('versionId'));
    const principal = requireSubmissionAccess(c, submission, 'comment');

    // Step 5: only now parse and validate the body.
    const raw = await c.req.json().catch(() => undefined);
    if (raw === undefined || raw === null || typeof raw !== 'object') {
      throw badRequest('A JSON body is required');
    }
    const payload = raw as Record<string, unknown>;

    // ADR-0003 §A step 1: a body field that duplicates what the path already determines is
    // rejected, never silently ignored.
    if ('versionId' in payload || 'submissionId' in payload) {
      throw badRequest('versionId and submissionId are determined by the path and must not be sent in the body');
    }

    const body = payload.body;
    if (typeof body !== 'string' || body.trim().length === 0) {
      throw badRequest('body is required');
    }
    if (body.length > MAX_BODY_LENGTH) {
      throw badRequest(`body must be at most ${MAX_BODY_LENGTH} characters`);
    }

    const pin = validatePin(payload.pin);

    const comment: Comment = {
      id: randomUUID(),
      versionId: version.id,
      body,
      pin,
      author: authorOf(principal),
      createdAt: new Date().toISOString(),
    };
    comments.push(comment);
    return c.json(comment, 201);
  });
}
