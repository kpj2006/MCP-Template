import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { config } from './core/config.js';
import { log } from './core/logger.js';
import { registerCatalogResources } from './resources/items.js';
import { allTools } from './tools/index.js';

/**
 * Builds the server and registers everything on it. Deliberately free of any
 * transport concern.
 *
 * That separation is the escape hatch: if this project ever outgrows stdio and
 * needs a hosted endpoint (browser clients, shared state, secrets you cannot
 * hand to users), a Cloudflare Worker imports `createServer()` and wires it to
 * `StreamableHTTPServerTransport`. The tool implementations do not change —
 * only the file that owns the transport. See docs/ARCHITECTURE.md.
 */
export function createServer(): McpServer {
    const server = new McpServer(
        {
            name: config.server.name,
            title: config.server.title ?? config.server.name,
            version: config.server.version
        },
        {
            instructions: config.server.instructions,
            capabilities: {
                tools: {},
                ...(config.resources.enabled ? { resources: {} } : {})
            }
        }
    );

    for (const tool of allTools) {
        tool.register(server);
    }

    if (config.resources.enabled) {
        registerCatalogResources(server);
    }

    log.debug('server constructed', {
        tools: allTools.map(tool => tool.name),
        resources: config.resources.enabled
    });

    return server;
}

export { config } from './core/config.js';
export { getCatalog, getStatus, resetCatalogCache } from './core/catalog-client.js';
export { searchItems } from './core/search.js';
export type { Catalog, CatalogItem, CatalogStatus, McpTemplateConfig } from './core/types.js';
