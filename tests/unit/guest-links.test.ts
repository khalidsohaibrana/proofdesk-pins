import { beforeAll, describe, expect, it } from 'vitest';
import { call } from '../helpers.js';
import { allGuestLinks, addGuestLink, revokeGuestLink } from '../../src/modules/guest-links/store.js';
import type { GuestLink } from '../../src/modules/guest-links/store.js';
import { resolveGuestToken } from '../../src/modules/guest-links/resolver.js';
import { hashToken } from '../../src/modules/guest-links/token.js';

const notFoundBody = { error: { code: 'not_found', message: 'Not found' } };

interface CreateResponse {
  readonly token: string;
  readonly link: {
    readonly id: string;
    readonly workspaceId: string;
    readonly submissionId: string;
    readonly label: string;
    readonly createdBy: string;
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly revokedAt: string | null;
  };
}

/** Builds a fully-formed GuestLink fixture for direct store insertion (used by the
 * resolver/boundary tests below, which need precise control over expiresAt/revokedAt that
 * going through the HTTP route and the real clock cannot give). */
function makeLink(overrides: Partial<GuestLink> & { token: string }): GuestLink {
  const { token, ...rest } = overrides;
  return {
    id: 'gl-fixture',
    workspaceId: 'w-north',
    submissionId: 's-ground-floor',
    tokenHash: hashToken(token),
    label: 'Guest reviewer',
    createdBy: 'u-olivia',
    createdAt: '2026-11-01T09:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    revokedAt: null,
    ...rest,
  };
}

beforeAll(async () => {
  // See tests/unit/access.test.ts for why: warm the shared in-process app up before any
  // test performs module-level resets or relies on the real resolver being installed.
  await call('/health');
});

