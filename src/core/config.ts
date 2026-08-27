import { CONFIG as GENERATED } from '../generated/runtime.js';
import type { McpTemplateConfig } from './types.js';

/**
 * `mcp.config.json` is compiled into `src/generated/runtime.ts` at build time
 * (see scripts/generate-runtime.mjs). That keeps the server free of runtime
 * filesystem lookups — no path resolution that differs between `src/` and
 * `dist/`, between npx and a global install, or between Node and a Worker.
 *
 * A handful of values stay overridable by environment variable so you can point
 * a locally built server at a local catalog without rebuilding.
 */

function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildConfig(): McpTemplateConfig {
    return {
        ...GENERATED,
        catalog: {
            ...GENERATED.catalog,
            url: process.env.AOSSIE_MCP_CATALOG_URL ?? GENERATED.catalog.url,
            cacheTtlSeconds: envInt('AOSSIE_MCP_CACHE_TTL', GENERATED.catalog.cacheTtlSeconds),
            fetchTimeoutMs: envInt('AOSSIE_MCP_FETCH_TIMEOUT_MS', GENERATED.catalog.fetchTimeoutMs)
        }
    };
}

export const config: McpTemplateConfig = buildConfig();

/** MCP tool names must match /^[a-zA-Z0-9_-]{1,128}$/. */
function slug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

const prefix = config.naming.toolPrefix ? `${slug(config.naming.toolPrefix)}_` : '';
const noun = slug(config.naming.itemNoun) || 'item';
const nounPlural = slug(config.naming.itemNounPlural) || `${noun}s`;

/**
 * Tool names are derived from the noun so a docs project exposes `search_pages`
 * and a skills project exposes `search_skills`. Three specific names beat one
 * `query` tool with a mode flag — models pick from clear names far more
 * reliably than they fill a discriminated union.
 */
export const toolNames = {
    search: `${prefix}search_${nounPlural}`,
    get: `${prefix}get_${noun}`,
    listCategories: `${prefix}list_categories`,
    catalogInfo: `${prefix}catalog_info`
} as const;

export const nouns = { singular: noun, plural: nounPlural } as const;

/** Human-facing noun for descriptions, e.g. "skill" from itemNoun "Skill". */
export const displayNoun = config.naming.itemNoun.trim() || 'item';
export const displayNounPlural = config.naming.itemNounPlural.trim() || `${displayNoun}s`;
