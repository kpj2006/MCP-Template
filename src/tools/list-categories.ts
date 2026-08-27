import { z } from 'zod';

import { getCatalog } from '../core/catalog-client.js';
import { displayNounPlural, toolNames } from '../core/config.js';
import { defineTool } from './registry.js';

/**
 * Orientation tool. Cheap to call and it teaches the model the vocabulary the
 * other two tools expect, which cuts down on guessed category filters.
 */
export const listCategoriesTool = defineTool({
    name: toolNames.listCategories,
    title: 'List categories',
    description:
        `List every category in the catalog with a count of how many ${displayNounPlural} it holds. ` +
        `Call this to learn valid category ids before filtering ${toolNames.search}, or to orient yourself in an unfamiliar catalog.`,
    inputSchema: {},
    outputSchema: {
        totalItems: z.number().int(),
        categories: z.array(
            z.object({
                id: z.string(),
                name: z.string(),
                description: z.string().optional(),
                itemCount: z.number().int()
            })
        ),
        uncategorizedCount: z.number().int()
    },
    async run() {
        const catalog = await getCatalog();

        const counts = new Map<string, number>();
        let uncategorized = 0;
        for (const item of catalog.items) {
            if (!item.category) {
                uncategorized += 1;
                continue;
            }
            counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
        }

        const declared = catalog.categories.map(category => ({
            id: category.id,
            name: category.name,
            ...(category.description ? { description: category.description } : {}),
            itemCount: counts.get(category.id) ?? 0
        }));

        // Categories used by items but missing from `categories` are still real
        // to a caller filtering on them, so surface them rather than hide them.
        const declaredIds = new Set(declared.map(c => c.id));
        const orphaned = [...counts.keys()]
            .filter(id => !declaredIds.has(id))
            .map(id => ({ id, name: id, itemCount: counts.get(id) ?? 0 }));

        return {
            totalItems: catalog.items.length,
            categories: [...declared, ...orphaned].sort((a, b) => b.itemCount - a.itemCount || a.id.localeCompare(b.id)),
            uncategorizedCount: uncategorized
        };
    },
    render(result) {
        if (result.categories.length === 0) {
            return `The catalog declares no categories (${result.totalItems} ${displayNounPlural} total).`;
        }
        const lines = result.categories.map(
            c => `- ${c.id} (${c.itemCount}) — ${c.description ?? c.name}`
        );
        const tail = result.uncategorizedCount
            ? `\n${result.uncategorizedCount} entr(ies) have no category.`
            : '';
        return `${result.totalItems} ${displayNounPlural} across ${result.categories.length} categor(ies):\n${lines.join('\n')}${tail}`;
    }
});