describe('guest-links: resolver — AC-S1 (blank token never resolves)', () => {
  it('an empty token resolves to undefined, with no link present at all', () => {
    expect(resolveGuestToken('')).toBeUndefined();
  });

  it('a whitespace-only token resolves to undefined', () => {
    expect(resolveGuestToken('   ')).toBeUndefined();
  });

  it('an empty token still resolves to undefined even when a real, valid link exists', () => {
    addGuestLink(makeLink({ id: 'gl-s1-a', token: 'real-token-s1-a' }));
    expect(resolveGuestToken('')).toBeUndefined();
    expect(resolveGuestToken('   ')).toBeUndefined();
  });

  it('end-to-end: a blank x-guest-token header with no other credential never succeeds', async () => {
    addGuestLink(makeLink({ id: 'gl-s1-b', token: 'real-token-s1-b' }));
    const res = await call('/api/submissions/s-ground-floor', { guest: '' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });

  // Mutation-killers: every test above presents "" / "   " against fixtures whose stored
  // hashes are sha256 of *real* tokens, so the hash lookup alone already returns undefined
  // and resolver.ts's `token.trim().length === 0` guard is never actually exercised by them
  // — delete the guard and all of the above still pass. These two fixtures store
  // tokenHash = hashToken('') / hashToken('   ') literally, so only the explicit guard (and
  // not hash lookup) stands between a blank presented token and a match. This is the half of
  // AC-S1 that also pins "no startsWith/includes/substring matching": a guard built that way
  // would still pass the tests above but fail these.
  it('a stored tokenHash literally equal to hashToken(\'\') still never resolves against an empty presented token', () => {
    addGuestLink(makeLink({ id: 'gl-s1-pinned-empty', token: '' }));
    expect(resolveGuestToken('')).toBeUndefined();
  });

  it('a stored tokenHash literally equal to hashToken(\'   \') still never resolves against a whitespace-only presented token', () => {
    addGuestLink(makeLink({ id: 'gl-s1-pinned-whitespace', token: '   ' }));
    expect(resolveGuestToken('   ')).toBeUndefined();
  });
});

describe('guest-links: resolver — AC-S2 (fixed action set, never manage)', () => {
  it("a resolved grant's actions are exactly ['view','comment','decide']", () => {
    addGuestLink(makeLink({ id: 'gl-s2-a', token: 'real-token-s2-a' }));
    const grant = resolveGuestToken('real-token-s2-a');
    expect(grant?.actions).toEqual(['view', 'comment', 'decide']);
  });

  it("the grant's actions never include 'manage'", () => {
    addGuestLink(makeLink({ id: 'gl-s2-b', token: 'real-token-s2-b' }));
    const grant = resolveGuestToken('real-token-s2-b');
    expect(grant?.actions.includes('manage')).toBe(false);
  });

  it('the returned actions array is frozen at runtime, not just ReadonlyArray at compile time', () => {
    addGuestLink(makeLink({ id: 'gl-s2-frozen', token: 'real-token-s2-frozen' }));
    const grant = resolveGuestToken('real-token-s2-frozen');
    expect(Object.isFrozen(grant?.actions)).toBe(true);
  });

  it('a mutation attempt on one grant\'s actions does not affect a second, independently-resolved grant', () => {
    addGuestLink(makeLink({ id: 'gl-s2-poison-a', token: 'real-token-s2-poison-a' }));
    addGuestLink(makeLink({ id: 'gl-s2-poison-b', token: 'real-token-s2-poison-b' }));

    const first = resolveGuestToken('real-token-s2-poison-a');
    // `actions` is typed ReadonlyArray<Action>, which is compile-time only; this simulates a
    // careless consumer reaching for a mutating method via an `any`/array-cast escape hatch —
    // exactly the attack the supervisor flagged (one push poisoning every grant, past and
    // future, because every grant shares one array instance unless it is frozen).
    expect(() => (first?.actions as unknown as string[])?.push('manage')).toThrow();

    const second = resolveGuestToken('real-token-s2-poison-b');
    expect(second?.actions).toEqual(['view', 'comment', 'decide']);
    expect(second?.actions.includes('manage' as never)).toBe(false);

    const firstAgain = resolveGuestToken('real-token-s2-poison-a');
    expect(firstAgain?.actions).toEqual(['view', 'comment', 'decide']);
  });
});

describe('guest-links: resolver — hash lookup and indistinguishability', () => {
  it('resolves a fresh token by hashing it and looking up the matching stored hash', () => {
    addGuestLink(makeLink({ id: 'gl-hash-a', token: 'tok-hash-a' }));
    const grant = resolveGuestToken('tok-hash-a');
    expect(grant).toEqual({
      kind: 'guest',
      linkId: 'gl-hash-a',
      workspaceId: 'w-north',
      submissionId: 's-ground-floor',
      actions: ['view', 'comment', 'decide'],
      label: 'Guest reviewer',
    });
  });

  it('the timingSafeEqual path does not throw on a malformed/garbage token of any shape', () => {
    addGuestLink(makeLink({ id: 'gl-hash-b', token: 'tok-hash-b' }));
    expect(() => resolveGuestToken('not-a-real-token-at-all')).not.toThrow();
    expect(resolveGuestToken('not-a-real-token-at-all')).toBeUndefined();
    expect(() => resolveGuestToken('x')).not.toThrow();
    expect(() => resolveGuestToken('🙂'.repeat(50))).not.toThrow();
  });

  it('an unknown token resolves to undefined', () => {
    expect(resolveGuestToken('token-that-was-never-issued')).toBeUndefined();
  });

  it('expiry boundary: just-before expiresAt resolves, just-after does not', () => {
    const now = Date.now();
    addGuestLink(makeLink({ id: 'gl-exp-live', token: 'tok-exp-live', expiresAt: new Date(now + 1000).toISOString() }));
    addGuestLink(makeLink({ id: 'gl-exp-dead', token: 'tok-exp-dead', expiresAt: new Date(now - 1000).toISOString() }));
    expect(resolveGuestToken('tok-exp-live')).toBeDefined();
    expect(resolveGuestToken('tok-exp-dead')).toBeUndefined();
  });

  it('a revoked link resolves to undefined, indistinguishable from unknown', () => {
    addGuestLink(makeLink({ id: 'gl-revoked', token: 'tok-revoked' }));
    expect(resolveGuestToken('tok-revoked')).toBeDefined();
    revokeGuestLink('gl-revoked');
    expect(resolveGuestToken('tok-revoked')).toBeUndefined();
  });

  it('revokedAt cannot be unset: revoking twice keeps the original timestamp', () => {
    addGuestLink(makeLink({ id: 'gl-double-revoke', token: 'tok-double-revoke' }));
    const first = revokeGuestLink('gl-double-revoke');
    const second = revokeGuestLink('gl-double-revoke');
    expect(first?.revokedAt).not.toBeNull();
    expect(second?.revokedAt).toBe(first?.revokedAt);
  });

  it('the stored record never equals the plaintext token on any field', () => {
    addGuestLink(makeLink({ id: 'gl-no-plaintext', token: 'super-secret-plaintext-token' }));
    const stored = allGuestLinks().find((link) => link.id === 'gl-no-plaintext');
    expect(stored).toBeDefined();
    for (const value of Object.values(stored as unknown as Record<string, unknown>)) {
      expect(value).not.toBe('super-secret-plaintext-token');
    }
    expect(stored?.tokenHash).toBe(hashToken('super-secret-plaintext-token'));
  });
});

describe('guest-links: POST /api/submissions/:id/guest-links — allowed path', () => {
  it('a workspace member creates a link and gets the plaintext token exactly once, with no tokenHash in the body', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: {} });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateResponse;
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.link).not.toHaveProperty('tokenHash');
    expect(body.link.label).toBe('Guest reviewer');
    expect(body.link.revokedAt).toBeNull();
    expect(JSON.stringify(body.link)).not.toContain(body.token);
  });

  it('honours a caller-supplied label and a shorter expiresAt', async () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-olivia',
      body: { label: 'Acme Co.', expiresAt: soon },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateResponse;
    expect(body.link.label).toBe('Acme Co.');
    expect(body.link.expiresAt).toBe(soon);
  });

  it('defaults expiresAt to 7 days out when omitted', async () => {
    const before = Date.now();
    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: {} });
    const body = (await res.json()) as CreateResponse;
    const expiresMs = Date.parse(body.link.expiresAt);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThan(before + sevenDaysMs - 5000);
    expect(expiresMs).toBeLessThan(before + sevenDaysMs + 5000);
  });

  it('honours exactly the 30-day hard maximum', async () => {
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-olivia',
      body: { expiresAt: thirtyDays },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateResponse;
    expect(body.link.expiresAt).toBe(thirtyDays);
  });

  it('rejects an expiresAt beyond 30 days with 400', async () => {
    const tooFar = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-olivia',
      body: { expiresAt: tooFar },
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: { code: string } }).toMatchObject({ error: { code: 'bad_request' } });
  });

  it('rejects a past expiresAt with 400', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: { expiresAt: past } });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed expiresAt with 400', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-olivia',
      body: { expiresAt: 'not-a-date' },
    });
    expect(res.status).toBe(400);
  });
});

