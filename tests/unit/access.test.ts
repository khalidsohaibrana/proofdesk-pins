import { Hono } from 'hono';
import type { Context } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { call } from '../helpers.js';
import {
  GUEST_HEADER,
  guestGrantOf,
  requireSubmissionAccess,
  setGuestResolver,
} from '../../src/core/access.js';
import type { Action, GuestGrant, Principal } from '../../src/core/access.js';
import { findSubmission } from '../../src/core/store.js';
import type { Submission } from '../../src/core/types.js';

const groundFloor = findSubmission('s-ground-floor') as Submission;
const millFacade = findSubmission('s-mill-facade') as Submission;

const groundFloorGrant: GuestGrant = {
  kind: 'guest',
  linkId: 'gl-test',
  workspaceId: 'w-north',
  submissionId: 's-ground-floor',
  actions: ['view', 'comment', 'decide'],
  label: 'Test client',
};

/** Runs `requireSubmissionAccess` inside a throwaway Hono route so we exercise the real
 * Hono `Context` and its HTTPException-to-Response handling, exactly like a real route. */
async function runAccess(
  headers: Record<string, string>,
  submission: Submission,
  action: Action,
): Promise<{ response: Response; principal?: Principal }> {
  const app = new Hono();
  let principal: Principal | undefined;
  app.get('/t', (c: Context) => {
    principal = requireSubmissionAccess(c, submission, action);
    return c.json({ ok: true });
  });
  const response = await app.request('/t', { headers });
  return { response, principal };
}

async function readHeader(headers: Record<string, string>): Promise<string | undefined> {
  const app = new Hono();
  let seen: string | undefined;
  app.get('/t', (c: Context) => {
    seen = guestGrantOf(c) ? 'grant' : undefined;
    return c.json({ ok: true });
  });
  await app.request('/t', { headers });
  return seen;
}

describe('access: setGuestResolver', () => {
  afterEach(() => {
    // Defensive reset in case a test forgets its own restore.
    setGuestResolver(() => undefined);
  });

  it('fails closed with no resolver installed', async () => {
    const { response } = await runAccess({ [GUEST_HEADER]: 'anything' }, groundFloor, 'view');
    expect(response.status).toBe(404);
  });

  it('installs a resolver and resolves a known token', () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      expect(guestGrantOf({ req: { header: () => 'tok-1' } } as unknown as Context)).toEqual(groundFloorGrant);
    } finally {
      restore();
    }
  });

  it('last call wins, and restore reinstates the previous resolver', () => {
    const restoreFirst = setGuestResolver((token) => (token === 'first' ? groundFloorGrant : undefined));
    const restoreSecond = setGuestResolver((token) => (token === 'second' ? groundFloorGrant : undefined));

    expect(guestGrantOf({ req: { header: () => 'first' } } as unknown as Context)).toBeUndefined();
    expect(guestGrantOf({ req: { header: () => 'second' } } as unknown as Context)).toEqual(groundFloorGrant);

    restoreSecond();
    expect(guestGrantOf({ req: { header: () => 'first' } } as unknown as Context)).toEqual(groundFloorGrant);

    restoreFirst();
    expect(guestGrantOf({ req: { header: () => 'first' } } as unknown as Context)).toBeUndefined();
  });
});

describe('access: guestGrantOf', () => {
  afterEach(() => {
    setGuestResolver(() => undefined);
  });

  it('reads only the x-guest-token header, nothing else', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      const seenWithHeader = await readHeader({ [GUEST_HEADER]: 'tok-1' });
      expect(seenWithHeader).toBe('grant');
      const seenWithoutHeader = await readHeader({});
      expect(seenWithoutHeader).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('ignores a token carried in the query string or the body, never just the header name', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      const app = new Hono();
      let seen: GuestGrant | undefined;
      app.post('/t', async (c: Context) => {
        await c.req.json().catch(() => undefined);
        seen = guestGrantOf(c);
        return c.json({ ok: true });
      });
      const response = await app.request('/t?x-guest-token=tok-1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 'x-guest-token': 'tok-1' }),
      });
      expect(response.status).toBe(200);
      expect(seen).toBeUndefined();
    } finally {
      restore();
    }
  });
});

