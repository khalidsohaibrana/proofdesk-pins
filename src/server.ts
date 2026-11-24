import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const app = await createApp();
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => process.stdout.write(`proofdesk-pins on http://127.0.0.1:${port}\n`));
