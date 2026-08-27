#!/usr/bin/env node
/**
 * Builds `catalog/dist/catalog.json` from `catalog/catalog.meta.json` plus every
 * Markdown file under `catalog/sources/**`.
 *
 * One file is one catalog entry. Front matter supplies metadata; everything
 * after it is the body. Directory names under `sources/` become the category
 * when front matter omits one.
 *
 *   node scripts/build-catalog.mjs              # build + validate
 *   node scripts/build-catalog.mjs --snapshot   # also refresh catalog/snapshot.json
 *   node scripts/build-catalog.mjs --check      # validate only, write nothing
 *
 * Zero dependencies on purpose: this runs in CI on a schedule, and a dependency
 * here is a supply-chain surface for something that only reads local files.
 */
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = resolve(root, 'catalog/sources');
const OUT_DIR = resolve(root, 'catalog/dist');
const CONTRACT_VERSION = 1;

const args = new Set(process.argv.slice(2));
const writeSnapshot = args.has('--snapshot');
const checkOnly = args.has('--check');

/* ------------------------------------------------------------------ helpers */

const unquote = value => value.replace(/^['"]|['"]$/g, '').trim();

/**
 * Front matter parser covering the subset this format needs: `key: value`,
 * inline lists (`tags: [a, b]`) and block lists (`- item`). A YAML library would
 * accept more, but more is not wanted here — a catalog entry whose front matter
 * needs anchors or nested maps is a sign the data belongs in `metadata`.
 */
function parseFrontMatter(raw) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    if (!match) return { data: {}, body: raw.trim() };

    const data = {};
    let currentListKey = null;

    for (const line of match[1].split(/\r?\n/)) {
        if (!line.trim() || line.trimStart().startsWith('#')) continue;

        const listItem = /^\s*-\s+(.*)$/.exec(line);
        if (listItem && currentListKey) {
            data[currentListKey].push(unquote(listItem[1]));
            continue;
        }

        const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (!pair) continue;
        const [, key, rawValue] = pair;
        const value = rawValue.trim();

        if (value === '') {
            currentListKey = key;
            data[key] = [];
        } else if (value.startsWith('[') && value.endsWith(']')) {
            currentListKey = null;
            data[key] = value
                .slice(1, -1)
                .split(',')
                .map(part => unquote(part.trim()))
                .filter(Boolean);
        } else {
            currentListKey = null;
            data[key] = unquote(value);
        }
    }

    return { data, body: raw.slice(match[0].length).trim() };
}

async function walk(dir) {
    const found = [];
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return found;
        throw err;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...(await walk(full)));
        else if (['.md', '.markdown', '.txt'].includes(extname(entry.name).toLowerCase())) found.push(full);
    }
    return found.sort();
}

const slugify = value =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

/** First sentence of the body, as a last resort when front matter omits a summary. */
function deriveSummary(body) {
    const firstParagraph = body
        .split(/\r?\n\r?\n/)
        .map(block => block.trim())
        .find(block => block && !block.startsWith('#') && !block.startsWith('```'));
    if (!firstParagraph) return '';
    const flat = firstParagraph.replace(/\s+/g, ' ');
    const sentence = /^(.{0,300}?[.!?])(\s|$)/.exec(flat);
    return (sentence ? sentence[1] : flat.slice(0, 300)).trim();
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

/* -------------------------------------------------------------------- build */

const meta = JSON.parse(await readFile(resolve(root, 'catalog/catalog.meta.json'), 'utf8'));
const categories = (meta.categories ?? []).map(({ id, name, description }) => ({
    id,
    name,
    ...(description ? { description } : {})
}));
const categoryIds = new Set(categories.map(c => c.id));

const files = await walk(SOURCES);
const errors = [];
const warnings = [];
const seenIds = new Map();
const items = [];

for (const file of files) {
    const rel = relative(SOURCES, file);
    const { data, body } = parseFrontMatter(await readFile(file, 'utf8'));

    const id = data.id || slugify(basename(file, extname(file)));
    const title = data.title || basename(file, extname(file));
    const summary = data.summary || deriveSummary(body);
    const segments = rel.split(sep);
    const category = data.category || (segments.length > 1 ? segments[0] : undefined);

    if (seenIds.has(id)) {
        errors.push(`duplicate id "${id}" in ${rel} (already used by ${seenIds.get(id)})`);
    }
    seenIds.set(id, rel);

    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(id)) {
        errors.push(`${rel}: id "${id}" is not URL-safe`);
    }
    if (!summary) {
        // Search returns summaries; without one the entry is indexed but a model
        // has nothing to choose it by, so treat this as a build failure.
        errors.push(`${rel}: no summary — add a \`summary:\` line to the front matter`);
    }
    if (category && !categoryIds.has(category)) {
        errors.push(
            `${rel}: category "${category}" is not declared in catalog.meta.json ` +
                `(declared: ${[...categoryIds].join(', ') || 'none'})`
        );
    }
    if (!body) warnings.push(`${rel}: empty body`);

    const known = new Set(['id', 'title', 'summary', 'category', 'tags', 'url']);
    const metadata = Object.fromEntries(Object.entries(data).filter(([key]) => !known.has(key)));

    items.push({
        id,
        title,
        summary,
        ...(category ? { category } : {}),
        tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
        ...(data.url ? { url: data.url } : {}),
        content: body,
        ...(Object.keys(metadata).length ? { metadata } : {})
    });
}

