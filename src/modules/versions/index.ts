// Capability 5: new asset versions (ADR-0003 §C "Asset version", §E ownership map).
// Append-only. No edit, no delete, no "latest version" pointer — ordering and selection
// are always derived via `versionsOf`. See docs/adr/0003-access-and-immutability.md.
import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { requireSubmissionAccess } from '../../core/access.js';
import { badRequest, notFound } from '../../core/http.js';
import { assetVersions, findSubmission, versionsOf } from '../../core/store.js';
import type { AssetVersion } from '../../core/types.js';

const ASSETS_PREFIX = '/assets/';

/**
 * `imageUrl` must be a path under `/assets/`: no absolute URL, no protocol-relative URL,
 * no `..` traversal, nothing outside the prefix. (The file-handling flag on this ticket.)
 */
function isValidImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (!value.startsWith(ASSETS_PREFIX)) return false;
  if (value.includes('..')) return false;
  if (value.includes('\\')) return false;
  return true;
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

    const { title, imageUrl } = body;
    if (!isNonEmptyString(title)) throw badRequest('title is required');
    if (!isValidImageUrl(imageUrl)) {
      throw badRequest('imageUrl must be a path under /assets/ with no traversal or external origin');
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
