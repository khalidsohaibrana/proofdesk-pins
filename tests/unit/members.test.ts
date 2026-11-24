import { describe, expect, it } from 'vitest';
import { call } from '../helpers.js';

interface MemberView {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

const notFoundBody: ErrorBody = { error: { code: 'not_found', message: 'Not found' } };

async function memberIds(workspaceId: string, as: string): Promise<string[]> {
  const res = await call(`/api/workspaces/${workspaceId}/members`, { as });
  const body = (await res.json()) as { members: MemberView[] };
  return body.members.map((member) => member.id);
}

describe('members', () => {
  // One test, not several independent `it`s, so the full narrative — exact initial list,
  // both denials proving nothing changed, the owner's add, and the exact resulting list —
  // stays true under `--sequence.shuffle`: shuffle reorders tests and files, never the
  // statements inside one `it`. This is also where ADR-0003 §A's mandatory "a follow-up
  // read as the legitimate member proves nothing changed" assertion lives for both denials.
  it('lists exactly the workspace members, a non-member is denied with nothing changed, then an owner adds one and the list reflects exactly that', async () => {
    // Exact list, not expect.arrayContaining: a members-of-the-workspace implementation
    // that dropped its tenant filter and returned every membership in the system would
    // still pass an arrayContaining check against these two names, but fails an exact
    // id-set comparison the moment a third id shows up.
    expect(await memberIds('w-north', 'u-sam')).toEqual(['u-olivia', 'u-sam']);

    // Denied GET: u-rhea is not a member of w-north.
    const deniedGet = await call('/api/workspaces/w-north/members', { as: 'u-rhea' });
    expect(deniedGet.status).toBe(404);
    expect(await deniedGet.json()).toEqual(notFoundBody);
    // Mandatory follow-up read (ADR-0003 §A): the denial must not have changed anything.
    expect(await memberIds('w-north', 'u-sam')).toEqual(['u-olivia', 'u-sam']);

    // Denied POST: u-rhea attempts to add herself — not an already-existing member of
    // w-north, so a leaked write would be directly observable in the follow-up read below.
    // (Posting an already-member userId here, as an earlier version of this test did,
    // would hit the 409 branch and write nothing even with the tenancy gate removed —
    // the exact gap this round's review found.)
    const deniedPost = await call('/api/workspaces/w-north/members', {
      as: 'u-rhea',
      method: 'POST',
      body: { userId: 'u-rhea', role: 'member' },
    });
    expect(deniedPost.status).toBe(404);
    expect(await deniedPost.json()).toEqual(notFoundBody);
    // Mandatory follow-up read: still nothing changed.
    expect(await memberIds('w-north', 'u-sam')).toEqual(['u-olivia', 'u-sam']);

    // Allowed path: the real owner adds her.
    const added = await call('/api/workspaces/w-north/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-rhea', role: 'member' },
    });
    expect(added.status).toBe(201);
    const addedBody = (await added.json()) as { members: MemberView[] };
    expect(addedBody.members.map((member) => member.id)).toEqual(['u-olivia', 'u-sam', 'u-rhea']);
    expect(addedBody.members.find((member) => member.id === 'u-rhea')).toEqual({
      id: 'u-rhea',
      name: 'Rhea Okafor',
      email: 'rhea@southarch.test',
      role: 'member',
    });

    // The newly added member can now read the list herself.
    expect(await memberIds('w-north', 'u-rhea')).toEqual(['u-olivia', 'u-sam', 'u-rhea']);
  });

