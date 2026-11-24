// Test helpers: call the app in-process as a given user.
import { createApp } from '../src/app.js';
import { USER_HEADER } from '../src/core/auth.js';

const appPromise = createApp();

export async function call(path: string, init: { method?: string; as?: string; body?: unknown } = {}): Promise<Response> {
  const app = await appPromise;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.as) headers[USER_HEADER] = init.as;
  return app.request(path, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}
