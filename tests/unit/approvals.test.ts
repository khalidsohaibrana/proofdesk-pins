import { readFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { call } from '../helpers.js';
import { setGuestResolver } from '../../src/core/access.js';
import type { GuestGrant } from '../../src/core/access.js';
import { assetVersions } from '../../src/core/store.js';
import type { AssetVersion } from '../../src/core/types.js';
import * as approvalsModule from '../../src/modules/approvals/index.js';

// Fixture versions, all under s-ground-floor (workspace w-north) unless noted — one per
// scenario below so decisions made in one test can never 409-collide with another.
const fixtureVersions: AssetVersion[] = [
  { id: 'v-appr-member', submissionId: 's-ground-floor', number: 901, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-guest', submissionId: 's-ground-floor', number: 902, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-changes', submissionId: 's-ground-floor', number: 903, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-finality', submissionId: 's-ground-floor', number: 904, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-badbody', submissionId: 's-ground-floor', number: 905, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-cross-a', submissionId: 's-ground-floor', number: 906, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-cross-b', submissionId: 's-ground-floor', number: 907, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-independence-a', submissionId: 's-ground-floor', number: 914, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-independence-b', submissionId: 's-ground-floor', number: 915, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-denied', submissionId: 's-ground-floor', number: 908, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-wrong-sub', submissionId: 's-ground-floor', number: 909, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-no-decide', submissionId: 's-ground-floor', number: 910, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-escalation', submissionId: 's-ground-floor', number: 911, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-anon', submissionId: 's-ground-floor', number: 912, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-mutate', submissionId: 's-ground-floor', number: 913, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
  { id: 'v-appr-empty-token', submissionId: 's-ground-floor', number: 916, title: 'Fixture', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-10T00:00:00.000Z' },
];
assetVersions.push(...fixtureVersions);

// Round-2 review (item 6): core is frozen and shared across test files in the same
// project; restore the exported `assetVersions` array to its pre-test contents so this
// file leaves no residue for any other test file that runs in the same process.
afterAll(() => {
  for (const fixture of fixtureVersions) {
    const index = assetVersions.indexOf(fixture);
    if (index !== -1) assetVersions.splice(index, 1);
  }
});

const groundFloorGrant: GuestGrant = {
  kind: 'guest',
  linkId: 'gl-test',
  workspaceId: 'w-north',
  submissionId: 's-ground-floor',
  actions: ['view', 'comment', 'decide'],
  label: 'Test client',
};

// Defensive reset: a per-describe afterEach already restores the resolver it installed,
// but a global one guards against a test anywhere in this file forgetting to.
afterEach(() => {
  setGuestResolver(() => undefined);
});

type DecisionBody = {
  id: string;
  versionId: string;
  submissionId: string;
  outcome: string;
  note: string | null;
  decidedByKind: string;
  decidedById: string;
  decidedByLabel: string;
  decidedAt: string;
};

const notFoundBody = { error: { code: 'not_found', message: 'Not found' } };

describe('approvals: module shape (append-only, no exported mutator)', () => {
  it('exports only register — no mutator, no access to the decisions array', () => {
    expect(Object.keys(approvalsModule)).toEqual(['register']);
  });

  it('the decisions collection is appended with push only', () => {
    const source = readFileSync(new URL('../../src/modules/approvals/index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/decisions\.push\(/);
    expect(source).not.toMatch(/decisions\.splice/);
    expect(source).not.toMatch(/decisions\.pop\(/);
    expect(source).not.toMatch(/decisions\.sort\(/);
    expect(source).not.toMatch(/decisions\[[^\]]*\]\s*=/);
    expect(source).not.toMatch(/export const decisions/);
    expect(source).not.toMatch(/export function (add|update|remove|delete|mutate)Decision/i);
  });

  it('decide.js never writes untrusted text via innerHTML/outerHTML', () => {
    const source = readFileSync(new URL('../../public/decide.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/innerHTML/);
    expect(source).not.toMatch(/outerHTML/);
    expect(source).not.toMatch(/insertAdjacentHTML/);
  });
});

describe('approvals: allowed paths', () => {
  it('a workspace member decides "approved" — 201 with the full record', async () => {
    const res = await call('/api/versions/v-appr-member/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved' } });
    expect(res.status).toBe(201);
    const body = (await res.json()) as DecisionBody;
    expect(body).toMatchObject({
      versionId: 'v-appr-member',
      submissionId: 's-ground-floor',
      outcome: 'approved',
      note: null,
      decidedByKind: 'user',
      decidedById: 'u-sam',
      decidedByLabel: 'Sam Patel',
    });
    expect(typeof body.id).toBe('string');
    expect(typeof body.decidedAt).toBe('string');
  });

  it('"changes_requested" works identically to "approved"', async () => {
    const res = await call('/api/versions/v-appr-changes/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'changes_requested', note: 'Please adjust the title block' } });
    expect(res.status).toBe(201);
    const body = (await res.json()) as DecisionBody;
    expect(body.outcome).toBe('changes_requested');
    expect(body.note).toBe('Please adjust the title block');
    expect(body.decidedByKind).toBe('user');
  });

  it('a guest whose grant includes "decide" may decide — 201, decidedByKind guest, no token anywhere', async () => {
    const restore = setGuestResolver((token) => (token === 'tok-1' ? groundFloorGrant : undefined));
    try {
      const res = await call('/api/versions/v-appr-guest/decisions', { method: 'POST', guest: 'tok-1', body: { outcome: 'approved' } });
      expect(res.status).toBe(201);
      const body = (await res.json()) as DecisionBody;
      expect(body.decidedByKind).toBe('guest');
      expect(body.decidedById).toBe(groundFloorGrant.linkId);
      expect(body.decidedByLabel).toBe(groundFloorGrant.label);
      expect(JSON.stringify(body)).not.toContain('tok-1');
    } finally {
      restore();
    }
  });
});

describe('approvals: finality — exactly one decision per versionId', () => {
  it('a second POST on the same versionId is 409 conflict, regardless of outcome or principal; GET is unchanged', async () => {
    const first = await call('/api/versions/v-appr-finality/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved' } });
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const sameOutcome = await call('/api/versions/v-appr-finality/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved' } });
    expect(sameOutcome.status).toBe(409);
    expect(await sameOutcome.json()).toEqual({ error: { code: 'conflict', message: 'This version already has a final decision' } });

    const differentPrincipal = await call('/api/versions/v-appr-finality/decisions', { method: 'POST', as: 'u-olivia', body: { outcome: 'changes_requested' } });
    expect(differentPrincipal.status).toBe(409);
    expect(await differentPrincipal.json()).toEqual({ error: { code: 'conflict', message: 'This version already has a final decision' } });

    const getRes = await call('/api/submissions/s-ground-floor/decisions', { as: 'u-sam' });
    expect(getRes.status).toBe(200);
    const all = (await getRes.json()) as DecisionBody[];
    const onlyOne = all.filter((d) => d.versionId === 'v-appr-finality');
    expect(onlyOne).toHaveLength(1);
    expect(onlyOne[0]).toEqual(firstBody);
  });
});

describe('approvals: outcome validation', () => {
  const cases: Array<{ name: string; body: unknown }> = [
    { name: 'missing outcome', body: {} },
    { name: 'null outcome', body: { outcome: null } },
    { name: "invalid outcome 'rejected'", body: { outcome: 'rejected' } },
    { name: 'invalid outcome, wrong type', body: { outcome: 1 } },
  ];

  for (const { name, body } of cases) {
    it(`${name} → 400 bad_request`, async () => {
      const res = await call('/api/versions/v-appr-badbody/decisions', { method: 'POST', as: 'u-sam', body });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe('bad_request');
    });
  }

  it('a body carrying versionId or submissionId the path already determines → 400', async () => {
    const withVersionId = await call('/api/versions/v-appr-badbody/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved', versionId: 'v-appr-badbody' } });
    expect(withVersionId.status).toBe(400);

    const withSubmissionId = await call('/api/versions/v-appr-badbody/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved', submissionId: 's-ground-floor' } });
    expect(withSubmissionId.status).toBe(400);

    // Neither invalid attempt created a decision for this version.
    const getRes = await call('/api/submissions/s-ground-floor/decisions', { as: 'u-sam' });
    const all = (await getRes.json()) as DecisionBody[];
    expect(all.some((d) => d.versionId === 'v-appr-badbody')).toBe(false);
  });
});

