// Approval decisions (ADR-0003 §C, scope item 4). Finality is per asset version: exactly
// one decision may ever exist for a given `versionId`. The decisions collection below is
// module-local, appended to with `push` only, and never exported — this file exports only
// `register`, so no other module can reach in and mutate a decision after it is recorded.
import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { requireSubmissionAccess } from '../../core/access.js';
import { badRequest, conflict, notFound } from '../../core/http.js';
import { findAssetVersion, findSubmission } from '../../core/store.js';
import type { Decision, DecisionOutcome } from './types.js';

// Append-only: every write below is `decisions.push(...)`. Never splice, index-assign,
// pop or sort in place, and this array is never exported.
const decisions: Decision[] = [];

const findDecisionForVersion = (versionId: string): Decision | undefined =>
  decisions.find((decision) => decision.versionId === versionId);

function parseDecisionBody(raw: unknown): { outcome: DecisionOutcome; note: string | null } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw badRequest('Request body must be a JSON object');
  }
  const body = raw as Record<string, unknown>;

  // The route shape (ADR-0003 §A step 1): versionId/submissionId are read from the URL
  // path only. A body that also carries one is rejected rather than silently ignored.
  if ('versionId' in body || 'submissionId' in body) {
    throw badRequest('versionId and submissionId are determined by the URL path, not the body');
  }

  const outcome = body.outcome;
  if (outcome !== 'approved' && outcome !== 'changes_requested') {
    throw badRequest("outcome must be 'approved' or 'changes_requested'");
  }

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') throw badRequest('note must be a string');
    note = body.note;
  }

  return { outcome, note };
}

export function register(app: Hono): void {
  app.post('/api/versions/:versionId/decisions', async (c) => {
    // Steps 2–3: load the leaf record, then walk up to the owning Submission (the tenant).
    const version = findAssetVersion(c.req.param('versionId'));
    if (!version) throw notFound();
    const submission = findSubmission(version.submissionId);
    if (!submission) throw notFound();

    // Step 4: authorize before parsing the body.
    const principal = requireSubmissionAccess(c, submission, 'decide');

    // Step 5: now parse and validate the body.
    const raw = await c.req.json().catch(() => undefined);
    const { outcome, note } = parseDecisionBody(raw);

    // Finality: exactly one decision per versionId, regardless of outcome or principal.
    if (findDecisionForVersion(version.id)) {
      throw conflict('This version already has a final decision');
    }

    const decision: Decision = {
      id: randomUUID(),
      versionId: version.id,
      submissionId: submission.id,
      outcome,
      note,
      decidedByKind: principal.kind,
      decidedById: principal.kind === 'user' ? principal.userId : principal.linkId,
      decidedByLabel: principal.label,
      decidedAt: new Date().toISOString(),
    };
    decisions.push(decision);
    return c.json(decision, 201);
  });

  app.get('/api/submissions/:id/decisions', (c) => {
    const submission = findSubmission(c.req.param('id'));
    if (!submission) throw notFound();
    requireSubmissionAccess(c, submission, 'view');

    // Collection filter is on the already-authorized submission.id derived from the path
    // (ADR-0003 §A collections rule) — never a client-supplied workspace or submission id.
    const result = decisions.filter((decision) => decision.submissionId === submission.id);
    return c.json(result);
  });

  // No PATCH/PUT/DELETE route exists for a decision, on either path shape. Hono answers
  // 404 for any unregistered route, which is exactly the assertion the tests make.
}
