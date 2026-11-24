// Test helpers: call the app in-process as a given user and/or guest.
import { createApp } from '../src/app.js';
import { USER_HEADER } from '../src/core/auth.js';
import { GUEST_HEADER } from '../src/core/access.js';

const appPromise = createApp();

export async function call(
  path: string,
  init: { method?: string; as?: string; guest?: string; body?: unknown } = {},
): Promise<Response> {
  const app = await appPromise;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // Presence, not truthiness: an explicitly passed empty string must still send the
  // header (tests exercise "header present but empty"), only an absent key sends none.
  if (init.as !== undefined) headers[USER_HEADER] = init.as;
  if (init.guest !== undefined) headers[GUEST_HEADER] = init.guest;
  return app.request(path, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}
