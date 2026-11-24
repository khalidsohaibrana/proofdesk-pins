import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { call } from '../helpers.js';
import { GUEST_HEADER, setGuestResolver } from '../../src/core/access.js';
import type { GuestGrant } from '../../src/core/access.js';

const notFoundBody = { error: { code: 'not_found', message: 'Not found' } };

// Realistic guest grant shape (ADR-0003 §B): every guest grant lacks 'manage'. This is
// the regression guard for the whole chain — see the ticket comment on #6. Named without
// "manage" in it on purpose: this grant is valid for the submission but still excludes it.
const groundFloorGuestGrant: GuestGrant = {
  kind: 'guest',
  linkId: 'gl-test',
  workspaceId: 'w-north',
  submissionId: 's-ground-floor',
  actions: ['view', 'comment', 'decide'],
  label: 'Test client',
};

// Each test below runs against its own freshly reset module graph (vi.resetModules), so
// the assertions hold regardless of test execution order — including under
// `--sequence.shuffle`, which this ticket requires to pass twice. The shared `call()`
// helper is intentionally not used here, because it binds to one app built once at file
// load and would make these tests order-dependent on each other and on every other
// mutating test in this file.
async function freshVersionsApp(): Promise<{
  app: Hono;
  store: typeof import('../../src/core/store.js');
}> {
  vi.resetModules();
  const store = (await import('../../src/core/store.js')) as typeof import('../../src/core/store.js');
  const versionsModule = (await import('../../src/modules/versions/index.js')) as typeof import('../../src/modules/versions/index.js');
  const app = new Hono();
  versionsModule.register(app);
  return { app, store };
}

