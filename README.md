<!-- Don't delete it -->
<div name="readme-top"></div>

<!-- Organization Logo -->
<div align="center" style="display: flex; align-items: center; justify-content: center; gap: 16px;">
  <img alt="AOSSIE" src="public/aossie-logo.svg" width="175">
</div>

&nbsp;

<!-- Organization Name -->
<div align="center">

[![Static Badge](https://img.shields.io/badge/aossie.org-228B22?style=for-the-badge&labelColor=FFC517)](https://aossie.org/)

</div>

<!-- Organization/Project Social Handles -->
<p align="center">
<!-- Telegram -->
<a href="https://t.me/+bMWGzaMTMa8xN2Ex">
<img src="https://img.shields.io/badge/Telegram-black?style=flat&logo=telegram&logoColor=white&logoSize=auto&color=24A1DE" alt="Telegram Badge"/></a>
&nbsp;&nbsp;
<!-- X (formerly Twitter) -->
<a href="https://x.com/aossie_org">
<img src="https://img.shields.io/twitter/follow/aossie_org" alt="X (formerly Twitter) Badge"/></a>
&nbsp;&nbsp;
<!-- Discord -->
<a href="https://discord.gg/hjUhu33uAn">
<img src="https://img.shields.io/discord/1022871757289422898?style=flat&logo=discord&logoColor=white&logoSize=auto&label=Discord&labelColor=5865F2&color=57F287" alt="Discord Badge"/></a>
&nbsp;&nbsp;
<!-- LinkedIn -->
<a href="https://www.linkedin.com/company/aossie/">
  <img src="https://img.shields.io/badge/LinkedIn-black?style=flat&logo=LinkedIn&logoColor=white&logoSize=auto&color=0A66C2" alt="LinkedIn Badge"></a>
&nbsp;&nbsp;
<!-- Youtube -->
<a href="https://www.youtube.com/@AOSSIE-Org">
  <img src="https://img.shields.io/youtube/channel/subscribers/UCKVVLbawY7Gej_3o2WKsoiA?style=flat&logo=youtube&logoColor=white%20&logoSize=auto&labelColor=FF0000&color=FF0000" alt="Youtube Badge"></a>
</p>

<p align="center">
  <a href="https://github.com/gitleaks/gitleaks">
    <img src="https://img.shields.io/badge/protected%20by-gitleaks-blue" alt="Protected by Gitleaks"/>
  </a>
</p>

<div align="center">
<h1>AOSSIE MCP Template</h1>
</div>

<p align="center">
A template for giving any AOSSIE project an MCP server <b>with no server</b>.
</p>

---

## How it works

The MCP server runs as a subprocess on the user's own machine over stdio,
shipped as a public npm package. Its data is static JSON on GitHub Pages. Both
are free forever, there is no uptime to own, no OAuth to implement, and no
rate limit to budget for. This is how the official filesystem, git and memory
MCP servers ship.

```
                        ┌─────────────────────────────┐
   the code rail        │ npm  @aossie/<project>-mcp  │   changes rarely
   ─────────────        └──────────────┬──────────────┘
                                       │ npx spawns it
                        ┌──────────────▼──────────────┐
                        │  MCP client (Claude, IDE…)  │
                        │  stdio · JSON-RPC · local   │
                        └──────────────┬──────────────┘
                                       │ HTTPS GET, cached
   the data rail        ┌──────────────▼──────────────┐
   ─────────────        │ <org>.github.io/<repo>/     │   changes constantly
                        │        catalog.json         │
                        └─────────────────────────────┘
```

**Code and data ship on separate rails.** The npm package holds logic. The
catalog holds content. Adding an entry is a Pages deploy, not an npm release —
which is the property that makes this workable across a large number of repos.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why it is built this way.

## Try it in two minutes

Before onboarding it into your project, you can run the template as-is to see
what it does:

```bash
git clone https://github.com/AOSSIE-Org/MCP-Template.git
cd MCP-Template
npm install
npm run verify        # stdout guard, catalog validation, typecheck, e2e tests
npm run inspect        # drive it by hand in the MCP Inspector
```

## Onboard your project

This is the part that matters. Run:

```bash
npm run onboard
```

It asks for a project slug, repo, and what one catalog entry is called, then
rewrites `package.json`, `mcp.config.json`, `catalog/catalog.meta.json` and
this README in one pass — so from here on, the README is yours to rewrite
around your own project's motive. Non-interactively:

```bash
npm run onboard -- --project=solar-oracle --repo=AOSSIE-Org/SolarOracle \
                   --noun=forecast --nouns=forecasts --clean --yes
```

Then replace `catalog/sources/**` with your content — one Markdown file per
entry — and run `npm run catalog -- --snapshot`.

Full walkthrough: **[docs/ONBOARDING.md](docs/ONBOARDING.md)**.

## What the server exposes

Four tools. Their names follow `naming.itemNoun` in `mcp.config.json`, so a
docs project gets `search_pages` / `get_page` and a skills project gets
`search_skills` / `get_skill`.

| Tool               | Returns                                                            |
| ------------------ | ------------------------------------------------------------------- |
| `search_items`     | Ranked summaries — id, title, summary, category, tags. No bodies.   |
| `get_item`         | One entry in full, by exact id, including its body.                 |
| `list_categories`  | The category vocabulary with per-category counts.                   |
| `catalog_info`     | Where the data came from, when, and whether it is stale.            |

Plus MCP resources (`aossie://catalog`, `aossie://item/{id}`) when
`resources.enabled` is true, for clients that render a resource picker.

## Repo layout

```
mcp.config.json            ← the onboarding surface: identity, catalog URL, naming
catalog/
  catalog.meta.json        ← project identity + category vocabulary
  catalog.schema.json      ← the published data contract
  sources/**/*.md          ← YOUR CONTENT. one file = one entry
  snapshot.json            ← generated offline fallback, bundled into npm
src/
  index.ts                 ← stdio transport wiring, and nothing else
  server.ts                ← createServer(): registers everything, transport-agnostic
  core/                    ← never edited when onboarding
    config.ts              ·  compiled config + derived tool names
    catalog-client.ts      ·  fetch, ETag, retry, TTL cache, snapshot fallback
    search.ts              ·  dependency-free weighted ranking
    schemas.ts logger.ts errors.ts types.ts
  tools/
    index.ts               ← ADD YOUR TOOLS HERE (one array, one source of truth)
    registry.ts            ·  defineTool(): schema + error wrapping
    search-items.ts get-item.ts list-categories.ts catalog-info.ts
  resources/items.ts
scripts/
  generate-runtime.mjs     ← compiles mcp.config.json into the build
  build-catalog.mjs        ← sources/**  →  catalog.json  (zero dependencies)
  check-stdout.mjs         ← build gate: nothing in src/ may write to stdout
  onboard.mjs               ← rewrites the template for one project
  sync-version.mjs         ← keeps mcp.config.json's version equal to package.json's
.github/workflows/
  ci.yml                   ← verify on 20.10 + 22, then install-from-tarball
  catalog.yml              ← push to main → GitHub Pages
  publish.yml              ← tag v* → npm with provenance
```

## Configuration

Everything lives in [`mcp.config.json`](mcp.config.json) — server identity,
catalog URL, cache TTL, tool naming, response size limits. It is compiled into
the build by `scripts/generate-runtime.mjs`, so run `npm run gen` (or any
`npm run build`) after editing it. Field-by-field reference:
[docs/ONBOARDING.md](docs/ONBOARDING.md#configuration-reference).

For local development, four environment variables override the compiled
values without a rebuild: `AOSSIE_MCP_CATALOG_URL`, `AOSSIE_MCP_LOG_LEVEL`,
`AOSSIE_MCP_CACHE_TTL`, `AOSSIE_MCP_FETCH_TIMEOUT_MS`.

## Docs

- **[docs/ONBOARDING.md](docs/ONBOARDING.md)** — adapt this template, step by step
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — why it is built this way
- **[docs/CLIENTS.md](docs/CLIENTS.md)** — client-by-client install snippets
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — working on the template itself
- **[catalog/catalog.schema.json](catalog/catalog.schema.json)** — the data contract

---

## 🙌 Contributing

⭐ Don't forget to star this repository if you find it useful! ⭐

Thank you for considering contributing to this project! Contributions are highly appreciated and welcomed. To ensure smooth collaboration, please refer to our [Contribution Guidelines](./CONTRIBUTING.md).

---

## ✨ Maintainers

See [MAINTAINERS.md](./MAINTAINERS.md) for maintainers, mentors, and ideators.

---

## 📍 License

This project is licensed under the GNU General Public License v3.0.
See the [LICENSE](LICENSE) file for details.

---

## 💪 Thanks To All Contributors

Thanks a lot for spending your time helping the AOSSIE MCP Template grow. Keep rocking 🥂

[![Contributors](https://contrib.rocks/image?repo=AOSSIE-Org/MCP-Template)](https://github.com/AOSSIE-Org/MCP-Template/graphs/contributors)

© 2026 AOSSIE
