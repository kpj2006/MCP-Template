# Onboarding a project

Four edits and one release. No servers are involved at any point.

Time: about 30 minutes for the first project, ten for the next one.

---

## 0. Create the repo

Use this repository as a GitHub template (**Use this template → Create a new
repository**), or clone and re-point the remote. Then:

```bash
npm install
npm run verify
```

`verify` runs the stdout guard, validates the catalog, typechecks, and runs the
end-to-end test that spawns the built server and drives it with a real MCP
client. If that passes on a fresh clone, the machinery works and everything
after this is content.

## 1. Claim the names

```bash
npm run onboard
```

You are asked for five things:

| Prompt          | Example              | Where it lands                             |
| --------------- | -------------------- | ------------------------------------------ |
| project slug    | `solar-oracle`       | package name, server name, bin name        |
| GitHub repo     | `AOSSIE-Org/Solar`   | repository URLs, the Pages catalog URL     |
| npm scope       | `@aossie`            | package name                               |
| singular noun   | `forecast`           | `get_forecast`, tool descriptions          |
| plural noun     | `forecasts`          | `search_forecasts`                         |

It prints a plan, waits for confirmation, then rewrites `package.json`,
`mcp.config.json`, `catalog/catalog.meta.json` and `README.md` together. Doing
them together is the point — the usual template failure is renaming the package
but not the server, and the mismatch only surfaces later as a confusing runtime
error.

Non-interactively, for scripting across several repos:

```bash
npm run onboard -- --project=solar-oracle --repo=AOSSIE-Org/SolarOracle \
                   --scope=@aossie --noun=forecast --nouns=forecasts \
                   --clean --yes
```

`--clean` deletes the demo content and leaves one placeholder entry.

### Choose the nouns deliberately

This is the highest-leverage decision in the whole process, and it costs nothing
to get right.

Tool names are derived from the noun, so `itemNoun: "forecast"` produces
`search_forecasts` and `get_forecast`. A model reading a tool list picks
`search_forecasts` for a question about forecasts essentially every time; it has
to reason its way to `search_items`. Use the word your community already uses for
these things.

## 2. Point at your catalog

`catalog.url` in `mcp.config.json` is where the published data will live —
`https://<owner>.github.io/<repo>/catalog.json`, which `npm run onboard` fills in
for you. Note that the owner is lowercased in Pages URLs.

The URL does not have to exist yet. The bundled snapshot covers you until the
first Pages deploy lands.

Then enable Pages once, by hand: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. This is the only click in the whole setup, and it
cannot be automated.

## 3. Replace the content

Delete `catalog/sources/**` and drop your own Markdown in. **One file is one
catalog entry.**

```markdown
---
title: Estimating rooftop yield
summary: How the model turns irradiance readings into a kilowatt-hour forecast.
tags: [modelling, irradiance]
url: https://github.com/AOSSIE-Org/SolarOracle/blob/main/docs/yield.md
---

Everything after the front matter becomes the body, which is what `get_forecast`
returns. Markdown is passed through untouched.
```

Rules the builder applies:

- **`id`** — from `id:` in front matter, else slugified from the filename. Must
  be unique and URL-safe. Ids are the handle callers cache, so renaming one is a
  breaking change.
- **`title`** — from front matter, else the filename.
- **`summary`** — from front matter, else the first sentence of the body. **A
  missing summary fails the build.** Search returns summaries, so a blank one
  leaves an entry technically indexed but undiscoverable in practice.
- **`category`** — from front matter, else the directory name under `sources/`.
  Must be declared in `catalog/catalog.meta.json`, or the build fails — an
  undeclared category would otherwise produce a filter that silently returns
  nothing.
- **`tags`** — `tags: [a, b]` or a `- ` block list.
- Any other front-matter key lands in `metadata` and is passed through untouched.

Declare your categories in `catalog/catalog.meta.json`:

```json
{
  "project": { "name": "Solar Oracle", "description": "…" },
  "categories": [
    { "id": "models", "name": "Models", "description": "How each forecast is computed." },
    { "id": "guides", "name": "Guides", "description": "Task walkthroughs." }
  ]
}
```

Keep the list small. A dozen categories a model can hold in mind beats a hundred
it cannot.

Build and validate:

```bash
npm run catalog -- --snapshot
```

`--snapshot` also refreshes `catalog/snapshot.json`, the offline fallback that
gets compiled into the npm package.

## 4. Check it end to end

```bash
npm run verify
npm run inspect     # the MCP Inspector, driven by hand
```

Then wire your local build into a real client and ask it something. Nothing
substitutes for watching a model actually pick your tools:

```json
{
  "mcpServers": {
    "solar-oracle": {
      "command": "node",
      "args": ["/absolute/path/to/SolarOracle-MCP/dist/index.js"]
    }
  }
}
```

If the model picks the wrong tool, or calls `get_forecast` with a keyword instead
of an id, the fix is almost always in the tool **description**, not the code.
Descriptions are prompt, and they are the cheapest thing in this repo to iterate
on.

## 5. Release

```bash
# Data — deploys on every push to main touching catalog/**
git add -A && git commit -m "Add the forecast catalog" && git push

# Code — add an NPM_TOKEN repo secret first (an npm automation token)
npm version 0.1.0
git push --follow-tags
```

`publish.yml` checks that the tag matches both `package.json` and
`mcp.config.json`, refreshes the snapshot from the tagged content, runs `verify`,
and publishes with provenance.

