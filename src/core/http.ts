// Consistent JSON errors: { error: { code, message } }.
import { HTTPException } from 'hono/http-exception';

const fail = (status: 400 | 401 | 403 | 404 | 409 | 410, code: string, message: string) =>
  new HTTPException(status, { res: new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'content-type': 'application/json' } }) });

export const badRequest = (message: string) => fail(400, 'bad_request', message);
export const unauthorized = () => fail(401, 'unauthorized', 'Sign in required');
export const forbidden = (message = 'Not found') => fail(403, 'forbidden', message);
export const notFound = (message = 'Not found') => fail(404, 'not_found', message);
export const conflict = (message: string) => fail(409, 'conflict', message);
export const gone = (message: string) => fail(410, 'gone', message);
