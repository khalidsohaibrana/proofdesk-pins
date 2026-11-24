// App composition. Each feature lives in src/modules/<name>/index.ts and exports `register`.
// Modules are discovered automatically, so parallel tickets never edit a shared routes file.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

export type ModuleRegister = (app: Hono) => void;

const MODULES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'modules');

export async function createApp(): Promise<Hono> {
  const app = new Hono();
  const names = readdirSync(MODULES_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const name of names) {
    const mod = (await import(pathToFileURL(join(MODULES_DIR, name, 'index.ts')).href)) as { register?: ModuleRegister };
    if (typeof mod.register !== 'function') throw new Error(`Module "${name}" must export register(app)`);
    mod.register(app);
  }
  app.use('/*', serveStatic({ root: './public' }));
  return app;
}
