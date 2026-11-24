import { Hono } from 'hono';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import { call } from '../helpers.js';
import { requireMember, USER_HEADER } from '../../src/core/auth.js';
import { assetVersions, findAssetVersion, versionsOf } from '../../src/core/store.js';

describe('core', () => {
  it('reports health', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('lets a workspace member read a submission (allowed path)', async () => {
    const res = await call('/api/submissions/s-ground-floor', { as: 'u-sam' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { versions: unknown[] };
    expect(body.versions).toHaveLength(1);
  });

  it('refuses a member of another workspace (denied path)', async () => {
    const res = await call('/api/submissions/s-ground-floor', { as: 'u-rhea' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });

  it('refuses an anonymous caller', async () => {
    const res = await call('/api/submissions/s-ground-floor');
    expect(res.status).toBe(401);
  });
});

describe('auth: requireMember role gate (403 stays reserved for role denials)', () => {
  it('a non-owner member is denied a workspace-owner action with 403, not 401 or 404', async () => {
    const app = new Hono();
    app.get('/t', (c: Context) => {
      requireMember(c, 'w-north', 'owner');
      return c.json({ ok: true });
    });
    const response = await app.request('/t', { headers: { [USER_HEADER]: 'u-sam' } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: 'forbidden', message: 'Only workspace owners can do this' } });
  });

  it('the workspace owner passes the same gate (allowed path)', async () => {
    const app = new Hono();
    app.get('/t', (c: Context) => {
      const role = requireMember(c, 'w-north', 'owner');
      return c.json({ role });
    });
    const response = await app.request('/t', { headers: { [USER_HEADER]: 'u-olivia' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'owner' });
  });
});

describe('store: asset version helpers', () => {
  it('findAssetVersion finds an existing version by id and returns undefined for an unknown one', () => {
    expect(findAssetVersion('v-ground-1')?.id).toBe('v-ground-1');
    expect(findAssetVersion('does-not-exist')).toBeUndefined();
  });

  it('versionsOf returns versions ascending by number, not insertion order', () => {
    // The seed has exactly one version per submission, which a reversed comparator would
    // also pass. Insert a higher number first and a lower number second, so only a
    // correct ascending sort produces [1, 2, 3] here.
    assetVersions.push(
      { id: 'v-mill-3', submissionId: 's-mill-facade', number: 3, title: 'Facade study, v3', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-03T00:00:00.000Z' },
      { id: 'v-mill-2', submissionId: 's-mill-facade', number: 2, title: 'Facade study, v2', imageUrl: '/assets/ground-floor-v1.svg', createdAt: '2026-11-02T00:00:00.000Z' },
    );
    const versions = versionsOf('s-mill-facade');
    expect(versions.map((v) => v.number)).toEqual([1, 2, 3]);
    expect(versions.map((v) => v.id)).toEqual(['v-mill-1', 'v-mill-2', 'v-mill-3']);
  });
});