  // Defends the tenant filter from the other direction: w-south's own membership is never
  // touched by any other test in this file (nothing here ever adds to w-south), so this
  // exact assertion is safe regardless of test order. A membersOf that returned every
  // membership in the system — not just this workspace's — would include u-olivia and
  // u-sam here, since they exist in the shared `users`/`memberships` arrays.
  it('lists exactly the w-south members and never includes a w-north-only user (tenant filter, not a superset)', async () => {
    const res = await call('/api/workspaces/w-south/members', { as: 'u-rhea' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: MemberView[] };
    expect(body.members.map((member) => member.id)).toEqual(['u-rhea']);
    expect(body.members.some((member) => member.id === 'u-sam' || member.id === 'u-olivia')).toBe(false);
  });

  it('refuses a member who is not an owner on POST with 403, not 401 or 404', async () => {
    const res = await call('/api/workspaces/w-north/members', {
      as: 'u-sam',
      method: 'POST',
      body: { userId: 'u-olivia', role: 'member' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'forbidden', message: 'Only workspace owners can do this' } });
  });

  it('a nonexistent workspace id returns 404 identical to the cross-tenant case, for GET and POST', async () => {
    const getRes = await call('/api/workspaces/w-does-not-exist/members', { as: 'u-olivia' });
    expect(getRes.status).toBe(404);
    expect(await getRes.json()).toEqual(notFoundBody);

    const postRes = await call('/api/workspaces/w-does-not-exist/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-sam', role: 'member' },
    });
    expect(postRes.status).toBe(404);
    expect(await postRes.json()).toEqual(notFoundBody);
  });

  it('refuses an anonymous caller (no x-user-id) with 401, for GET and POST', async () => {
    const getRes = await call('/api/workspaces/w-north/members');
    expect(getRes.status).toBe(401);

    const postRes = await call('/api/workspaces/w-north/members', { method: 'POST', body: { userId: 'u-sam', role: 'member' } });
    expect(postRes.status).toBe(401);
  });

  it('rejects a body that redundantly carries workspaceId with 400 (ADR-0003 §A step 1)', async () => {
    const res = await call('/api/workspaces/w-north/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-sam', role: 'member', workspaceId: 'w-north' },
    });
    expect(res.status).toBe(400);
    expect((await (res.json() as Promise<ErrorBody>)).error.code).toBe('bad_request');
  });

  it('rejects an unknown userId with 400', async () => {
    const res = await call('/api/workspaces/w-north/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-does-not-exist', role: 'member' },
    });
    expect(res.status).toBe(400);
    expect((await (res.json() as Promise<ErrorBody>)).error.code).toBe('bad_request');
  });

  it('rejects an invalid role and a missing role, both with 400', async () => {
    const invalidRole = await call('/api/workspaces/w-north/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-sam', role: 'admin' },
    });
    expect(invalidRole.status).toBe(400);

    const missingRole = await call('/api/workspaces/w-north/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-sam' },
    });
    expect(missingRole.status).toBe(400);
  });

  it('returns 400, not 500, when the request body is a literal JSON null', async () => {
    // c.req.json() resolves (does not throw) for `null` — a valid JSON value — so the
    // .catch(() => {}) fallback never fires and property access on `null` used to throw,
    // surfacing as an uncaught 500 with a text/plain body instead of the error envelope.
    const res = await call('/api/workspaces/w-north/members', { as: 'u-olivia', method: 'POST', body: null });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'bad_request', message: 'userId is required' } });
  });

  it('rejects adding a user who is already a member with 409, and does not create a duplicate row', async () => {
    const res = await call('/api/workspaces/w-north/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-sam', role: 'member' },
    });
    expect(res.status).toBe(409);
    expect((await (res.json() as Promise<ErrorBody>)).error.code).toBe('conflict');

    const list = await call('/api/workspaces/w-north/members', { as: 'u-olivia' });
    const body = (await list.json()) as { members: MemberView[] };
    expect(body.members.filter((member) => member.id === 'u-sam')).toHaveLength(1);
  });

  it('has no PATCH, PUT or DELETE route for members, on the collection or a member path', async () => {
    for (const method of ['PATCH', 'PUT', 'DELETE'] as const) {
      const collection = await call('/api/workspaces/w-north/members', { method });
      expect(collection.status).toBe(404);

      const member = await call('/api/workspaces/w-north/members/u-sam', { method });
      expect(member.status).toBe(404);
    }
  });

  describe('authorizes before parsing the body (ADR-0003 §A step order)', () => {
    // Swapping `requireMember(...)` and `c.req.json()` in the route would pass every other
    // test in this file, because every denied-path request above happens to send a
    // well-formed body. These two send a body that would itself produce a 400 if it were
    // parsed and validated first, and assert the authorization outcome wins anyway.

    it('a non-owner member still gets 403, not 400, for a body with an invalid role and a missing userId', async () => {
      const res = await call('/api/workspaces/w-north/members', {
        as: 'u-sam',
        method: 'POST',
        body: { role: 'admin' },
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: 'forbidden', message: 'Only workspace owners can do this' } });
    });

    it('a non-member still gets 404, not 400, for a malformed body that redundantly sets workspaceId', async () => {
      // u-sam is a member of w-north, never of w-south, and no test in this file ever
      // adds him there — unlike u-rhea, who the narrative test above does add to w-north,
      // this choice stays a true non-member case regardless of test execution order.
      const res = await call('/api/workspaces/w-south/members', {
        as: 'u-sam',
        method: 'POST',
        body: { workspaceId: 'w-north', role: 123, userId: null },
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody);
    });
  });
});
