import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * End-to-end over the real transport: spawn the built server as a subprocess and
 * drive it with the SDK's own client. Unit tests would not catch a broken bin
 * shebang, a stdout write that corrupts framing, or a schema the SDK rejects at
 * registration — this does.
 *
 * Everything is derived from `mcp.config.json` and the built catalog rather than
 * hardcoded, so this suite keeps working after `npm run onboard` renames the
 * server and its tools. That matters: a template whose own smoke test fails the
 * moment you adopt it teaches contributors to ignore red CI.
 *
 * The catalog is read from the local build, so the suite never touches the
 * network.
 */

const root = resolve(fileURLToPath(import.meta.url), '../..');
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

const config = readJson('mcp.config.json');
const catalog = readJson('catalog/dist/catalog.json');

/* Mirrors the derivation in src/core/config.ts. */
const slug = value =>
    String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const prefix = config.naming.toolPrefix ? `${slug(config.naming.toolPrefix)}_` : '';
const noun = slug(config.naming.itemNoun) || 'item';
const nouns = slug(config.naming.itemNounPlural) || `${noun}s`;

const TOOLS = {
    search: `${prefix}search_${nouns}`,
    get: `${prefix}get_${noun}`,
    listCategories: `${prefix}list_categories`,
    catalogInfo: `${prefix}catalog_info`
};

/* A representative entry to exercise the tools against. */
const sample = catalog.items.find(item => item.content && item.category) ?? catalog.items[0];
assert.ok(sample, 'the built catalog has no entries — run `npm run catalog` first');

/** Two distinctive words from the sample's title, to search for it by. */
const sampleQuery = sample.title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 3)
    .slice(0, 2)
    .join(' ');

let client;

async function connect(env = {}) {
    const connected = new Client({ name: 'template-test-harness', version: '0.0.0' });
    await connected.connect(
        new StdioClientTransport({
            command: process.execPath,
            args: [resolve(root, 'dist/index.js')],
            env: {
                ...getDefaultEnvironment(),
                AOSSIE_MCP_CATALOG_URL: resolve(root, 'catalog/dist/catalog.json'),
                AOSSIE_MCP_LOG_LEVEL: 'error',
                ...env
            },
            stderr: 'pipe'
        })
    );
    return connected;
}

before(async () => {
    client = await connect();
});

after(async () => {
    await client?.close();
});

const structured = result => {
    assert.ok(!result.isError, `expected success, got: ${JSON.stringify(result.content)}`);
    return result.structuredContent;
};

test('handshake reports the configured identity', () => {
    const info = client.getServerVersion();
    assert.equal(info.name, config.server.name);
    assert.equal(info.version, config.server.version);
    assert.ok(client.getInstructions()?.length > 0, 'instructions should reach the client');
});

