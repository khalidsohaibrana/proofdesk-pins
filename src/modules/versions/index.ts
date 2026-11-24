// Capability 5: new asset versions (ADR-0003 §C "Asset version", §E ownership map).
// Append-only. No edit, no delete, no "latest version" pointer — ordering and selection
// are always derived via `versionsOf`. See docs/adr/0003-access-and-immutability.md.
import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { requireSubmissionAccess } from '../../core/access.js';
import { badRequest, notFound } from '../../core/http.js';
import { assetVersions, findSubmission, versionsOf } from '../../core/store.js';
import type { AssetVersion } from '../../core/types.js';

const MAX_IMAGE_URL_LENGTH = 200;

/**
 * `imageUrl` must be exactly one path segment directly under `/assets/`: ASCII letters,
 * digits, dot, underscore and hyphen only — no further `/`, no `%`, no control characters,
 * no Unicode at all. Deliberately stricter than "starts with /assets/ and has no '..'":
 * that earlier check (security review round 2, Aegis MEDIUM) still accepted percent-encoded
 * traversal (`/assets/%2e%2e%2fetc%2fpasswd`), double-encoded traversal
 * (`/assets/%252e%252e%252f...`), overlong-UTF-8 traversal (`/assets/%c0%ae%c0%ae/...`),
 * double slashes (`/assets//evil`), embedded control characters (LF/CRLF/NUL) and
 * Unicode dot/slash lookalikes — none exploitable against today's static file handler, but
 * the value is written into an immutable `AssetVersion` record and capability 3 renders it
 * as an `<img src>` on a guest-facing page, so a quote- or control-character-bearing value
 * becomes someone else's problem permanently. Applied to the *decoded* value (see
 * `normalizeImageUrl`), so an encoded or double-encoded bypass can't hide from the
 * allowlist by never being decoded.
 */
const ASSET_PATH_PATTERN = /^\/assets\/[A-Za-z0-9._-]+$/;

/**
 * Decodes `value` exactly once and validates the result against `ASSET_PATH_PATTERN`.
 * Returns the canonical decoded path on success (what gets stored — never the raw,
 * possibly percent-encoded, input) or `undefined` on any failure, including malformed or
 * invalid percent-encoding (overlong/invalid UTF-8 byte sequences throw `URIError`, which
 * is treated as a rejection, not a crash). A single decode pass is sufficient: the
 * allowlist excludes `%` entirely, so a value that is still percent-encoded after one
 * decode (the double-encoding case) fails the pattern on that '%' alone.
 */
function normalizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (value.length > MAX_IMAGE_URL_LENGTH) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  return ASSET_PATH_PATTERN.test(decoded) ? decoded : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function register(app: Hono): void {
  app.post('/api/submissions/:id/versions', async (c) => {
    // Step 1-2 (ADR-0003 §A): read the id from the path only, load the leaf/owning record.
    const submission = findSubmission(c.req.param('id'));
    if (!submission) throw notFound();

    // Step 3 is implicit: `submission` is itself the tenant-owning record.
    // Step 4: authorize before parsing the body. 'manage' excludes every guest grant.
    requireSubmissionAccess(c, submission, 'manage');

    // Step 5: only now parse and validate the body.
    const body = (await c.req.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') throw badRequest('A request body is required');
    if ('submissionId' in body) {
      throw badRequest('submissionId is determined by the path and must not be sent in the body');
    }

    const { title } = body;
    if (!isNonEmptyString(title)) throw badRequest('title is required');
    const imageUrl = normalizeImageUrl(body.imageUrl);
    if (imageUrl === undefined) {
      throw badRequest('imageUrl must be a single file name path under /assets/ with no traversal or external origin');
    }

    // Step 6: act. Numbering is the max existing number for this submission, plus one —
    // never a count, so a gap in numbering cannot produce a duplicate.
    const existing = versionsOf(submission.id);
    const number = existing.reduce((max, version) => Math.max(max, version.number), 0) + 1;

    const version: AssetVersion = {
      id: `v-${randomUUID()}`,
      submissionId: submission.id,
      number,
      title,
      imageUrl,
      createdAt: new Date().toISOString(),
    };
    // Append only — never splice, index-assign, pop or sort in place. No existing
    // element is ever read-modified-written.
    assetVersions.push(version);

    return c.json(version, 201);
  });
}
