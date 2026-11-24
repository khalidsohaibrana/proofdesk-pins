import { afterEach, describe, expect, it } from 'vitest';
import { call } from '../helpers.js';
import { setGuestResolver } from '../../src/core/access.js';
import type { GuestGrant } from '../../src/core/access.js';
import * as commentsModule from '../../src/modules/comments/index.js';
import { commentsOf } from '../../src/modules/comments/index.js';
import type { Comment } from '../../src/modules/comments/index.js';

const notFoundBody = { error: { code: 'not_found', message: 'Not found' } };

const groundFloorGrant: GuestGrant = {
  kind: 'guest',
  linkId: 'gl-test',
  workspaceId: 'w-north',
  submissionId: 's-ground-floor',
  actions: ['view', 'comment', 'decide'],
  label: 'Test client',
};

// ADR-0003 §D binding guidance: do NOT copy the vi.resetModules()/warm-up pattern from
// tests/unit/access.test.ts. That pattern exists only to prove T0's module-init default is
// deny-all, which this file never needs to re-prove. Here, a mistimed reset would race the
// app's own dynamic import of access.js and the failure direction is a spurious denial —
// in a file full of 404 assertions that would make the denial tests pass vacuously. Instead:
// a plain `setGuestResolver` per test, restored in `finally`, plus this defensive afterEach.
afterEach(() => {
  setGuestResolver(() => undefined);
});

async function post(versionId: string, init: { as?: string; guest?: string; body?: unknown }) {
  return call(`/api/versions/${versionId}/comments`, { method: 'POST', ...init });
}

async function get(versionId: string, init: { as?: string; guest?: string } = {}) {
  return call(`/api/versions/${versionId}/comments`, init);
}

describe('comments: module surface (append-only, no exported mutator)', () => {
  it('exports only register and the read-only commentsOf accessor — no mutator', () => {
    const exported = Object.keys(commentsModule).sort();
    expect(exported).toEqual(['commentsOf', 'register']);
    expect(typeof commentsModule.register).toBe('function');
    expect(typeof commentsModule.commentsOf).toBe('function');
  });

  it('commentsOf returns a fresh array each call — callers cannot push into the live collection', () => {
    const first = commentsOf('v-ground-1');
    const second = commentsOf('v-ground-1');
    expect(first).not.toBe(second);
  });
});