describe('approvals: GET across versions, and version-scoped finality', () => {
  it('GET /api/submissions/:id/decisions returns decisions across versions, each with its own versionId', async () => {
    const first = await call('/api/versions/v-appr-cross-a/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved' } });
    expect(first.status).toBe(201);

    const second = await call('/api/versions/v-appr-cross-b/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'changes_requested' } });
    expect(second.status).toBe(201);

    const getRes = await call('/api/submissions/s-ground-floor/decisions', { as: 'u-sam' });
    expect(getRes.status).toBe(200);
    const all = (await getRes.json()) as DecisionBody[];
    const a = all.find((d) => d.versionId === 'v-appr-cross-a');
    const b = all.find((d) => d.versionId === 'v-appr-cross-b');
    expect(a?.outcome).toBe('approved');
    expect(b?.outcome).toBe('changes_requested');
  });

  it('a decision on one version does not block a decision on a second version of the same submission', async () => {
    // Self-contained (does not depend on test execution order within the file, unlike
    // relying on the previous test's side effects — verified with `--sequence.shuffle`):
    // decide v-appr-independence-a, then prove v-appr-independence-b is still decidable.
    const onFirst = await call('/api/versions/v-appr-independence-a/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved' } });
    expect(onFirst.status).toBe(201);

    const onSecond = await call('/api/versions/v-appr-independence-b/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved' } });
    expect(onSecond.status).toBe(201);
  });
});

