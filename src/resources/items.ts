import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getCatalog } from '../core/catalog-client.js';
import { config, displayNoun, displayNounPlural } from '../core/config.js';
import { log } from '../core/logger.js';

/**
 * Resources are the read-side complement to tools: a client can browse and
 * attach catalog entries as context without spending a tool call, and a user can
 * pick one by hand in clients that render a resource picker.
 *
 * Tools stay the primary interface — resource support varies far more between
 * clients than tool support does — so nothing here is required for the server to
 * be useful. Set `resources.enabled` to false in mcp.config.json to drop it.
 */
export function registerCatalogResources(server: McpServer): void {
    const scheme = config.resources.uriScheme;

    // Whole-catalog resource: one attachment gives a client the full index.
    server.registerResource(
        'catalog',
        `${scheme}://catalog`,
        {
            title: `${displayNounPlural} catalog`,
            description: `The complete ${displayNounPlural} catalog as JSON, exactly as served to the tools.`,
            mimeType: 'application/json'
        },
        async uri => {
            const catalog = await getCatalog();
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(catalog, null, 2)
                    }
                ]
            };
        }
    );

    // One resource per entry, enumerable so clients can show a picker.
    server.registerResource(
        displayNoun,
        new ResourceTemplate(`${scheme}://${displayNoun}/{id}`, {
            list: async () => {
                const catalog = await getCatalog();
                return {
                    resources: catalog.items.map(item => ({
                        uri: `${scheme}://${displayNoun}/${encodeURIComponent(item.id)}`,
                        name: item.id,
                        title: item.title,
                        description: item.summary || undefined,
                        mimeType: 'text/markdown'
                    }))
                };
            }
        }),
        {
            title: `A single ${displayNoun}`,
            description: `The full text of one ${displayNoun}, addressed by id.`,
            mimeType: 'text/markdown'
        },
        async (uri, variables) => {
            const raw = Array.isArray(variables.id) ? variables.id[0] : variables.id;
            const id = decodeURIComponent(String(raw ?? ''));
            const catalog = await getCatalog();
            const item = catalog.items.find(candidate => candidate.id === id);

            if (!item) {
                // Resource reads have no `isError` channel — throwing is correct
                // here and surfaces to the client as a read failure.
                throw new Error(`No ${displayNoun} with id "${id}".`);
            }

            const header = `# ${item.title}\n\n${item.summary ?? ''}`.trim();
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'text/markdown',
                        text: `${header}\n\n${item.content ?? ''}`.trim()
                    }
                ]
            };
        }
    );

    log.debug('catalog resources registered', { scheme });
}
