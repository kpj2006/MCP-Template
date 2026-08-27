import { z } from 'zod';

import { getCatalog } from '../core/catalog-client.js';
import { config, displayNoun, toolNames } from '../core/config.js';
import { NotFoundError } from '../core/errors.js';
import { nearestIds, searchItems } from '../core/search.js';
import { defineTool } from './registry.js';

/** Retrieval tool. This is the only place the full body is returned. */
export const getItemTool = defineTool({
    name: toolNames.get,
    title: `Get ${displayNoun}`,
    description:
        `Fetch one ${displayNoun} in full, including its body content, by exact id. ` +
        `Ids come from ${toolNames.search}. If you only have keywords, search first — this tool does not do fuzzy matching.`,
    inputSchema: {
        id: z.string().min(1).describe(`Exact ${displayNoun} id, e.g. as returned by ${toolNames.search}.`)
    },
    outputSchema: {
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        category: z.string().optional(),
        tags: z.array(z.string()),
        url: z.string().optional(),
        content: z.string(),
        truncated: z.boolean(),
        metadata: z.record(z.unknown()).optional()
    },
    async run({ id }) {
        const catalog = await getCatalog();
        const item = catalog.items.find(candidate => candidate.id === id);

        if (!item) {
            // A wrong id is the single most common failure here, so spend a few
            // tokens turning the dead end into a usable next step. Two lookups,
            // because they fail in different ways: character similarity catches
            // a typo ("exampl" for "example"), keyword search catches a caller
            // who passed a phrase where an id was wanted.
            const candidates = [
                ...nearestIds(catalog.items, id, 3),
                ...searchItems(catalog.items, id, {}, 3).map(scored => scored.item.id)
            ];
            const near = [...new Set(candidates)].slice(0, 3);

            const hint = near.length
                ? `Closest ids: ${near.join(', ')}. Use ${toolNames.search} to confirm.`
                : `Call ${toolNames.search} with keywords, or ${toolNames.listCategories} to browse.`;
            throw new NotFoundError(displayNoun, id, hint);
        }

        const body = item.content ?? '';
        const truncated = body.length > config.limits.contentMaxChars;

        return {
            id: item.id,
            title: item.title,
            summary: item.summary ?? '',
            ...(item.category ? { category: item.category } : {}),
            tags: item.tags ?? [],
            ...(item.url ? { url: item.url } : {}),
            content: truncated ? body.slice(0, config.limits.contentMaxChars) : body,
            truncated,
            ...(item.metadata ? { metadata: item.metadata } : {})
        };
    },
    render(result) {
        const header = [
            `# ${result.title}`,
            `id: ${result.id}`,
            result.category ? `category: ${result.category}` : null,
            result.tags.length ? `tags: ${result.tags.join(', ')}` : null,
            result.url ? `source: ${result.url}` : null
        ]
            .filter(Boolean)
            .join('\n');

        const body = result.content.trim() || '(no body content for this entry)';
        const note = result.truncated
            ? `\n\n[truncated at ${config.limits.contentMaxChars} characters${result.url ? `; read the full text at ${result.url}` : ''}]`
            : '';

        return `${header}\n\n${body}${note}`;
    }
});
