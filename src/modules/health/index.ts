// Health check and read-only core endpoints that every feature builds on.
import type { Hono } from 'hono';
import { requireSubmissionAccess } from '../../core/access.js';
import { notFound } from '../../core/http.js';
import { findSubmission, versionsOf } from '../../core/store.js';

export function register(app: Hono): void {
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/api/submissions/:id', (c) => {
    const submission = findSubmission(c.req.param('id'));
    if (!submission) throw notFound();
    requireSubmissionAccess(c, submission, 'view');
    const versions = versionsOf(submission.id);
    return c.json({ submission, versions });
  });
}
