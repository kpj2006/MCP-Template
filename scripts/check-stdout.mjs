#!/usr/bin/env node
/**
 * Fails the build if anything under `src/` can write to stdout.
 *
 * On stdio transport, stdout *is* the JSON-RPC framing. One `console.log` lands
 * mid-frame, the client's parser gives up, and the user sees an opaque
 * "server disconnected" with nothing pointing at the cause. It is the single
 * most common way a working MCP server appears broken, and it is trivially
 * preventable — so it is a build gate rather than a code-review convention.
 *
 * A linter could enforce this too; a 60-line check keeps the template free of an
 * entire lint toolchain for the one rule that actually matters here.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src');

/** `console.error` and `process.stderr` are fine — stderr is not the protocol. */
const BANNED = [
    { pattern: /\bconsole\s*\.\s*(log|info|debug|dir|table|trace|group|count|time(End|Log)?)\b/, what: 'console write to stdout' },
    { pattern: /\bprocess\s*\.\s*stdout\b/, what: 'direct process.stdout access' },
    { pattern: /\bconsole\s*\.\s*warn\b/, what: 'console.warn (use the logger, so the level is respected)' }
];

/** The logger owns the one sanctioned stderr write. */
const EXEMPT = new Set(['core/logger.ts']);

async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else if (['.ts', '.mts', '.js', '.mjs'].includes(extname(entry.name))) out.push(full);
    }
    return out;
}

const violations = [];

for (const file of await walk(SRC)) {
    const rel = relative(SRC, file).split(/[\\/]/).join('/');
    if (EXEMPT.has(rel) || rel.startsWith('generated/')) continue;

    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
        // Skip comments, so prose about `console.log` does not trip the gate.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        for (const { pattern, what } of BANNED) {
            if (pattern.test(code)) {
                violations.push(`src/${rel}:${index + 1}  ${what}\n      ${line.trim()}`);
            }
        }
    });
}

if (violations.length) {
    console.error(`\n[stdout-guard] ${violations.length} violation(s):\n`);
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(
        '\n[stdout-guard] stdout carries the JSON-RPC stream on stdio transport.\n' +
            '               Route diagnostics through `log` in src/core/logger.ts instead.\n'
    );
    process.exit(1);
}

console.error('[stdout-guard] clean — nothing in src/ writes to stdout');
