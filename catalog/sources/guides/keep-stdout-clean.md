---
title: Never write to stdout
summary: On stdio transport, stdout is the JSON-RPC framing — one stray console.log breaks the session.
tags: [stdio, debugging, logging]
---

This is the single most common way a working MCP server appears broken.

With stdio transport the client reads JSON-RPC frames from your process's
stdout. Anything else written there lands mid-frame, the client's parser fails,
and what the user sees is an opaque "server disconnected" with no clue why.

The rules:

- Never call `console.log`, `console.info`, `process.stdout.write`, or anything
  that reaches stdout, anywhere in the server or its dependencies.
- Route all diagnostics through `src/core/logger.ts`, which writes to stderr.
  Clients surface stderr in their logs, so nothing is lost.
- Keep `npm run check:stdout` in CI. It fails the build on any stdout write
  under `src/`, and it pays for itself the first time a contributor adds a
  debug print.
- Be suspicious of dependencies that log. A library that prints a deprecation
  notice to stdout will break your server and the stack trace will point
  somewhere unhelpful.

Set `AOSSIE_MCP_LOG_LEVEL=debug` to see the full fetch and cache trace on
stderr while developing.