for (const warning of warnings) console.error(`[catalog] warn: ${warning}`);

if (errors.length) {
    console.error(`\n[catalog] ${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error('\n[catalog] refusing to build — each of these would surface as a broken tool result.');
    process.exit(1);
}

for (const category of categories) {
    if (!items.some(item => item.category === category.id)) {
        console.error(`[catalog] warn: category "${category.id}" is declared but empty`);
    }
}

const catalog = {
    $schema: './catalog.schema.json',
    version: CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    ...(meta.project ? { project: meta.project } : {}),
    categories,
    items
};

console.error(
    `[catalog] ${items.length} item(s), ${categories.length} categor(ies), ` +
        `${(JSON.stringify(catalog).length / 1024).toFixed(1)} KiB`
);

if (checkOnly) {
    console.error('[catalog] --check passed, nothing written');
    process.exit(0);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(resolve(OUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
await copyFile(resolve(root, 'catalog/catalog.schema.json'), resolve(OUT_DIR, 'catalog.schema.json'));

// A landing page, so the Pages URL is not a bare 404 for a human who visits it.
const landing = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(meta.project?.name ?? 'MCP catalog')}</title>`,
    '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem}' +
        'code{background:#eee;padding:.1em .3em;border-radius:3px}</style>',
    `<h1>${escapeHtml(meta.project?.name ?? 'MCP catalog')}</h1>`,
    `<p>${escapeHtml(meta.project?.description ?? '')}</p>`,
    '<p>This is the data backend for an MCP server. It serves static JSON &mdash; it is not itself an MCP endpoint.</p>',
    '<ul>',
    `  <li><a href="./catalog.json">catalog.json</a> &mdash; ${items.length} entr(ies), built ${catalog.generatedAt}</li>`,
    '  <li><a href="./catalog.schema.json">catalog.schema.json</a> &mdash; the contract</li>',
    '</ul>',
    ''
].join('\n');
await writeFile(resolve(OUT_DIR, 'index.html'), landing, 'utf8');

// Pages otherwise runs the output through Jekyll, which drops files starting with `_`.
await writeFile(resolve(OUT_DIR, '.nojekyll'), '', 'utf8');

console.error(`[catalog] wrote ${relative(root, OUT_DIR)}/catalog.json`);

if (writeSnapshot) {
    // The snapshot is compiled into the npm package as the offline fallback.
    // Bodies dominate its size; keep them anyway — a fallback that can answer
    // search but not get is missing the more useful half.
    const { $schema, ...snapshot } = catalog;
    await writeFile(
        resolve(root, 'catalog/snapshot.json'),
        `${JSON.stringify(snapshot, null, 2)}\n`,
        'utf8'
    );
    console.error('[catalog] refreshed catalog/snapshot.json');
}
