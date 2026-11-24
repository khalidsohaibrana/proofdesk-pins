import { describe, expect, it } from 'vitest';
import { call } from '../helpers.js';

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
