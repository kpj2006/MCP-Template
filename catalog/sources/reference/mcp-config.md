---
title: mcp.config.json reference
summary: Every field in the template's configuration file and what changing it does.
tags: [config, reference]
---

`mcp.config.json` is compiled into the build by `scripts/generate-runtime.mjs`.
Run `npm run gen` (or any `npm run build`) after editing it.

## server

- `name` — MCP server identity, lowercase and URL-safe. Clients show it.
- `title` — human-readable display name.
- `version` — reported in the handshake. Keep it in step with `package.json`.
- `instructions` — sent to the model once at session start. Say what the catalog
  holds and in what order to call the tools.

## catalog

- `url` — where the static catalog document lives.
- `localFallbackUrl` — a filesystem path or `file:` URL tried *before* `url`.
  Development convenience; leave `null` in a release.
- `cacheTtlSeconds` — how long a fetched catalog is served without rechecking.
- `fetchTimeoutMs`, `fetchRetries` — network budget per load.

## naming

- `toolPrefix` — prepended to every tool name. Useful when a user runs several
  AOSSIE servers at once and names would otherwise collide.
- `itemNoun`, `itemNounPlural` — drive both tool names and tool descriptions.

## limits

- `searchDefaultLimit`, `searchMaxLimit` — result count bounds.
- `summaryMaxChars` — search result summaries are truncated to this.
- `contentMaxChars` — the get tool truncates bodies here and says so in the
  result, rather than silently flooding the caller's context.

## resources

- `enabled` — register MCP resources alongside tools.
- `uriScheme` — scheme for resource URIs, e.g. `aossie://guide/my-id`.

## Environment overrides

`AOSSIE_MCP_CATALOG_URL`, `AOSSIE_MCP_CACHE_TTL`, `AOSSIE_MCP_FETCH_TIMEOUT_MS`
and `AOSSIE_MCP_LOG_LEVEL` override the compiled values at runtime, so you can
point a built server at a local catalog without rebuilding.
