# Installing in a client

Every snippet below is the same three facts: a name, a command, and arguments.
That is all a stdio server needs — no URL, no token, no account.

Replace `@aossie/mcp-template` and the server key with your own.

> Client config formats and file locations drift between releases. If a snippet
> here does not match what your client expects, its own MCP documentation is
> authoritative — the `command` / `args` pair below is what you need to express.

---

## Claude Code

```bash
claude mcp add aossie-template -- npx -y @aossie/mcp-template
```

Then `/mcp` to confirm it connected, and `claude mcp list` to see it alongside
anything else configured.

## Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "aossie-template": {
      "command": "npx",
      "args": ["-y", "@aossie/mcp-template"]
    }
  }
}
```

Restart the app. On Windows, if `npx` is not found, use the full path to
`npx.cmd` or point `command` at `node` with an absolute path to the installed
`dist/index.js`.

## VS Code

`.mcp.json` in the workspace root, or `.vscode/mcp.json`:

```json
{
  "servers": {
    "aossie-template": {
      "command": "npx",
      "args": ["-y", "@aossie/mcp-template"]
    }
  }
}
```

Committing this to your project repo is a nice touch — contributors get the
server automatically.

## Cursor

`~/.cursor/mcp.json` for every project, or `.cursor/mcp.json` for one:

```json
{
  "mcpServers": {
    "aossie-template": {
      "command": "npx",
      "args": ["-y", "@aossie/mcp-template"]
    }
  }
}
```

## Anything else

Any MCP client that supports stdio takes the same three fields under whatever key
it uses. If a client only speaks Streamable HTTP, see
[ARCHITECTURE.md](ARCHITECTURE.md#if-you-outgrow-stdio) — but check first,
because stdio support is close to universal in desktop and editor clients.

---

## Running a local build

While developing, point at your checkout instead of npm:

```json
{
  "mcpServers": {
    "aossie-template-dev": {
      "command": "node",
      "args": ["/absolute/path/to/MCP-Template/dist/index.js"],
      "env": {
        "AOSSIE_MCP_CATALOG_URL": "/absolute/path/to/MCP-Template/catalog/dist/catalog.json",
        "AOSSIE_MCP_LOG_LEVEL": "debug"
      }
    }
  }
}
```

Absolute paths — the client's working directory is not yours. Pointing
`AOSSIE_MCP_CATALOG_URL` at a local file means edits show up on the next cache
expiry with no deploy, and the server never touches the network.

Run both the published and the local server side by side under different keys;
`catalog_info` tells you which one answered.

## Pinning a version

`npx -y @aossie/mcp-template` resolves the latest on every launch. To pin:

```json
{ "command": "npx", "args": ["-y", "@aossie/mcp-template@0.1.0"] }
```

Worth doing in a shared team config, where a surprise update mid-sprint is
unwelcome. Note that content still moves — the catalog is fetched live, so
pinning the package pins the logic, not the data.

## Checking it works

Ask the model to list the categories. If it calls `list_categories` and reports
counts, everything downstream of the handshake is fine.

If not:

1. **`npm run inspect`** — the MCP Inspector, driven by hand, isolates whether the
   problem is the server or the client wiring.
2. **`catalog_info`** — reports where the data came from, how old it is, and the
   last fetch error.
3. **The client's log** — stderr from the subprocess lands there, and
   `AOSSIE_MCP_LOG_LEVEL=debug` makes it verbose.
4. **Node version** — this package needs Node ≥ 20.10. `npx` uses whichever Node
   is on the client's `PATH`, which is not necessarily the one in your shell.
