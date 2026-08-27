import { z } from 'zod';

import { getCatalog } from '../core/catalog-client.js';
import { config, displayNoun, displayNounPlural, toolNames } from '../core/config.js';
import { searchItems } from '../core/search.js';
import { defineTool } from './registry.js';

/**
 * Discovery tool. Returns a trimmed projection — never the full item body.
 * Every field returned costs the calling model context, so search hands back
 * enough to choose (`id`, `title`, `summary`, `category`, `tags`) and leaves the
 * body to `get_<noun>`.
 */
export const searchItemsTool = defineTool({
    name: toolNames.search,
    title: `Search ${displayNounPlural}`,
    description:
        `Search the ${displayNounPlural} catalog by keyword and return ranked summaries. ` +
        `Use this first to find candidates; then call ${toolNames.get} with an id to read one in full. ` +
        `Optionally narrow by category or tags. Pass an empty query with a filter to browse.`,
    inputSchema: {
        query: z
            .string()
            .default('')
            .describe(`Keywords to match against ${displayNoun} titles, tags, summaries and bodies.`),
        category: z
            .string()
            .optional()
            .describe(`Restrict to one category id. Call ${toolNames.listCategories} to see valid ids.`),
        tags: z
            .array(z.string())
            .optional()
            .describe('Only return results carrying all of these tags.'),
        limit: z
            .number()
            .int()
            .min(1)
            .max(config.limits.searchMaxLimit)
            .optional()
            .describe(`Maximum results (default ${config.limits.searchDefaultLimit}).`)
    },
    outputSchema: {
        query: z.string(),
        totalMatches: z.number().int(),
        returned: z.number().int(),
        results: z.array(
            z.object({
                id: z.string(),
                title: z.string(),
                summary: z.string(),
                category: z.string().optional(),
                tags: z.array(z.string()),
                url: z.string().optional(),
                matchedIn: z.array(z.string())
            })
        )
    },
    async run({ query, category, tags, limit }) {
        const catalog = await getCatalog();
        const filters = { ...(category ? { category } : {}), ...(tags?.length ? { tags } : {}) };
        const effectiveLimit = limit ?? config.limits.searchDefaultLimit;

        // Rank once without a limit so `totalMatches` is honest, then slice.
        const all = searchItems(catalog.items, query, filters, Number.MAX_SAFE_INTEGER);

        return {
            query,
            totalMatches: all.length,
            returned: Math.min(all.length, effectiveLimit),
            results: all.slice(0, effectiveLimit).map(({ item, matchedIn }) => ({
                id: item.id,
                title: item.title,
                summary: truncate(item.summary ?? '', config.limits.summaryMaxChars),
                ...(item.category ? { category: item.category } : {}),
                tags: item.tags ?? [],
                ...(item.url ? { url: item.url } : {}),
                matchedIn
            }))
        };
    },
    render(result) {
        if (result.results.length === 0) {
            return `No ${displayNounPlural} matched "${result.query}". Try broader keywords, or call ${toolNames.listCategories} to browse.`;
        }
        const lines = result.results.map(r => {
            const meta = [r.category, r.tags.length ? r.tags.join(', ') : null].filter(Boolean).join(' | ');
            return `- ${r.id} — ${r.title}${meta ? ` (${meta})` : ''}\n  ${r.summary}`;
        });
        const more =
            result.totalMatches > result.returned
                ? `\n\n${result.totalMatches - result.returned} further match(es) not shown; raise \`limit\` to see them.`
                : '';
        return `${result.returned} of ${result.totalMatches} match(es):\n${lines.join('\n')}${more}`;
    }
});

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