describe('approvals: denied paths', () => {
  it('a member of another workspace gets exactly 404, and nothing is added (proven by a follow-up read)', async () => {
    const denied = await call('/api/versions/v-appr-denied/decisions', { method: 'POST', as: 'u-rhea', body: { outcome: 'approved' } });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual(notFoundBody);

    const deniedGet = await call('/api/submissions/s-ground-floor/decisions', { as: 'u-rhea' });
    expect(deniedGet.status).toBe(404);
    expect(await deniedGet.json()).toEqual(notFoundBody);

    const followUp = await call('/api/submissions/s-ground-floor/decisions', { as: 'u-sam' });
    expect(followUp.status).toBe(200);
    const all = (await followUp.json()) as DecisionBody[];
    expect(all.some((d) => d.versionId === 'v-appr-denied')).toBe(false);
  });

  it('a guest grant scoped to a different submission is denied with 404', async () => {
    const wrongSubGrant: GuestGrant = { ...groundFloorGrant, submissionId: 's-mill-facade', workspaceId: 'w-south' };
    const restore = setGuestResolver((token) => (token === 'tok-1' ? wrongSubGrant : undefined));
    try {
      const res = await call('/api/versions/v-appr-wrong-sub/decisions', { method: 'POST', guest: 'tok-1', body: { outcome: 'approved' } });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody);
    } finally {
      restore();
    }
  });

  it('a guest grant lacking "decide" is denied on POST while "view" still works on GET', async () => {
    const noDecideGrant: GuestGrant = { ...groundFloorGrant, actions: ['view', 'comment'] };
    const restore = setGuestResolver((token) => (token === 'tok-1' ? noDecideGrant : undefined));
    try {
      const postRes = await call('/api/versions/v-appr-no-decide/decisions', { method: 'POST', guest: 'tok-1', body: { outcome: 'approved' } });
      expect(postRes.status).toBe(404);
      expect(await postRes.json()).toEqual(notFoundBody);

      const getRes = await call('/api/submissions/s-ground-floor/decisions', { guest: 'tok-1' });
      expect(getRes.status).toBe(200);
    } finally {
      restore();
    }
  });

  it('garbage x-guest-token plus a valid x-user-id is still denied — no escalation', async () => {
    const res = await call('/api/versions/v-appr-escalation/decisions', { method: 'POST', guest: 'garbage-token', as: 'u-olivia', body: { outcome: 'approved' } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });

  it('anonymous (no credentials at all) gets 401', async () => {
    const res = await call('/api/versions/v-appr-anon/decisions', { method: 'POST', body: { outcome: 'approved' } });
    expect(res.status).toBe(401);
  });

  // Round-2 security review (Aegis, item 7): an empty x-guest-token header is "present" by
  // the same rule access.ts uses — it must take the guest path and be denied, never fall
  // through to the x-user-id also on the request. Pins the bug class the #1 review found.
  it('an empty x-guest-token header is denied on both POST and GET, even with a valid x-user-id present', async () => {
    const postRes = await call('/api/versions/v-appr-empty-token/decisions', { method: 'POST', guest: '', as: 'u-sam', body: { outcome: 'approved' } });
    expect(postRes.status).toBe(404);
    expect(await postRes.json()).toEqual(notFoundBody);

    const getRes = await call('/api/submissions/s-ground-floor/decisions', { guest: '', as: 'u-olivia' });
    expect(getRes.status).toBe(404);
    expect(await getRes.json()).toEqual(notFoundBody);

    // Nothing was added for the denied POST attempt.
    const followUp = await call('/api/submissions/s-ground-floor/decisions', { as: 'u-sam' });
    const all = (await followUp.json()) as DecisionBody[];
    expect(all.some((d) => d.versionId === 'v-appr-empty-token')).toBe(false);
  });
});

describe('approvals: mutating verbs must never exist', () => {
  it('PATCH/PUT/DELETE on both decision path shapes are 404, and the record is provably unchanged', async () => {
    const created = await call('/api/versions/v-appr-mutate/decisions', { method: 'POST', as: 'u-sam', body: { outcome: 'approved' } });
    expect(created.status).toBe(201);
    const snapshot = await created.json();

    const paths = ['/api/decisions/does-not-matter', '/api/versions/v-appr-mutate/decisions/does-not-matter'];
    for (const path of paths) {
      for (const method of ['PATCH', 'PUT', 'DELETE']) {
        const res = await call(path, { method, as: 'u-sam', body: { outcome: 'changes_requested' } });
        expect(res.status).toBe(404);
      }
    }

    const after = await call('/api/submissions/s-ground-floor/decisions', { as: 'u-sam' });
    const all = (await after.json()) as DecisionBody[];
    const unchanged = all.find((d) => d.versionId === 'v-appr-mutate');
    expect(unchanged).toEqual(snapshot);
  });
});
