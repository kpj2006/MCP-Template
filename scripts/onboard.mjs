#!/usr/bin/env node
/**
 * Rewrites the template's placeholders for one project, in one pass.
 *
 * The alternative is a checklist of "now edit these five files", which is where
 * template onboarding usually goes wrong — someone renames the package but not
 * the server, or the catalog URL but not the repository, and the mismatch only
 * shows up as a confusing runtime failure.
 *
 *   npm run onboard                                  # interactive
 *   npm run onboard -- --project=solar-oracle \
 *                      --repo=AOSSIE-Org/SolarOracle \
 *                      --noun=forecast --clean
 *
 * Flags: --project --repo --scope --noun --nouns --title --description
 *        --clean (drop the demo catalog content)  --yes (skip confirmation)
 */
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------- input */

const flags = Object.fromEntries(
    process.argv
        .slice(2)
        .filter(arg => arg.startsWith('--'))
        .map(arg => {
            const [key, ...rest] = arg.slice(2).split('=');
            return [key, rest.length ? rest.join('=') : true];
        })
);

const slug = value =>
    String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stderr }) : null;

async function ask(question, fallback) {
    if (!rl) return fallback;
    const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback;
}

function fail(message) {
    console.error(`[onboard] ${message}`);
    process.exit(1);
}

/* ---------------------------------------------------------------- gather */

const project = slug(flags.project ?? (await ask('Project slug (e.g. solar-oracle)', '')));
if (!project) fail('a project slug is required — pass --project=my-project');

const repo = String(flags.repo ?? (await ask('GitHub repo (owner/name)', `AOSSIE-Org/${project}`)));
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`--repo must be "owner/name", got "${repo}"`);
const [owner, repoName] = repo.split('/');

const scope = String(flags.scope ?? (await ask('npm scope (blank for unscoped)', '@aossie'))).replace(
    /^@?/,
    match => (match === '' ? '' : '@')
);
const packageName = scope ? `${scope}/${project}-mcp` : `${project}-mcp`;

const noun = slug(flags.noun ?? (await ask('What is one catalog entry called? (singular)', 'item')));
const nouns = slug(flags.nouns ?? (await ask('...and the plural', `${noun}s`)));

const title = String(
    flags.title ??
        (await ask(
            'Human-readable server title',
            project.replace(/(^|-)([a-z])/g, (_, sep, ch) => (sep ? ' ' : '') + ch.toUpperCase())
        ))
);
const description = String(
    flags.description ?? (await ask('One-line description', `MCP server for the AOSSIE ${title} project.`))
);

// GitHub Pages serves a project site at <owner>.github.io/<repo>, lowercased.
const catalogUrl = `https://${owner.toLowerCase()}.github.io/${repoName}/catalog.json`;
const clean = Boolean(flags.clean);

const plan = [
    ['npm package', packageName],
    ['MCP server name', `aossie-${project}`],
    ['server title', title],
    ['tool names', `search_${nouns}, get_${noun}, list_categories, catalog_info`],
    ['catalog URL', catalogUrl],
    ['repository', `https://github.com/${repo}`],
    ['demo content', clean ? 'REMOVED' : 'kept (pass --clean to remove)']
];

console.error('\n[onboard] plan:');
for (const [label, value] of plan) console.error(`  ${label.padEnd(18)} ${value}`);

if (!flags.yes && rl) {
    const go = await ask('\nApply? (y/N)', 'N');
    if (!/^y(es)?$/i.test(go)) {
        console.error('[onboard] aborted, nothing written');
        rl.close();
        process.exit(0);
    }
}
rl?.close();

/* ----------------------------------------------------------------- apply */

const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const writeJson = (path, value) =>
    writeFile(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

// package.json — identity and where the bin lands.
const pkg = await readJson('package.json');
pkg.name = packageName;
pkg.version = '0.1.0';
pkg.description = description;
pkg.homepage = `https://github.com/${repo}#readme`;
pkg.repository = { type: 'git', url: `git+https://github.com/${repo}.git` };
pkg.bugs = { url: `https://github.com/${repo}/issues` };
pkg.bin = { [`aossie-${project}-mcp`]: 'dist/index.js' };
pkg.keywords = ['mcp', 'modelcontextprotocol', 'aossie', project];
await writeJson('package.json', pkg);

// mcp.config.json — the runtime surface.
const config = await readJson('mcp.config.json');
config.$comment = 'Edit this file to reconfigure the server, then run `npm run gen && npm run build`.';
config.server.name = `aossie-${project}`;
config.server.title = title;
config.server.version = '0.1.0';
config.server.instructions =
    `Read-only access to the ${title} ${nouns} catalog. ` +
    `Call search_${nouns} with keywords to find candidates, then get_${noun} with an id to read one in full. ` +
    `Use list_categories to see how the catalog is organised, and catalog_info if results look empty or stale.`;
config.catalog.url = catalogUrl;
config.naming.itemNoun = noun;
config.naming.itemNounPlural = nouns;
await writeJson('mcp.config.json', config);

// catalog.meta.json — project identity in the published data.
const meta = await readJson('catalog/catalog.meta.json');
meta.project = {
    name: title,
    description,
    homepage: `https://github.com/${repo}`,
    repository: `https://github.com/${repo}`
};
if (clean) {
    meta.categories = [
        { id: 'general', name: 'General', description: `${title} ${nouns}.` }
    ];
}
await writeJson('catalog/catalog.meta.json', meta);

if (clean) {
    await rm(resolve(root, 'catalog/sources'), { recursive: true, force: true });
    await mkdir(resolve(root, 'catalog/sources/general'), { recursive: true });
    await writeFile(
        resolve(root, 'catalog/sources/general/example.md'),
        `---\ntitle: Example ${noun}\nsummary: Replace this file with your project's content — one file is one catalog entry.\ntags: [example]\n---\n\nFront matter above supplies the metadata; everything below it becomes the body\nthat \`get_${noun}\` returns. Directory names under \`catalog/sources/\` become\ncategories, and must be declared in \`catalog/catalog.meta.json\`.\n\nRun \`npm run catalog\` to build and validate.\n`,
        'utf8'
    );
    console.error('[onboard] replaced catalog/sources with a single placeholder entry');
}

// README — swap the placeholders a reader would otherwise trip over.
try {
    const readme = await readFile(resolve(root, 'README.md'), 'utf8');
    const rewritten = readme
        .replaceAll('@aossie/mcp-template', packageName)
        .replaceAll('aossie-mcp-template', `aossie-${project}`)
        .replaceAll('AOSSIE-Org/MCP-Template', repo)
        .replaceAll('aossie-org.github.io/MCP-Template', `${owner.toLowerCase()}.github.io/${repoName}`)
        .replaceAll('search_items', `search_${nouns}`)
        .replaceAll('get_item', `get_${noun}`);
    await writeFile(resolve(root, 'README.md'), rewritten, 'utf8');
} catch (err) {
    console.error(`[onboard] warn: could not rewrite README.md (${err.message})`);
}

console.error(`
[onboard] done. Next:

  1. npm run catalog -- --snapshot    build the catalog and refresh the offline fallback
  2. npm run build && npm test        confirm the server still passes end to end
  3. npm run inspect                  drive it by hand in the MCP Inspector
  4. Settings > Pages > source: GitHub Actions, then push to main
  5. Add an NPM_TOKEN repository secret, tag v0.1.0 and push the tag

  Users then add, with no server involved anywhere:

    { "mcpServers": { "${project}": { "command": "npx", "args": ["-y", "${packageName}"] } } }
`);
