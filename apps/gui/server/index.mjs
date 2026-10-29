#!/usr/bin/env node
// Entry point. Importing this module only exposes the API; the CLI runs when the file is executed directly:
//   node apps/gui/server/index.mjs [--config gui.json | --base <dir>] [--port N] [--host H]
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { startServer } from './app.mjs';
import { envFileWarning } from './envfile.mjs';

export { startServer, loadConfig, envFileWarning };
/** Where the built front lives (apps/gui/dist). */
export const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { config: { type: 'string' }, base: { type: 'string' }, port: { type: 'string' }, host: { type: 'string' } } });
  const config = loadConfig({ file: values.config, base: values.base, host: values.host, port: values.port ? Number(values.port) : undefined });
  const srv = await startServer({ config, staticDir: existsSync(DIST_DIR) ? DIST_DIR : undefined });
  console.log(`archlens GUI: ${srv.url}`);
}
