#!/usr/bin/env node
// Entry point: node apps/gui/server/index.mjs [--config gui.json | --base <dir>] [--port N]
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { startServer } from './app.mjs';

const { values } = parseArgs({ options: { config: { type: 'string' }, base: { type: 'string' }, port: { type: 'string' } } });
const config = loadConfig({ file: values.config, base: values.base, port: values.port ? Number(values.port) : undefined });
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../web/dist');
const srv = await startServer({ config, staticDir: existsSync(dist) ? dist : undefined });
console.log(`archlens GUI em ${srv.url}`);
