---
title: Catalog document contract
summary: The shape of the static JSON the server fetches, and the rules the builder enforces.
tags: [catalog, schema, reference, github-pages]
url: https://github.com/AOSSIE-Org/MCP-Template/blob/main/catalog/catalog.schema.json
---

Code and data ship on separate rails. The npm package holds logic and changes
rarely; the catalog holds content and changes whenever someone merges a PR.
Adding an entry is a Pages deploy, not an npm release — which is what makes this
workable across a large number of repositories.

## Shape

```json
{
  "version": 1,
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "project": { "name": "...", "description": "...", "homepage": "..." },
  "categories": [{ "id": "guides", "name": "Guides", "description": "..." }],
  "items": [
    {
      "id": "onboard-a-project",
      "title": "Onboard an AOSSIE project onto MCP",
      "summary": "One sentence.",
      "category": "guides",
      "tags": ["onboarding"],
      "url": "https://...",
      "content": "Full body text."
    }
  ]
}
```

## Rules the builder enforces

- `id` is unique, non-empty and URL-safe. Ids are the handle callers cache, so
  renaming one is a breaking change.
- `summary` is present and non-empty. Search returns summaries, so a blank one
  makes an entry undiscoverable in practice even though it is indexed.
- `category`, when set, matches a declared category id. A typo would otherwise
  produce a filter that silently returns nothing.
- `version` matches the contract version the package understands.

## Field budget

Return the minimum that lets a caller decide. Search hands back five fields plus
an id; the body waits for an explicit get. If your entries carry twenty
project-specific fields, put them in `metadata` and expose only the ones a model
would act on.