describe('guest-links: GET /api/submissions/:id/guest-links — allowed path, no secrets', () => {
  it('a member lists links for the submission without any token or tokenHash', async () => {
    const created = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: { label: 'List check' } });
    const { token } = (await created.json()) as CreateResponse;

    const res = await call('/api/submissions/s-ground-floor/guest-links', { as: 'u-sam' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { links: ReadonlyArray<Record<string, unknown>> };
    expect(body.links.length).toBeGreaterThan(0);
    for (const link of body.links) {
      expect(link).not.toHaveProperty('token');
      expect(link).not.toHaveProperty('tokenHash');
    }
    expect(JSON.stringify(body)).not.toContain(token);
  });
});

describe('guest-links: revoke — allowed path and idempotency', () => {
  it('a member revokes a link and the token stops resolving immediately', async () => {
    const created = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: {} });
    const { token, link } = (await created.json()) as CreateResponse;

    expect(resolveGuestToken(token)).toBeDefined();

    const revoked = await call(`/api/guest-links/${link.id}/revoke`, { method: 'POST', as: 'u-sam' });
    expect(revoked.status).toBe(200);

    expect(resolveGuestToken(token)).toBeUndefined();
  });

  it('revoking twice keeps revokedAt set and never errors or reveals extra state', async () => {
    const created = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: {} });
    const { link } = (await created.json()) as CreateResponse;

    const first = await call(`/api/guest-links/${link.id}/revoke`, { method: 'POST', as: 'u-olivia' });
    const firstBody = (await first.json()) as { link: { revokedAt: string | null } };
    expect(firstBody.link.revokedAt).not.toBeNull();

    const second = await call(`/api/guest-links/${link.id}/revoke`, { method: 'POST', as: 'u-olivia' });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { link: { revokedAt: string | null } };
    expect(secondBody.link.revokedAt).toBe(firstBody.link.revokedAt);
  });
});

