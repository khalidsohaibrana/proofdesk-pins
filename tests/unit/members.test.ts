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

describe('members', () => {
  it('lets any member of the workspace list the members (allowed path)', async () => {
    const res = await call('/api/workspaces/w-north/members', { as: 'u-sam' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: MemberView[] };
    expect(body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'u-olivia', name: 'Olivia Hart', email: 'olivia@northstudio.test', role: 'owner' }),
        expect.objectContaining({ id: 'u-sam', name: 'Sam Patel', email: 'sam@northstudio.test', role: 'member' }),
      ]),
    );
  });

  // Written as one test, not two independent `it`s, so the narrative ("denied before she
  // is added, then an owner adds her, then she can read") stays true under
  // `--sequence.shuffle`: shuffle reorders tests and files, never statements inside one.
  it('a non-member is denied, then an owner adds them, and the list then contains them', async () => {
    const deniedGet = await call('/api/workspaces/w-north/members', { as: 'u-rhea' });
    expect(deniedGet.status).toBe(404);
    expect(await deniedGet.json()).toEqual(notFoundBody);

    const deniedPost = await call('/api/workspaces/w-north/members', {
      as: 'u-rhea',
      method: 'POST',
      body: { userId: 'u-sam', role: 'member' },
    });
    expect(deniedPost.status).toBe(404);
    expect(await deniedPost.json()).toEqual(notFoundBody);

    const added = await call('/api/workspaces/w-north/members', {
      as: 'u-olivia',
      method: 'POST',
      body: { userId: 'u-rhea', role: 'member' },
    });
    expect(added.status).toBe(201);
    const addedBody = (await added.json()) as { members: MemberView[] };
    expect(addedBody.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'u-rhea', name: 'Rhea Okafor', role: 'member' })]),
    );

    const afterGet = await call('/api/workspaces/w-north/members', { as: 'u-rhea' });
    expect(afterGet.status).toBe(200);
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
});