From then on, **content updates need no release**. Push to `main`, Pages
redeploys, and installed clients pick it up when their cache expires.

Tell users:

```json
{
  "mcpServers": {
    "solar-oracle": { "command": "npx", "args": ["-y", "@aossie/solar-oracle-mcp"] }
  }
}
```

---

## Adding a tool

Only when the catalog genuinely cannot express what you need. A new category or
tag needs no code and no npm release — reach for that first.

Create `src/tools/compare-forecasts.ts`:

```ts
import { z } from 'zod';

import { getCatalog } from '../core/catalog-client.js';
import { defineTool } from './registry.js';

export const compareForecastsTool = defineTool({
    name: 'compare_forecasts',
    title: 'Compare forecasts',
    description:
        'Compare two forecasts side by side by id. Use after search_forecasts has ' +
        'narrowed the field; this tool does not search.',
    inputSchema: {
        left: z.string().describe('id of the first forecast'),
        right: z.string().describe('id of the second forecast')
    },
    outputSchema: {
        left: z.string(),
        right: z.string(),
        sharedTags: z.array(z.string())
    },
    async run({ left, right }) {
        const catalog = await getCatalog();
        // …
        return { left, right, sharedTags: [] };
    },
    render(result) {
        return `${result.left} vs ${result.right}: ${result.sharedTags.join(', ') || 'nothing in common'}`;
    }
});
```

Then add it to the array in `src/tools/index.ts`. That is the whole change —
capability declaration, listing and dispatch all read from that one array.

`defineTool` handles the parts that are easy to get wrong: it marks the tool
read-only and idempotent by default, returns both a `content` block and validated
`structuredContent`, and converts a thrown `ToolError` into an in-band
`isError: true` result so the model can read what went wrong and adjust. Raw
stack traces go to stderr and never to the model — they leak local paths and the
model cannot act on them.

## Configuration reference

### `server`

| Field          | Effect                                                                |
| -------------- | --------------------------------------------------------------------- |
| `name`         | MCP identity. Lowercase, URL-safe. Clients display it.                |
| `title`        | Human-readable display name.                                          |
| `version`      | Reported in the handshake. `publish.yml` enforces it matches the tag.  |
| `instructions` | Sent to the model once at session start. Say what the catalog holds and in what order to call the tools. |

### `catalog`

| Field               | Effect                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| `url`               | Where the static catalog lives.                                           |
| `localFallbackUrl`  | A path or `file:` URL tried *before* `url`. Development only — leave `null`. |
| `cacheTtlSeconds`   | How long a fetched catalog is served without rechecking. 900 is a good default: content edits reach users within the quarter hour, and a long session makes one request. |
| `fetchTimeoutMs`    | Per-attempt network budget.                                               |
| `fetchRetries`      | Extra attempts after the first, with exponential backoff.                 |

### `naming`

| Field            | Effect                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `toolPrefix`     | Prepended to every tool name. Use it when a user is likely to run several AOSSIE servers at once and bare names would collide. |
| `itemNoun`       | Drives `get_<noun>` and every tool description.                     |
| `itemNounPlural` | Drives `search_<plural>`.                                           |

### `limits`

| Field                 | Effect                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `searchDefaultLimit`  | Results when the caller does not ask. 10 fits most contexts.        |
| `searchMaxLimit`      | Hard ceiling; the schema rejects anything larger before the handler runs. |
| `summaryMaxChars`     | Search summaries are truncated here.                                |
| `contentMaxChars`     | `get_<noun>` truncates bodies here **and says so in the result**, rather than silently flooding the caller's context. |

### `resources`

| Field       | Effect                                                          |
| ----------- | --------------------------------------------------------------- |
| `enabled`   | Register MCP resources alongside tools.                          |
| `uriScheme` | Scheme for resource URIs, e.g. `solar://forecast/rooftop-yield`. |

### Environment overrides

`AOSSIE_MCP_CATALOG_URL`, `AOSSIE_MCP_CACHE_TTL`, `AOSSIE_MCP_FETCH_TIMEOUT_MS`,
`AOSSIE_MCP_LOG_LEVEL` (`debug` | `info` | `warn` | `error` | `silent`).

## Troubleshooting

**The client says the server disconnected, with no detail.** Almost always a
stdout write. Run `npm run check:stdout`. If that is clean, suspect a dependency
that prints to stdout — a deprecation notice from a library will break framing
just as effectively as your own `console.log`.

**Tools return nothing.** Call `catalog_info`. It reports the source (`remote`,
`local`, `stale`, `snapshot`), the entry count, and the last fetch error, which
answers the question without reading any logs.

**Results are out of date.** `catalog_info` shows `fetchedAt` and the TTL. Pages
also fronts a CDN, so a deploy can take a few minutes to be globally visible.

**`get_<noun>` keeps missing.** Check ids are stable. If content is regenerated
from filenames and a file was renamed, every cached id broke. Pin ids explicitly
in front matter for anything long-lived.

**The build fails on a category.** The category in front matter or the directory
name is not declared in `catalog/catalog.meta.json`. That is deliberate: an
undeclared category becomes a filter value that returns nothing.

**Debugging live.** `AOSSIE_MCP_LOG_LEVEL=debug` traces fetch, cache and retry
decisions on stderr. Clients surface stderr in their logs.
