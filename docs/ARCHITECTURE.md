# Architecture

Why this template is shaped the way it is, and what each decision buys.

---

## The constraint

AOSSIE is an open-source org with many repositories, volunteer maintainers who
rotate, and no infrastructure budget. Any design that needs someone to keep a
service up will be up until that person's GSoC ends.

So the requirement is not "cheap hosting". It is **no hosting**, and no
operational responsibility that outlives a contributor.

## The shape

MCP defines two standard transports. **Streamable HTTP** is for remote networked
servers; **stdio** is for local process-spawned integrations. With stdio the
client launches the server as a child process and speaks JSON-RPC over its
stdin/stdout — the server runs on the *user's* machine.

That inverts the cost model completely. You publish a package; users' machines
provide the compute. Zero cost, zero uptime, zero auth, no rate limits. It is how
the official filesystem, git and memory servers ship.

The remaining question is where the data lives. Baking it into the package means
every content change is an npm release, which is fatal at org scale — a
documentation fix should not need a version bump and a publish. So:

```
   the code rail                            the data rail
   ─────────────                            ─────────────
   npm package                              GitHub Pages
   logic, tools, transport                  catalog.json
   changes rarely                           changes constantly
   released by tag                          deployed by push to main
            │                                       │
            └──────────── stdio server ─────────────┘
                     fetches the catalog
                       at session start
```

**GitHub Pages cannot be the MCP endpoint.** It serves static files; MCP needs to
accept `POST` with JSON-RPC bodies. But it is an excellent *backend* for one, and
it is free and CDN-fronted.

## Why the config is compiled in

`mcp.config.json` and `catalog/snapshot.json` are compiled into
`src/generated/runtime.ts` by `scripts/generate-runtime.mjs` at build time.

The alternative — reading them at runtime — has to answer "where am I?" and the
answer differs between `src/` and `dist/`, between `npx` and a global install,
between a symlinked workspace and a flat `node_modules`, and between Node and a
bundler. Every one of those is a "works on my machine, empty in production" bug
waiting to happen, and each has to be discovered separately.

Compiling them in removes the entire class. It also makes the snapshot genuinely
bundled rather than a file that has to survive `files` in `package.json`, and it
means the same code runs unchanged in a Worker.

The cost is that you rebuild after editing config. You were going to anyway.

Environment variables still override the compiled catalog URL, TTL, timeout and
log level, so pointing a built server at a local catalog needs no rebuild.

## Why the cache is in memory only

The subprocess lives exactly as long as the client session. A TTL over an
in-memory value is therefore the whole cache — there is no second process to
share with and no restart to survive that is not also a new session.

Disk caching would add a cache directory to resolve, permissions to get wrong on
three operating systems, and concurrent-write handling between simultaneous
sessions. For a document that takes one HTTPS request to refetch. It is not a
close call.

A single-flight guard means concurrent tool calls on a cold cache trigger one
fetch rather than one per call.

## The degradation ladder

```
fresh remote  →  unexpired memory  →  stale memory  →  bundled snapshot
                                             │                 │
                                     last refresh failed,   never fetched
                                     data was valid once     successfully
```

Nothing in this ladder throws. A server that dies because GitHub Pages had a bad
minute is worse than one that answers with data from twenty minutes ago and says
so — which is exactly what `catalog_info` reports.

The snapshot is refreshed by `publish.yml` from the tagged content, so it is never
more than one release behind. It keeps bodies, not just summaries: a fallback
that can answer `search` but not `get` is missing the more useful half.

ETags mean an unchanged catalog costs a `304` rather than a full transfer.

## Tool design

**Three specific tools, not one with a mode flag.** `search_items`, `get_item`
and `list_categories` beat a single `query_items` with a `mode` parameter. Models
pick correctly from clear names far more reliably than they populate a
discriminated union — and the names are derived from `naming.itemNoun`, so a
skills project gets `search_skills` and a docs project gets `search_pages`.

**Search never returns bodies.** Every field returned costs the calling model
context, and a search that hands back ten full documents to answer "which of
these is relevant" has spent the budget the caller needed for the actual work.
Search returns five fields plus an id; the body waits for an explicit `get`.

**Truncation is announced.** `get_<noun>` caps bodies at `contentMaxChars` and
sets `truncated: true` with a pointer to the source URL. Silently returning half
a document is how a model confidently answers from a fragment.

