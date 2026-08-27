#!/usr/bin/env node
/**
 * Copies `package.json`'s version into `mcp.config.json`.
 *
 * Wired to npm's `version` lifecycle script, which runs after the bump and
 * before the release commit — so `npm version minor` updates both files and
 * commits them together. `publish.yml` still checks the two agree, as a net
 * rather than a chore.
 *
 * Without this, the version reported in the MCP handshake drifts from the
 * published package, and the mismatch is invisible until someone tries to
 * reproduce a bug against "the version the server said it was".
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const configPath = resolve(root, 'mcp.config.json');
const raw = await readFile(configPath, 'utf8');
const config = JSON.parse(raw);

if (config.server.version === pkg.version) {
    console.error(`[sync-version] already ${pkg.version}`);
    process.exit(0);
}

const previous = config.server.version;
config.server.version = pkg.version;
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.error(`[sync-version] mcp.config.json ${previous} -> ${pkg.version}`);

// Stage it so `npm version` includes it in the release commit. Harmless outside
// a repo or when run by hand — a failure here is not worth aborting the bump.
try {
    execFileSync('git', ['add', 'mcp.config.json'], { cwd: root, stdio: 'ignore' });
} catch {
    console.error('[sync-version] could not stage mcp.config.json; commit it yourself');
}
