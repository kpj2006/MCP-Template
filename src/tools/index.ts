import { catalogInfoTool } from './catalog-info.js';
import { getItemTool } from './get-item.js';
import { listCategoriesTool } from './list-categories.js';
import type { ToolModule } from './registry.js';
import { searchItemsTool } from './search-items.js';

/**
 * ADD YOUR PROJECT'S TOOLS HERE.
 *
 * Create `src/tools/my-tool.ts` exporting `defineTool({...})`, import it, and
 * append it to this array. Nothing else needs to change: capability
 * declaration, listing and dispatch all read from this one place.
 *
 * Before adding a tool, check whether the catalog can express it instead —
 * a new category or tag needs no code and no npm release.
 */
export const allTools: ToolModule[] = [
    searchItemsTool,
    getItemTool,
    listCategoriesTool,
    catalogInfoTool
];

export { defineTool } from './registry.js';
export type { ToolModule, ToolSpec } from './registry.js';
