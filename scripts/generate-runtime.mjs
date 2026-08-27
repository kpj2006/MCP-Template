#!/usr/bin/env node
/**
 * Compiles `mcp.config.json` and `catalog/snapshot.json` into
 * `src/generated/runtime.ts`.
 *
 * Why codegen rather than reading the files at runtime: an installed package can
 * be executed from `dist/` via npx, from a global install, or bundled into a
 * Worker, and each of those resolves relative paths differently. Baking the two
 * inputs into a module removes the entire class of "works locally, empty in
 * production" path bugs, and makes the snapshot genuinely bundled rather than a
 * file that has to survive `files` in package.json.
 *
 * Runs automatically via `prebuild` and `prepare`. Run by hand with `npm run gen`.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'src/generated/runtime.ts');

const EMPTY_CATALOG = { version: 1, categories: [], items: [] };

/** `$comment` keys document the config for humans; strip them from the build. */
function stripComments(value) {
    if (Array.isArray(value)) return value.map(stripComments);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !key.startsWith('$'))
                .map(([key, inner]) => [key, stripComments(inner)])
        );
    }
    return value;
}

async function readJson(path, fallback) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
        if (fallback !== undefined && err.code === 'ENOENT') {
            console.error(`[gen] ${path} not found, using fallback`);
            return fallback;
        }
        throw new Error(`[gen] could not read ${path}: ${err.message}`);
    }
}

const REQUIRED = [
    ['server', 'name'],
    ['server', 'version'],
    ['catalog', 'url'],
    ['naming', 'itemNoun'],
    ['naming', 'itemNounPlural'],
    ['limits', 'searchDefaultLimit'],
    ['limits', 'searchMaxLimit'],
    ['limits', 'summaryMaxChars'],
    ['limits', 'contentMaxChars'],
    ['resources', 'enabled'],
    ['resources', 'uriScheme']
];

function assertShape(config) {
    const missing = REQUIRED.filter(([section, key]) => config?.[section]?.[key] === undefined).map(
        path => path.join('.')
    );
    if (missing.length) {
        throw new Error(
            `[gen] mcp.config.json is missing required field(s): ${missing.join(', ')}\n` +
                '      See docs/ONBOARDING.md for the full shape.'
        );
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(config.server.name)) {
        throw new Error(`[gen] server.name "${config.server.name}" must be lowercase and URL-safe.`);
    }
    if (!/^[a-z][a-z0-9+.-]*$/.test(config.resources.uriScheme)) {
        throw new Error(`[gen] resources.uriScheme "${config.resources.uriScheme}" is not a valid URI scheme.`);
    }
}

const config = stripComments(await readJson(resolve(root, 'mcp.config.json')));
assertShape(config);

const snapshot = await readJson(resolve(root, 'catalog/snapshot.json'), EMPTY_CATALOG);

const banner = `/**
 * AUTO-GENERATED — DO NOT EDIT.
 *
 * Written by scripts/generate-runtime.mjs from:
 *   - mcp.config.json
 *   - catalog/snapshot.json
 *
 * Edit those, then run \`npm run gen\`.
 */`;

const body = `${banner}
import type { Catalog, McpTemplateConfig } from '../core/types.js';

export const CONFIG: McpTemplateConfig = ${JSON.stringify(config, null, 4)};

/**
 * Offline fallback. If the catalog host is unreachable the server degrades to
 * this instead of failing — stale but working beats dead. CI refreshes it on
 * release so it is never more than one version behind.
 */
export const SNAPSHOT: Catalog = ${JSON.stringify(snapshot, null, 4)};
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body, 'utf8');

console.error(
    `[gen] wrote src/generated/runtime.ts — server "${config.server.name}" v${config.server.version}, ` +
        `snapshot ${snapshot.items?.length ?? 0} item(s)`
);
