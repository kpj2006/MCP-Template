---
title: Onboard an AOSSIE project onto MCP
summary: The four edits that turn this template into your project's MCP server.
tags: [onboarding, setup, npm]
url: https://github.com/AOSSIE-Org/MCP-Template/blob/main/docs/ONBOARDING.md
---

Onboarding is four edits and one release. No servers are involved at any point.

## 1. Claim a name

Pick the npm package name (`@aossie/<project>-mcp`) and the MCP server name
(`aossie-<project>`). Run `npm run onboard` to rewrite `package.json`,
`mcp.config.json` and the README placeholders in one pass.

## 2. Point at your catalog

Set `catalog.url` in `mcp.config.json` to where GitHub Pages will serve the
document — usually `https://<org>.github.io/<repo>/catalog.json`. The URL does
not have to exist yet; the bundled snapshot covers you until it does.

## 3. Replace the content

Delete `catalog/sources/**` and drop your own Markdown in. One file is one
catalog entry. Front matter supplies `title`, `summary`, `tags` and optionally
`id`, `category` and `url`; everything after the front matter becomes the body.
Directory names under `sources/` become categories when front matter omits one.

Run `npm run catalog` to build and validate. The builder fails loudly on
duplicate ids, unknown categories and missing summaries, because every one of
those is a bug a caller would otherwise hit at runtime.

## 4. Name your nouns

Set `naming.itemNoun` and `naming.itemNounPlural` to what your entries actually
are. A docs project gets `search_pages` and `get_page`; a skills project gets
`search_skills` and `get_skill`. This matters more than it looks: a model picks
correctly from a specific name far more reliably than it infers intent from a
generic one.

## Then release

Tag `v0.1.0` and push. `publish.yml` builds, tests and publishes to npm with
provenance. `catalog.yml` publishes the catalog to GitHub Pages on every push to
`main`, so content updates never need an npm release.
