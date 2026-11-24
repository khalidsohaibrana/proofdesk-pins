// Health check and read-only core endpoints that every feature builds on.
import type { Hono } from 'hono';
import { requireMember } from '../../core/auth.js';
import { notFound } from '../../core/http.js';
import { assetVersions, findSubmission } from '../../core/store.js';

export function register(app: Hono): void {
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/api/submissions/:id', (c) => {
    const submission = findSubmission(c.req.param('id'));
    if (!submission) throw notFound();
    requireMember(c, submission.workspaceId);
    const versions = assetVersions.filter((version) => version.submissionId === submission.id);
    return c.json({ submission, versions });
  });
}