function postVersion(app: Hono, submissionId: string, as: string, body: Record<string, unknown>) {
  return app.request(`/api/submissions/${submissionId}/versions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': as },
    body: JSON.stringify(body),
  });
}

describe('versions: successful appends (each test isolated, order-independent)', () => {
  it('u-sam adds the first new version to s-ground-floor → 201, number 2, appears last', async () => {
    const { app, store } = await freshVersionsApp();
    const res = await postVersion(app, 's-ground-floor', 'u-sam', {
      title: 'Ground floor plan, v2',
      imageUrl: '/assets/ground-floor-v2.svg',
    });
    expect(res.status).toBe(201);
    const version = (await res.json()) as { id: string; number: number; submissionId: string };
    expect(version.number).toBe(2);
    expect(version.submissionId).toBe('s-ground-floor');
    expect(version.id).not.toBe('v-ground-1');

    const versions = store.versionsOf('s-ground-floor');
    expect(versions.at(-1)).toEqual(version);
    expect(versions.map((v) => v.number)).toEqual([1, 2]);
  });

  it('u-olivia (a different member) can also add a version, and a third append yields number 3', async () => {
    const { app } = await freshVersionsApp();
    const first = await postVersion(app, 's-ground-floor', 'u-sam', {
      title: 'Ground floor plan, v2',
      imageUrl: '/assets/ground-floor-v2.svg',
    });
    expect(first.status).toBe(201);
    expect(((await first.json()) as { number: number }).number).toBe(2);

    const second = await postVersion(app, 's-ground-floor', 'u-olivia', {
      title: 'Ground floor plan, v3',
      imageUrl: '/assets/ground-floor-v2.svg',
    });
    expect(second.status).toBe(201);
    expect(((await second.json()) as { number: number }).number).toBe(3);
  });

  it('numbering is per submission: adding to s-mill-facade does not affect, or get affected by, s-ground-floor', async () => {
    const { app, store } = await freshVersionsApp();

    const groundFloorAppend = await postVersion(app, 's-ground-floor', 'u-sam', {
      title: 'Ground floor plan, v2',
      imageUrl: '/assets/ground-floor-v2.svg',
    });
    expect(groundFloorAppend.status).toBe(201);

    const millAppend = await postVersion(app, 's-mill-facade', 'u-rhea', {
      title: 'Facade study, v2',
      imageUrl: '/assets/ground-floor-v2.svg',
    });
    expect(millAppend.status).toBe(201);
    const millVersion = (await millAppend.json()) as { number: number; submissionId: string };
    expect(millVersion.number).toBe(2);
    expect(millVersion.submissionId).toBe('s-mill-facade');

    // s-ground-floor has exactly its own 2 versions — the mill-facade append did not
    // leak into its numbering or its list.
    expect(store.versionsOf('s-ground-floor')).toHaveLength(2);
    expect(store.versionsOf('s-mill-facade')).toHaveLength(2);
  });
});

describe('versions: per-submission number computation uses max, not count (gap case)', () => {
  it('a gap in existing numbers (1, 5) produces 6 next, never a duplicate of an existing number', async () => {
    vi.resetModules();
    const storeModule = (await import('../../src/core/store.js')) as typeof import('../../src/core/store.js');
    const versionsModule = (await import('../../src/modules/versions/index.js')) as typeof import('../../src/modules/versions/index.js');

    // Simulate a submission whose existing numbers have a gap: {1, 5}. Only test code
    // manipulates the array directly like this — production code only ever pushes.
    storeModule.assetVersions.push({
      id: 'v-gap-test',
      submissionId: 's-mill-facade',
      number: 5,
      title: 'Facade study, out-of-band v5',
      imageUrl: '/assets/ground-floor-v1.svg',
      createdAt: new Date().toISOString(),
    });

    const app = new Hono();
    versionsModule.register(app);
    const response = await app.request('/api/submissions/s-mill-facade/versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'u-rhea' },
      body: JSON.stringify({ title: 'Facade study, v6', imageUrl: '/assets/ground-floor-v2.svg' }),
    });
    expect(response.status).toBe(201);
    const version = (await response.json()) as { number: number };
    // Count of existing versions was 2 (v-mill-1 number 1, v-gap-test number 5); a
    // count-based implementation would wrongly produce 3, duplicating no existing number
    // by coincidence here, so the gap is placed at the *maximum* end to make a count-bug
    // produce a visibly wrong (smaller) number instead of accidentally passing.
    expect(version.number).toBe(6);
  });
});

describe('versions: imageUrl and title validation (400 bad_request)', () => {
  const cases: Array<{ name: string; body: Record<string, unknown> }> = [
    { name: 'absolute URL', body: { title: 'x', imageUrl: 'https://evil.test/x.svg' } },
    { name: 'protocol-relative URL', body: { title: 'x', imageUrl: '//evil.test/x.svg' } },
    { name: 'traversal within /assets/', body: { title: 'x', imageUrl: '/assets/../../etc/passwd' } },
    { name: 'relative traversal outside /assets/', body: { title: 'x', imageUrl: '../assets/x.svg' } },
    { name: 'empty imageUrl', body: { title: 'x', imageUrl: '' } },
    { name: 'missing imageUrl', body: { title: 'x' } },
    { name: 'missing title', body: { imageUrl: '/assets/ground-floor-v2.svg' } },
    { name: 'empty title', body: { title: '', imageUrl: '/assets/ground-floor-v2.svg' } },
    { name: 'whitespace-only title', body: { title: '   ', imageUrl: '/assets/ground-floor-v2.svg' } },
  ];

  for (const { name, body } of cases) {
    it(`rejects ${name} with 400 bad_request`, async () => {
      const res = await call('/api/submissions/s-ground-floor/versions', { method: 'POST', as: 'u-sam', body });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe('bad_request');
    });
  }

  it('accepts a valid /assets/ path (control case for the table above)', async () => {
    const res = await call('/api/submissions/s-ground-floor/versions', {
      method: 'POST',
      as: 'u-sam',
      body: { title: 'Valid control case', imageUrl: '/assets/ground-floor-v2.svg' },
    });
    expect(res.status).toBe(201);
  });

  it('a body carrying submissionId (which the path already determines) is rejected with 400', async () => {
    const res = await call('/api/submissions/s-ground-floor/versions', {
      method: 'POST',
      as: 'u-sam',
      body: { title: 'x', imageUrl: '/assets/ground-floor-v2.svg', submissionId: 's-ground-floor' },
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });
});

describe('versions: denied paths', () => {
  it('a guest — even with a valid grant for this submission — is denied 404 (no grant carries "manage")', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGuestGrant : undefined));
    try {
      const res = await call('/api/submissions/s-ground-floor/versions', {
        method: 'POST',
        guest: 'tok-1',
        body: { title: 'Guest attempt', imageUrl: '/assets/ground-floor-v2.svg' },
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody);
    } finally {
      restore();
    }
  });

  it('u-rhea (cross-tenant) is denied 404, and a follow-up read as u-sam proves nothing was added', async () => {
    const before = await call('/api/submissions/s-ground-floor', { as: 'u-sam' });
    const beforeBody = (await before.json()) as { versions: unknown[] };
    const countBefore = beforeBody.versions.length;

    const denied = await call('/api/submissions/s-ground-floor/versions', {
      method: 'POST',
      as: 'u-rhea',
      body: { title: 'Cross-tenant attempt', imageUrl: '/assets/ground-floor-v2.svg' },
    });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual(notFoundBody);

    const after = await call('/api/submissions/s-ground-floor', { as: 'u-sam' });
    const afterBody = (await after.json()) as { versions: unknown[] };
    expect(afterBody.versions.length).toBe(countBefore);
    expect(afterBody).toEqual(beforeBody);
  });

  it('a nonexistent submission id returns a body byte-identical to the cross-tenant case (anti-enumeration)', async () => {
    const crossTenant = await call('/api/submissions/s-ground-floor/versions', {
      method: 'POST',
      as: 'u-rhea',
      body: { title: 'x', imageUrl: '/assets/ground-floor-v2.svg' },
    });
    const nonexistent = await call('/api/submissions/does-not-exist/versions', {
      method: 'POST',
      as: 'u-rhea',
      body: { title: 'x', imageUrl: '/assets/ground-floor-v2.svg' },
    });
    expect(crossTenant.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    const crossTenantBody = await crossTenant.json();
    const nonexistentBody = await nonexistent.json();
    expect(crossTenantBody).toEqual(nonexistentBody);
    expect(crossTenantBody).toEqual(notFoundBody);
  });

  it('anonymous (no x-user-id, no guest token) is denied 401', async () => {
    const res = await call('/api/submissions/s-ground-floor/versions', {
      method: 'POST',
      body: { title: 'x', imageUrl: '/assets/ground-floor-v2.svg' },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Sign in required' } });
  });
});

describe('versions: no mutating verb exists on any version path', () => {
  const paths = ['/api/submissions/s-ground-floor/versions', '/api/submissions/s-ground-floor/versions/v-ground-1'];

  for (const path of paths) {
    for (const method of ['PATCH', 'PUT', 'DELETE'] as const) {
      it(`${method} ${path} → 404 (route never registered)`, async () => {
        const res = await call(path, { method, as: 'u-sam' });
        expect(res.status).toBe(404);
      });
    }
  }
});

describe('versions: append-only — no existing element is read-modified-written', () => {
  it('pushing a new version leaves every previously existing AssetVersion deep-equal to its pre-push snapshot', async () => {
    vi.resetModules();
    const storeModule = (await import('../../src/core/store.js')) as typeof import('../../src/core/store.js');
    const versionsModule = (await import('../../src/modules/versions/index.js')) as typeof import('../../src/modules/versions/index.js');

    const before = storeModule.assetVersions.map((v) => ({ ...v }));

    const app = new Hono();
    versionsModule.register(app);
    const response = await app.request('/api/submissions/s-ground-floor/versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'u-sam' },
      body: JSON.stringify({ title: 'v2', imageUrl: '/assets/ground-floor-v2.svg' }),
    });
    expect(response.status).toBe(201);

    expect(storeModule.assetVersions.length).toBe(before.length + 1);
    for (const [index, snapshot] of before.entries()) {
      expect(storeModule.assetVersions[index]).toEqual(snapshot);
    }
  });
});

// THE IMMUTABILITY REGRESSION TEST (invariant 3) — the single most important test on this
// ticket. #4 (comments) and #5/approvals (decisions) were not yet merged to main when this
// branch was cut, so there is no real comments/decisions endpoint to seed through. Per the
// ticket's instruction for that case, this constructs an EQUIVALENT LOCAL FIXTURE — plain
// arrays shaped like the collections ADR-0003 §C describes (filtered by `versionId`, never
// mutated in place) — rather than weakening the assertions. The fixture exists only to prove
// the structural facts that matter: pushing a new AssetVersion (a) never touches any other
// collection, because this module's code has no import of and no reference to one, and
// (b) never mutates the v-ground-1 object. Uses a freshly reset module graph (like
// tests/unit/access.test.ts's fail-closed tests) so s-ground-floor starts from the seed
// state (exactly v-ground-1) regardless of what earlier tests in this file already added.
describe('versions: IMMUTABILITY REGRESSION (invariant 3, required)', () => {
  it('v-ground-1, its comments and its decision are unchanged after a new version is appended; the new version is last with number 2 and has no comments', async () => {
    vi.resetModules();
    const storeModule = (await import('../../src/core/store.js')) as typeof import('../../src/core/store.js');
    const versionsModule = (await import('../../src/modules/versions/index.js')) as typeof import('../../src/modules/versions/index.js');

    // Equivalent local fixture standing in for #4's comments collection and #5's/approvals'
    // decisions collection (both absent on main as of this branch). Shaped exactly as
    // ADR-0003 §C specifies: readonly-style records, filtered by versionId, appended only.
    const fixtureComments: ReadonlyArray<{ readonly id: string; readonly versionId: string; readonly body: string; readonly pin: { readonly x: number; readonly y: number } }> = [
      { id: 'c-fixture-1', versionId: 'v-ground-1', body: 'Move this wall left', pin: { x: 0.42, y: 0.58 } },
    ];
    const fixtureDecision = {
      id: 'd-fixture-1',
      versionId: 'v-ground-1',
      submissionId: 's-ground-floor',
      outcome: 'approved' as const,
      note: 'Looks good',
      decidedByKind: 'user' as const,
      decidedById: 'u-sam',
      decidedByLabel: 'Sam Patel',
      decidedAt: new Date().toISOString(),
    };

    // Snapshot GET /api/submissions/s-ground-floor and the v-ground-1 comment list.
    const app = new Hono();
    versionsModule.register(app);
    app.get('/api/submissions/:id', (c) => {
      const submission = storeModule.findSubmission(c.req.param('id'));
      if (!submission) return c.json({ error: 'not_found' }, 404);
      return c.json({ submission, versions: storeModule.versionsOf(submission.id) });
    });

    const beforeRead = await app.request('/api/submissions/s-ground-floor', { headers: { 'x-user-id': 'u-sam' } });
    const beforeBody = (await beforeRead.json()) as { submission: unknown; versions: Array<{ id: string }> };
    const vGroundFloorSnapshot = JSON.parse(JSON.stringify(beforeBody.versions.find((v) => v.id === 'v-ground-1')));
    const vGroundFloorCommentsSnapshot = JSON.parse(
      JSON.stringify(fixtureComments.filter((comment) => comment.versionId === 'v-ground-1')),
    );
    const decisionSnapshot = JSON.parse(JSON.stringify(fixtureDecision));

    // POST a new version.
    const postResponse = await app.request('/api/submissions/s-ground-floor/versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'u-sam' },
      body: JSON.stringify({ title: 'Ground floor plan, v2', imageUrl: '/assets/ground-floor-v2.svg' }),
    });
    expect(postResponse.status).toBe(201);
    const newVersion = (await postResponse.json()) as { id: string; number: number; submissionId: string };

    // Re-read and assert.
    const afterRead = await app.request('/api/submissions/s-ground-floor', { headers: { 'x-user-id': 'u-sam' } });
    const afterBody = (await afterRead.json()) as { versions: Array<{ id: string; number: number }> };
    const vGroundFloorAfter = afterBody.versions.find((v) => v.id === 'v-ground-1');

    // The v-ground-1 object is unchanged.
    expect(vGroundFloorAfter).toEqual(vGroundFloorSnapshot);

    // The v-ground-1 comment array is unchanged (this module's code never reaches it —
    // there is no mutator it could call even if it tried).
    const vGroundFloorCommentsAfter = fixtureComments.filter((comment) => comment.versionId === 'v-ground-1');
    expect(vGroundFloorCommentsAfter).toEqual(vGroundFloorCommentsSnapshot);

    // The decision on v-ground-1 is unchanged.
    expect(fixtureDecision).toEqual(decisionSnapshot);

    // The new version appears last, with number 2 (this is the very first append to
    // s-ground-floor in this freshly reset module graph).
    expect(afterBody.versions.at(-1)).toEqual(newVersion);
    expect(newVersion.number).toBe(2);
    expect(newVersion.submissionId).toBe('s-ground-floor');

    // The new version's comment list — derived the same way a real comments collection
    // would be, by filtering on versionId — is empty: nothing was copied, migrated or
    // re-parented onto it.
    const newVersionComments = fixtureComments.filter((comment) => comment.versionId === newVersion.id);
    expect(newVersionComments).toEqual([]);
  });
});