test('exposes exactly the registered tools', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), Object.values(TOOLS).sort());

    for (const tool of tools) {
        assert.ok(tool.description?.length > 20, `${tool.name} needs a real description`);
        assert.equal(tool.inputSchema.type, 'object');
        assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} should be marked read-only`);
    }
});

test('search finds an entry by words from its title', async () => {
    const result = structured(
        await client.callTool({ name: TOOLS.search, arguments: { query: sampleQuery, limit: 50 } })
    );

    assert.ok(result.totalMatches >= 1, `nothing matched "${sampleQuery}"`);
    assert.ok(
        result.results.some(hit => hit.id === sample.id),
        `expected ${sample.id} among the results for "${sampleQuery}"`
    );
});

test('search returns summaries, never bodies', async () => {
    const result = structured(await client.callTool({ name: TOOLS.search, arguments: { query: '' } }));

    for (const hit of result.results) {
        // The body is deliberately absent here — that is what the get tool is for.
        assert.equal(hit.content, undefined, `${hit.id} leaked its body into search results`);
        assert.equal(typeof hit.summary, 'string');
    }
});

test('search reports totalMatches independently of returned', async () => {
    const all = structured(await client.callTool({ name: TOOLS.search, arguments: { query: '' } }));
    const one = structured(
        await client.callTool({ name: TOOLS.search, arguments: { query: '', limit: 1 } })
    );

    assert.equal(one.returned, Math.min(1, catalog.items.length));
    assert.equal(one.totalMatches, all.totalMatches);
});

test('search filters by category', async () => {
    if (!sample.category) return;
    const result = structured(
        await client.callTool({
            name: TOOLS.search,
            arguments: { query: '', category: sample.category, limit: 50 }
        })
    );

    assert.ok(result.results.length > 0);
    assert.ok(result.results.every(hit => hit.category === sample.category));
});

test('search returns nothing for a query that matches nothing', async () => {
    // A single nonsense token. Ranking is OR-with-coverage-penalty, so a
    // multi-word nonsense phrase can still match on one ordinary word.
    const result = structured(
        await client.callTool({ name: TOOLS.search, arguments: { query: 'qqzzxxjjkkvv' } })
    );
    assert.equal(result.totalMatches, 0);
    assert.deepEqual(result.results, []);
});

test('the get tool returns the full body', async () => {
    const result = structured(await client.callTool({ name: TOOLS.get, arguments: { id: sample.id } }));

    assert.equal(result.id, sample.id);
    assert.equal(result.title, sample.title);
    assert.ok(result.content.length > 0);
    assert.equal(result.truncated, sample.content.length > config.limits.contentMaxChars);
});

test('an unknown id fails in-band and suggests alternatives', async () => {
    // A near-miss on a real id: the most common way this tool is called wrongly.
    const typo = `${sample.id.slice(0, -1)}x`;
    const result = await client.callTool({ name: TOOLS.get, arguments: { id: typo } });

    assert.equal(result.isError, true);
    const text = result.content[0].text;
    assert.match(text, new RegExp(`No ${config.naming.itemNoun} found with id`, 'i'));
    // The dead end should hand back a usable next step, not just a refusal.
    assert.ok(text.includes(sample.id), `expected "${sample.id}" to be suggested, got: ${text}`);
});

test('a schema violation is rejected before the handler runs', async () => {
    const result = await client.callTool({
        name: TOOLS.search,
        arguments: { limit: config.limits.searchMaxLimit + 1000 }
    });
    assert.equal(result.isError, true);
});

test('list_categories counts entries per category', async () => {
    const result = structured(await client.callTool({ name: TOOLS.listCategories, arguments: {} }));

    assert.equal(result.totalItems, catalog.items.length);

    const expected = new Map();
    for (const item of catalog.items) {
        if (item.category) expected.set(item.category, (expected.get(item.category) ?? 0) + 1);
    }
    for (const [id, count] of expected) {
        const reported = result.categories.find(category => category.id === id);
        assert.ok(reported, `category "${id}" is used by an entry but was not reported`);
        assert.equal(reported.itemCount, count);
    }
    assert.equal(
        result.uncategorizedCount,
        catalog.items.filter(item => !item.category).length
    );
});

test('catalog_info reports the local source it actually loaded', async () => {
    const result = structured(await client.callTool({ name: TOOLS.catalogInfo, arguments: {} }));

    assert.equal(result.source, 'local');
    assert.equal(result.itemCount, catalog.items.length);
    assert.equal(result.lastError, null);
    assert.equal(result.generatedAt, catalog.generatedAt);
    assert.equal(result.server.name, config.server.name);
});

test('resources are listed and readable', async t => {
    if (!config.resources.enabled) return t.skip('resources are disabled in mcp.config.json');

    const scheme = config.resources.uriScheme;
    const { resources } = await client.listResources();
    const uris = resources.map(resource => resource.uri);

    assert.ok(uris.includes(`${scheme}://catalog`), `expected the catalog resource, saw ${uris.join(', ')}`);

    const itemUri = `${scheme}://${config.naming.itemNoun}/${encodeURIComponent(sample.id)}`;
    assert.ok(uris.includes(itemUri), `expected ${itemUri} to be listed`);

    const read = await client.readResource({ uri: itemUri });
    assert.equal(read.contents[0].mimeType, 'text/markdown');
    assert.ok(read.contents[0].text.includes(sample.title));
});

test('an unreachable catalog degrades to the bundled snapshot', async () => {
    const offline = await connect({
        AOSSIE_MCP_CATALOG_URL: resolve(root, 'catalog/dist/does-not-exist.json'),
        AOSSIE_MCP_LOG_LEVEL: 'silent'
    });

    try {
        const result = structured(await offline.callTool({ name: TOOLS.catalogInfo, arguments: {} }));
        assert.equal(result.source, 'snapshot');
        assert.ok(result.itemCount > 0, 'the snapshot should still answer queries');
        assert.ok(result.lastError, 'the failure should be reported, not hidden');
    } finally {
        await offline.close();
    }
});