describe('comments: pin bounds (unit, via the POST route)', () => {
  const invalidPins: ReadonlyArray<[string, unknown]> = [
    ['missing', undefined],
    ['null', null],
    ['string', '0.5'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-0.01', -0.01],
    ['1.5', 1.5],
  ];

  it.each(invalidPins)('rejects pin.x = %s with 400 bad_request', async (_label, badValue) => {
    const body: Record<string, unknown> = { body: 'hello' };
    if (badValue !== undefined) body.pin = { x: badValue, y: 0.5 };
    const res = await post('v-ground-1', { as: 'u-sam', body });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });

  it('a wholly missing pin field is rejected with 400', async () => {
    const res = await post('v-ground-1', { as: 'u-sam', body: { body: 'no pin here' } });
    expect(res.status).toBe(400);
  });

  it.each([0, 1])('accepts the inclusive bound %s for both x and y', async (bound) => {
    const res = await post('v-ground-1', { as: 'u-sam', body: { body: `bound ${bound}`, pin: { x: bound, y: bound } } });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Comment;
    expect(created.pin).toEqual({ x: bound, y: bound });
  });

  it('rounds stored pin values to 4 decimal places', async () => {
    const res = await post('v-ground-1', {
      as: 'u-sam',
      body: { body: 'precise pin', pin: { x: 0.123456789, y: 0.987654321 } },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Comment;
    expect(created.pin).toEqual({ x: 0.1235, y: 0.9877 });
  });
});

describe('comments: body validation', () => {
  it('rejects an empty body with 400', async () => {
    const res = await post('v-ground-1', { as: 'u-sam', body: { body: '', pin: { x: 0.5, y: 0.5 } } });
    expect(res.status).toBe(400);
  });

  it('rejects a missing body field with 400', async () => {
    const res = await post('v-ground-1', { as: 'u-sam', body: { pin: { x: 0.5, y: 0.5 } } });
    expect(res.status).toBe(400);
  });

  it('rejects a body carrying a versionId the path already determines (ADR-0003 §A step 1)', async () => {
    const res = await post('v-ground-1', {
      as: 'u-sam',
      body: { body: 'sneaky', pin: { x: 0.5, y: 0.5 }, versionId: 'v-mill-1' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a body carrying a submissionId the path already determines', async () => {
    const res = await post('v-ground-1', {
      as: 'u-sam',
      body: { body: 'sneaky', pin: { x: 0.5, y: 0.5 }, submissionId: 's-mill-facade' },
    });
    expect(res.status).toBe(400);
  });
});

describe('comments: allowed paths', () => {
  it('a workspace member posts a comment with a valid pin -> 201 with versionId, rounded pin, author label, createdAt', async () => {
    const res = await post('v-ground-1', { as: 'u-sam', body: { body: 'Looks good', pin: { x: 0.25, y: 0.75 } } });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Comment;
    expect(created.versionId).toBe('v-ground-1');
    expect(created.pin).toEqual({ x: 0.25, y: 0.75 });
    expect(created.author).toEqual({ kind: 'user', userId: 'u-sam', label: 'Sam Patel' });
    expect(typeof created.createdAt).toBe('string');
  });

  it('a guest with a comment grant for s-ground-floor posts a comment -> 201, author is a guest, no token stored', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      const res = await post('v-ground-1', { guest: 'tok-1', body: { body: 'Client note', pin: { x: 0.1, y: 0.2 } } });
      expect(res.status).toBe(201);
      const created = (await res.json()) as Comment;
      expect(created.author).toEqual({ kind: 'guest', linkId: 'gl-test', label: 'Test client' });
      expect(JSON.stringify(created)).not.toContain('tok-1');
    } finally {
      restore();
    }
  });

  it('GET returns only that version\'s comments (version-scoping of the collection filter)', async () => {
    await post('v-ground-1', { as: 'u-sam', body: { body: 'on v-ground-1', pin: { x: 0.3, y: 0.3 } } });
    await post('v-mill-1', { as: 'u-rhea', body: { body: 'on v-mill-1', pin: { x: 0.4, y: 0.4 } } });

    const groundRes = await get('v-ground-1', { as: 'u-sam' });
    expect(groundRes.status).toBe(200);
    const groundComments = (await groundRes.json()) as Comment[];
    expect(groundComments.every((c) => c.versionId === 'v-ground-1')).toBe(true);
    expect(groundComments.some((c) => c.body === 'on v-mill-1')).toBe(false);

    const millRes = await get('v-mill-1', { as: 'u-rhea' });
    expect(millRes.status).toBe(200);
    const millComments = (await millRes.json()) as Comment[];
    expect(millComments.some((c) => c.body === 'on v-ground-1')).toBe(false);
  });

  it('a guest grant scoped to the submission can GET even without comment, and POST works with comment', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      const res = await get('v-ground-1', { guest: 'tok-1' });
      expect(res.status).toBe(200);
    } finally {
      restore();
    }
  });
});

describe('comments: denied paths', () => {
  it('u-rhea GET/POST on v-ground-1 -> 404 not_found, nothing added', async () => {
    const getRes = await get('v-ground-1', { as: 'u-rhea' });
    expect(getRes.status).toBe(404);
    expect(await getRes.json()).toEqual(notFoundBody);

    const before = await get('v-ground-1', { as: 'u-sam' });
    const beforeBody = (await before.json()) as Comment[];

    const postRes = await post('v-ground-1', { as: 'u-rhea', body: { body: 'nope', pin: { x: 0.1, y: 0.1 } } });
    expect(postRes.status).toBe(404);
    expect(await postRes.json()).toEqual(notFoundBody);

    const after = await get('v-ground-1', { as: 'u-sam' });
    const afterBody = (await after.json()) as Comment[];
    expect(afterBody).toEqual(beforeBody);
  });

  it('anti-enumeration: cross-tenant and nonexistent-version bodies are byte-identical', async () => {
    const crossTenant = await get('v-ground-1', { as: 'u-rhea' });
    const nonexistent = await get('v-does-not-exist', { as: 'u-rhea' });
    expect(crossTenant.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    const crossTenantBody = await crossTenant.json();
    const nonexistentBody = await nonexistent.json();
    expect(crossTenantBody).toEqual(nonexistentBody);
    expect(crossTenantBody).toEqual(notFoundBody);
  });

  it('a guest grant scoped to a different submission is denied with 404', async () => {
    const wrongSubmissionGrant: GuestGrant = { ...groundFloorGrant, submissionId: 's-mill-facade', workspaceId: 'w-south' };
    const restore = setGuestResolver((token) => (token === 'tok-1' ? wrongSubmissionGrant : undefined));
    try {
      const res = await post('v-ground-1', { guest: 'tok-1', body: { body: 'x', pin: { x: 0.1, y: 0.1 } } });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody);
    } finally {
      restore();
    }
  });

  it('a guest grant lacking the "comment" action is denied on POST while "view" still works on GET', async () => {
    const viewOnlyGrant: GuestGrant = { ...groundFloorGrant, actions: ['view'] };
    const restore = setGuestResolver((token) => (token === 'tok-1' ? viewOnlyGrant : undefined));
    try {
      const postRes = await post('v-ground-1', { guest: 'tok-1', body: { body: 'x', pin: { x: 0.1, y: 0.1 } } });
      expect(postRes.status).toBe(404);
      expect(await postRes.json()).toEqual(notFoundBody);

      const getRes = await get('v-ground-1', { guest: 'tok-1' });
      expect(getRes.status).toBe(200);
    } finally {
      restore();
    }
  });

  it('escalation attempt: garbage guest token plus a valid x-user-id is still denied (no fallback)', async () => {
    const res = await post('v-ground-1', {
      guest: 'garbage-token',
      as: 'u-olivia',
      body: { body: 'x', pin: { x: 0.1, y: 0.1 } },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });

  it('anonymous caller (no credentials at all) gets 401', async () => {
    const res = await get('v-ground-1');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Sign in required' } });
  });
});

describe('comments: mutating verbs must never exist (append-only, invariant 2)', () => {
  it('PATCH/PUT/DELETE on /api/comments/:id and the nested path all 404, collection unchanged', async () => {
    const seeded = await post('v-ground-1', { as: 'u-sam', body: { body: 'immutable', pin: { x: 0.2, y: 0.2 } } });
    const created = (await seeded.json()) as Comment;

    const before = await get('v-ground-1', { as: 'u-sam' });
    const beforeBody = (await before.json()) as Comment[];

    const paths = [`/api/comments/${created.id}`, `/api/versions/v-ground-1/comments/${created.id}`];
    for (const path of paths) {
      for (const method of ['PATCH', 'PUT', 'DELETE']) {
        const res = await call(path, { method, as: 'u-sam' });
        expect(res.status).toBe(404);
      }
    }

    const after = await get('v-ground-1', { as: 'u-sam' });
    const afterBody = (await after.json()) as Comment[];
    expect(afterBody).toEqual(beforeBody);
  });
});
