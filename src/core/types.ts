/**
 * Shared types for the template. Nothing here is project-specific — a project
 * onboards by editing `mcp.config.json` and `catalog/`, not this file.
 */

/** A single entry in the catalog. Generic on purpose: a "skill", a doc page, a repo. */
export interface CatalogItem {
    /** Stable, URL-safe identifier. This is what `get_<noun>` takes. */
    id: string;
    /** Human-readable name. Heaviest-weighted search field. */
    title: string;
    /** One-liner. Returned by search; keep it short — it costs the caller context. */
    summary: string;
    /** Category id, must match an entry in `Catalog.categories`. */
    category?: string;
    tags?: string[];
    /** Canonical web location, if the item exists somewhere public. */
    url?: string;
    /** Full body. Returned ONLY by `get_<noun>`, never by search. */
    content?: string;
    /** Anything project-specific. Passed through untouched. */
    metadata?: Record<string, unknown>;
}

export interface CatalogCategory {
    id: string;
    name: string;
    description?: string;
}

export interface Catalog {
    /** Contract version of this document. The client refuses versions it cannot read. */
    version: number;
    /** ISO 8601. Lets callers reason about staleness. */
    generatedAt?: string;
    project?: {
        name?: string;
        description?: string;
        homepage?: string;
        repository?: string;
    };
    categories: CatalogCategory[];
    items: CatalogItem[];
}

export interface McpTemplateConfig {
    server: {
        name: string;
        title?: string;
        version: string;
        instructions?: string;
    };
    catalog: {
        url: string;
        /** Optional filesystem path or file: URL tried before `url`. For local dev. */
        localFallbackUrl?: string | null;
        cacheTtlSeconds: number;
        fetchTimeoutMs: number;
        fetchRetries: number;
    };
    naming: {
        toolPrefix: string;
        itemNoun: string;
        itemNounPlural: string;
    };
    limits: {
        searchDefaultLimit: number;
        searchMaxLimit: number;
        summaryMaxChars: number;
        contentMaxChars: number;
    };
    resources: {
        enabled: boolean;
        uriScheme: string;
    };
}

/** Where the in-memory catalog came from. Surfaced by the catalog-info tool. */
export type CatalogSource = 'remote' | 'cache' | 'stale' | 'snapshot' | 'local';

export interface CatalogStatus {
    source: CatalogSource;
    url: string;
    fetchedAt: string | null;
    itemCount: number;
    categoryCount: number;
    generatedAt: string | null;
    /** Set when the last remote fetch failed and we degraded to stale/snapshot. */
    lastError: string | null;
}
