import { z } from 'zod';

import { getCatalog, getStatus } from '../core/catalog-client.js';
import { config, toolNames } from '../core/config.js';
import { defineTool } from './registry.js';

/**
 * Diagnostics without touching stdout. When someone reports "the tools return
 * nothing", this answers the first three questions — did the catalog load, from
 * where, and how old is it — from inside the client, with no log spelunking.
 */
export const catalogInfoTool = defineTool({
    name: toolNames.catalogInfo,
    title: 'Catalog info',
    description:
        'Report where the catalog was loaded from, when, how many entries it holds, and whether the server is serving live, stale or bundled fallback data. ' +
        'Call this when results look empty or out of date, before concluding the data is missing.',
    inputSchema: {},
    outputSchema: {
        server: z.object({ name: z.string(), version: z.string() }),
        source: z.string(),
        url: z.string(),
        fetchedAt: z.string().nullable(),
        generatedAt: z.string().nullable(),
        itemCount: z.number().int(),
        categoryCount: z.number().int(),
        cacheTtlSeconds: z.number().int(),
        lastError: z.string().nullable(),
        project: z
            .object({
                name: z.string().optional(),
                description: z.string().optional(),
                homepage: z.string().optional(),
                repository: z.string().optional()
            })
            .optional()
    },
    async run() {
        // Force a load first, otherwise a cold cache reports zeros.
        const catalog = await getCatalog();
        const status = getStatus();

        return {
            server: { name: config.server.name, version: config.server.version },
            source: status.source,
            url: status.url,
            fetchedAt: status.fetchedAt,
            generatedAt: status.generatedAt,
            itemCount: status.itemCount,
            categoryCount: status.categoryCount,
            cacheTtlSeconds: config.catalog.cacheTtlSeconds,
            lastError: status.lastError,
            ...(catalog.project ? { project: catalog.project } : {})
        };
    },
    render(result) {
        const freshness: Record<string, string> = {
            remote: 'live from the catalog host',
            local: 'read from a local file (development mode)',
            cache: 'served from the in-process cache',
            stale: 'STALE — the last refresh failed, serving the previous copy',
            snapshot: 'BUNDLED SNAPSHOT — the catalog host was unreachable'
        };
        const lines = [
            `${result.server.name} v${result.server.version}`,
            `catalog: ${result.url}`,
            `state: ${result.source} (${freshness[result.source] ?? 'unknown'})`,
            `entries: ${result.itemCount} across ${result.categoryCount} categor(ies)`,
            `catalog built: ${result.generatedAt ?? 'unknown'}`,
            `fetched: ${result.fetchedAt ?? 'never'} (TTL ${result.cacheTtlSeconds}s)`
        ];
        if (result.lastError) lines.push(`last error: ${result.lastError}`);
        return lines.join('\n');
    }
});