describe('guest-links: denied paths (tenant isolation)', () => {
  it('u-rhea cannot create a link on w-north\'s submission — 404, nothing changed', async () => {
    const before = await call('/api/submissions/s-ground-floor/guest-links', { as: 'u-sam' });
    const beforeBody = await before.json();

    const denied = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-rhea', body: {} });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual(notFoundBody);

    const after = await call('/api/submissions/s-ground-floor/guest-links', { as: 'u-sam' });
    // Full deep-equality, not just a length comparison: catches a mutation of an existing
    // link (e.g. a stray revoke) that a count-only check would miss.
    expect(await after.json()).toEqual(beforeBody);
  });

  it("u-rhea cannot list w-north's links — 404", async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', { as: 'u-rhea' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });

  it("u-rhea cannot revoke a w-north link — 404, and it still resolves for the real owner's workspace", async () => {
    const created = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: {} });
    const { token, link } = (await created.json()) as CreateResponse;

    const denied = await call(`/api/guest-links/${link.id}/revoke`, { method: 'POST', as: 'u-rhea' });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual(notFoundBody);

    expect(resolveGuestToken(token)).toBeDefined();
  });

  it('revoke of a nonexistent link id and revoke of another tenant\'s link id return deep-equal 404 bodies', async () => {
    const created = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: {} });
    const { link } = (await created.json()) as CreateResponse;

    const otherTenant = await call(`/api/guest-links/${link.id}/revoke`, { method: 'POST', as: 'u-rhea' });
    const nonexistent = await call('/api/guest-links/gl-does-not-exist/revoke', { method: 'POST', as: 'u-rhea' });

    const otherTenantBody = await otherTenant.json();
    const nonexistentBody = await nonexistent.json();
    expect(otherTenant.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(otherTenantBody).toEqual(nonexistentBody);
    expect(nonexistentBody).toEqual(notFoundBody);
  });

  it('anti-enumeration on create: a cross-tenant submission id and a nonexistent submission id return deep-equal 404 bodies', async () => {
    const crossTenant = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-rhea', body: {} });
    const nonexistent = await call('/api/submissions/does-not-exist/guest-links', { method: 'POST', as: 'u-rhea', body: {} });
    const crossTenantBody = await crossTenant.json();
    const nonexistentBody = await nonexistent.json();
    expect(crossTenant.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(crossTenantBody).toEqual(nonexistentBody);
    expect(nonexistentBody).toEqual(notFoundBody);
  });

  it('anti-enumeration on list: a cross-tenant submission id and a nonexistent submission id return deep-equal 404 bodies', async () => {
    const crossTenant = await call('/api/submissions/s-ground-floor/guest-links', { as: 'u-rhea' });
    const nonexistent = await call('/api/submissions/does-not-exist/guest-links', { as: 'u-rhea' });
    const crossTenantBody = await crossTenant.json();
    const nonexistentBody = await nonexistent.json();
    expect(crossTenant.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(crossTenantBody).toEqual(nonexistentBody);
    expect(nonexistentBody).toEqual(notFoundBody);
  });

  it('anonymous (no credentials at all) is refused with 401, not 404', async () => {
    const create = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', body: {} });
    expect(create.status).toBe(401);
    const list = await call('/api/submissions/s-ground-floor/guest-links');
    expect(list.status).toBe(401);
  });
});