**A dead end hands back a next step.** An unknown id returns the three closest
ids rather than a bare "not found". A few tokens spent there saves a retry loop.

**Errors are in-band.** A `ToolError` becomes `isError: true` with a readable
message, not a protocol-level failure — the model can read it and adjust.
Unexpected errors log the stack to stderr and return a generic message; stack
traces leak local paths and a model cannot act on them.

**A registry, not a switch.** `src/tools/index.ts` is one array. Listing and
dispatch both derive from it, so adding a tool cannot leave a stale list handler
behind.

## Why stdout discipline is a build gate

On stdio, stdout *is* the framing. A stray write lands mid-frame, the client's
parser fails, and the symptom is "server disconnected" with nothing pointing at
the cause. Contributors hit it, spend an hour, and conclude MCP is fragile.

`scripts/check-stdout.mjs` fails the build on any `console.log`,
`process.stdout`, or `console.warn` under `src/`, with `core/logger.ts` as the
single exemption. It is 60 lines and no dependencies — cheaper than a lint
toolchain for the one rule that actually matters here.

Be equally suspicious of dependencies. A library that prints a deprecation notice
to stdout breaks the session just as effectively, and the stack trace will point
somewhere unhelpful.

## Layers

```
src/index.ts        transport wiring only — the file a Worker replaces
src/server.ts       createServer(): registers tools and resources. no transport.
src/tools/          project surface. add tools here.
src/core/           domain-agnostic. untouched when onboarding.
src/generated/      compiled config + snapshot. never edited by hand.
```

The `index.ts` / `server.ts` split is the escape hatch. `createServer()` knows
nothing about how bytes move, so a different transport is a different entry file
and nothing else.

## If you outgrow stdio

You probably will not. A remote endpoint is only worth it for:

- **shared state** across users, or writes that must be centrally serialised
- **secrets** you cannot hand to users — an API key with real billing attached
- **browser-based clients** that cannot spawn a subprocess at all

If one of those is genuinely true, Cloudflare Workers' free tier (100k
requests/day, plus D1 and KV) is the usual answer for an org tool, and there is
an official authless remote-MCP template. Deployment is a push.

The migration is mechanical on this side: a Worker imports `createServer()` and
wires it to `StreamableHTTPServerTransport`. Tool implementations, the catalog
client and search do not change.

**But be clear-eyed about what you are taking on.** Two things.

First, do not build on HTTP+SSE. It was deprecated in the 2025-03-26 spec
revision in favour of Streamable HTTP. New work on the old transport is work you
will redo.

Second, stdio → HTTP is an application redesign, not a hosting toggle. stdio
gives you single-tenancy for free: one process, one user, no isolation to
enforce. Over HTTP you inherit authentication, session identity, per-tenant
isolation, abuse handling and the operational duty to keep it all up. That is the
cost this template exists to avoid, and it should be paid deliberately rather
than drifted into.

## Dependency budget

Runtime: `@modelcontextprotocol/sdk` and `zod`. That is the whole list.

Build: `typescript` and `@types/node`.

Scripts: none. The catalog builder, the runtime generator, the stdout guard and
the onboarding script are all plain Node with no imports outside `node:`. They
run in CI on a schedule; a dependency there is a supply-chain surface for code
that only reads local files.

Tests: none. `node --test` plus the SDK's own client, which is already a
dependency.

For a repo maintained by rotating volunteers, every dependency is a future
upgrade someone has to understand. Ranking search results with a weighted token
match over a few hundred in-memory entries is a hundred lines and no upgrade
path to maintain.

## The MCP SDK version

Pinned to `@modelcontextprotocol/sdk@^1.30`. There is a newer `2.x` line
published under split `@modelcontextprotocol/server` and
`@modelcontextprotocol/client` packages, with a slightly different registration
API.

`1.x` is chosen deliberately: it is actively released, not deprecated, and it is
what essentially every MCP example, tutorial and blog post in existence uses.
For a template aimed at volunteer contributors, being able to search for an
answer and have it apply matters more than being on the newest major.

When migrating is worth it, the changes are confined to two files:

- `src/index.ts` — `StdioServerTransport` moves to `@modelcontextprotocol/server/stdio`
- `src/tools/registry.ts` — raw shapes become `z.object({...})` (Standard Schema)

Everything else is unaffected, which is itself a reason the registry indirection
is there.