describe('access: requireSubmissionAccess', () => {
  afterEach(() => {
    setGuestResolver(() => undefined);
  });

  it('returns a user Principal carrying the role for a workspace member', async () => {
    const { response, principal } = await runAccess({ 'x-user-id': 'u-sam' }, groundFloor, 'view');
    expect(response.status).toBe(200);
    expect(principal).toEqual({ kind: 'user', userId: 'u-sam', role: 'member', label: 'u-sam' });
  });

  it('a member holds every action including manage', async () => {
    const { response } = await runAccess({ 'x-user-id': 'u-olivia' }, groundFloor, 'manage');
    expect(response.status).toBe(200);
  });

  it('returns a guest Principal for a valid grant', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      const { response, principal } = await runAccess({ [GUEST_HEADER]: 'tok-1' }, groundFloor, 'view');
      expect(response.status).toBe(200);
      expect(principal).toEqual({ kind: 'guest', linkId: 'gl-test', label: 'Test client' });
    } finally {
      restore();
    }
  });
});

describe('access: integration via GET /api/submissions/:id — allowed paths', () => {
  afterEach(() => {
    setGuestResolver(() => undefined);
  });

  it('a workspace member reads the submission', async () => {
    const res = await call('/api/submissions/s-ground-floor', { as: 'u-sam' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { submission: { id: string }; versions: unknown[] };
    expect(body.submission.id).toBe('s-ground-floor');
    expect(body.versions).toHaveLength(1);
  });

  it('a guest grant scoped to the submission is allowed for "view"', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      const res = await call('/api/submissions/s-ground-floor', { guest: 'tok-1' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { submission: { id: string } };
      expect(body.submission.id).toBe('s-ground-floor');
    } finally {
      restore();
    }
  });
});

describe('access: integration via GET /api/submissions/:id — denied paths', () => {
  afterEach(() => {
    setGuestResolver(() => undefined);
  });

  const notFoundBody = { error: { code: 'not_found', message: 'Not found' } };

  it('a member of another workspace is denied, and nothing changed for the real owner', async () => {
    const denied = await call('/api/submissions/s-ground-floor', { as: 'u-rhea' });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual(notFoundBody);

    const stillWorks = await call('/api/submissions/s-ground-floor', { as: 'u-sam' });
    expect(stillWorks.status).toBe(200);
  });

  it('a nonexistent submission id returns a body identical to the cross-tenant case (anti-enumeration)', async () => {
    const crossTenant = await call('/api/submissions/s-ground-floor', { as: 'u-rhea' });
    const nonexistent = await call('/api/submissions/does-not-exist', { as: 'u-rhea' });
    expect(crossTenant.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    const crossTenantBody = await crossTenant.json();
    const nonexistentBody = await nonexistent.json();
    expect(crossTenantBody).toEqual(nonexistentBody);
    expect(crossTenantBody).toEqual(notFoundBody);
  });

  it('a guest grant for a different submission is denied', async () => {
    const millGrant: GuestGrant = { ...groundFloorGrant, submissionId: millFacade.id, workspaceId: millFacade.workspaceId };
    const restore = setGuestResolver((token) => (token === 'tok-1' ? millGrant : undefined));
    try {
      const res = await call('/api/submissions/s-ground-floor', { guest: 'tok-1' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody);
    } finally {
      restore();
    }
  });

  it('a guest grant whose workspaceId disagrees with the submission is denied', async () => {
    const mismatchedGrant: GuestGrant = { ...groundFloorGrant, workspaceId: 'w-south' };
    const restore = setGuestResolver((token) => (token === 'tok-1' ? mismatchedGrant : undefined));
    try {
      const res = await call('/api/submissions/s-ground-floor', { guest: 'tok-1' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody);
    } finally {
      restore();
    }
  });

  it('a guest grant lacking the requested action is denied', async () => {
    const viewOnlyGrant: GuestGrant = { ...groundFloorGrant, actions: ['comment', 'decide'] };
    const restore = setGuestResolver((token) => (token === 'tok-1' ? viewOnlyGrant : undefined));
    try {
      const res = await call('/api/submissions/s-ground-floor', { guest: 'tok-1' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody);
    } finally {
      restore();
    }
  });

  it('an unknown/garbage guest token with no resolver installed is denied', async () => {
    const res = await call('/api/submissions/s-ground-floor', { guest: 'garbage-token' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });

  it('escalation attempt: garbage guest token plus a valid owner x-user-id is still denied', async () => {
    // u-olivia is the owner of w-north and a legitimate member for s-ground-floor, but the
    // guest header takes priority with no fallback to member authorization once present.
    const res = await call('/api/submissions/s-ground-floor', { guest: 'garbage-token', as: 'u-olivia' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });

  it('no credentials at all returns 401 unauthorized', async () => {
    const res = await call('/api/submissions/s-ground-floor');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Sign in required' } });
  });
});