describe('guest-links: denied paths — a guest grant on the three management routes (AC-S2 end to end)', () => {
  it('a valid guest grant cannot create, list or revoke a link — all three 404, and nothing changes', async () => {
    const created = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: { label: 'Guest-denied fixture' } });
    const { token, link } = (await created.json()) as CreateResponse;

    const before = await call('/api/submissions/s-ground-floor/guest-links', { as: 'u-sam' });
    const beforeBody = await before.json();

    const createDenied = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', guest: token, body: {} });
    expect(createDenied.status).toBe(404);
    expect(await createDenied.json()).toEqual(notFoundBody);

    const listDenied = await call('/api/submissions/s-ground-floor/guest-links', { guest: token });
    expect(listDenied.status).toBe(404);
    expect(await listDenied.json()).toEqual(notFoundBody);

    const revokeDenied = await call(`/api/guest-links/${link.id}/revoke`, { method: 'POST', guest: token });
    expect(revokeDenied.status).toBe(404);
    expect(await revokeDenied.json()).toEqual(notFoundBody);

    // Nothing created, nothing revoked: the collection as a member sees it is unchanged,
    // and the original link's own token still resolves (it was never revoked).
    const after = await call('/api/submissions/s-ground-floor/guest-links', { as: 'u-sam' });
    expect(await after.json()).toEqual(beforeBody);
    expect(resolveGuestToken(token)).toBeDefined();
  });

  it('a guest grant scoped to a different submission is denied on all three routes', async () => {
    const created = await call('/api/submissions/s-mill-facade/guest-links', { method: 'POST', as: 'u-rhea', body: { label: 'Wrong-submission fixture' } });
    const { token } = (await created.json()) as CreateResponse;

    const createDenied = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', guest: token, body: {} });
    expect(createDenied.status).toBe(404);
    const listDenied = await call('/api/submissions/s-ground-floor/guest-links', { guest: token });
    expect(listDenied.status).toBe(404);
  });

  it('confused-deputy: a valid guest token plus a legitimate owner x-user-id is still denied, never re-judged as a member', async () => {
    const created = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: { label: 'Confused-deputy fixture' } });
    const { token } = (await created.json()) as CreateResponse;

    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', guest: token, as: 'u-olivia', body: {} });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });
});

describe('guest-links: ADR-0003 §A step 1 — body-supplied identifiers are rejected, not ignored', () => {
  it('a workspaceId in the body is rejected with 400', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-olivia',
      body: { workspaceId: 'w-south' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: { code: string } }).toMatchObject({ error: { code: 'bad_request' } });
  });

  it('a submissionId in the body is rejected with 400', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-olivia',
      body: { submissionId: 's-mill-facade' },
    });
    expect(res.status).toBe(400);
  });

  it('authorization precedes body validation: a denied caller with an invalid body still gets 404, not 400', async () => {
    // u-rhea is not a member of w-north. If body parsing/validation ever moved ahead of the
    // ADR-0003 §A step-4 authorization gate, this would start returning 400 instead.
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-rhea',
      body: { expiresAt: 'not-a-date' },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
  });
});

describe('guest-links: request body hygiene (null, malformed, and oversized input)', () => {
  it('a literal null JSON body returns 400, not an unhandled 500', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: null });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: { code: string } }).toMatchObject({ error: { code: 'bad_request' } });
  });

  it('an array JSON body returns 400', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: [] });
    expect(res.status).toBe(400);
  });

  it('a primitive JSON body returns 400', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: 'not-an-object' });
    expect(res.status).toBe(400);
  });

  it('a label beyond the length cap is rejected with 400', async () => {
    const res = await call('/api/submissions/s-ground-floor/guest-links', {
      method: 'POST',
      as: 'u-olivia',
      body: { label: 'x'.repeat(121) },
    });
    expect(res.status).toBe(400);
  });

  it('a label exactly at the length cap is accepted', async () => {
    const label = 'x'.repeat(120);
    const res = await call('/api/submissions/s-ground-floor/guest-links', { method: 'POST', as: 'u-olivia', body: { label } });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateResponse;
    expect(body.link.label).toBe(label);
  });
});

describe('guest-links: no PATCH/PUT/DELETE route exists on any guest-link path', () => {
  const methods = ['PATCH', 'PUT', 'DELETE'] as const;
  const paths = [
    '/api/submissions/s-ground-floor/guest-links',
    '/api/guest-links/gl-whatever/revoke',
    '/api/guest-links/gl-whatever',
  ];

  for (const path of paths) {
    for (const method of methods) {
      it(`${method} ${path} -> 404`, async () => {
        const res = await call(path, { method, as: 'u-olivia' });
        expect(res.status).toBe(404);
      });
    }
  }
});
