import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { SNAPSHOT } from '../generated/runtime.js';
import { config } from './config.js';
import { CatalogUnavailableError } from './errors.js';
import { log } from './logger.js';
import { parseCatalog } from './schemas.js';
import type { Catalog, CatalogStatus, CatalogSource } from './types.js';

/**
 * Loads the catalog and keeps it in memory for the life of the process.
 *
 * The subprocess lives as long as the client session, so a plain Map with a TTL
 * is the whole cache. Disk caching is deliberately absent: it buys almost
 * nothing here and costs path-resolution and permission bugs across Windows,
 * macOS and Linux.
 *
 * Degradation ladder, in order: fresh remote -> unexpired memory -> stale memory
 * -> bundled snapshot. The server answers stale-but-useful rather than dying
 * when GitHub Pages has a bad minute.
 */

interface CacheEntry {
    catalog: Catalog;
    fetchedAt: number;
    etag: string | null;
    source: CatalogSource;
}

let entry: CacheEntry | null = null;
let inFlight: Promise<Catalog> | null = null;
let lastError: string | null = null;

const isFresh = (e: CacheEntry): boolean =>
    Date.now() - e.fetchedAt < config.catalog.cacheTtlSeconds * 1000;

/** `fetch` has no file: handler in Node, and local paths are handy in dev/CI. */
function asLocalPath(target: string): string | null {
    if (target.startsWith('file:')) return fileURLToPath(target);
    if (/^https?:/i.test(target)) return null;
    return target;
}

/**
 * Never log a target verbatim: `config.catalog.url` is project-configurable and
 * may carry credentials or a signed query token (a private/gated catalog
 * source). Logs get the origin only — enough to diagnose which host failed.
 */
function redactTarget(target: string): string {
    try {
        return new URL(target).origin;
    } catch {
        return 'local';
    }
}

async function loadOnce(target: string, etag: string | null): Promise<{ raw: unknown; etag: string | null } | 'not-modified'> {
    const localPath = asLocalPath(target);
    if (localPath) {
        return { raw: JSON.parse(await readFile(localPath, 'utf8')), etag: null };
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (etag) headers['if-none-match'] = etag;

    const res = await fetch(target, {
        headers,
        signal: AbortSignal.timeout(config.catalog.fetchTimeoutMs),
        redirect: 'follow'
    });

    if (res.status === 304) return 'not-modified';
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    return { raw: await res.json(), etag: res.headers.get('etag') };
}

async function loadWithRetry(target: string, etag: string | null) {
    const attempts = Math.max(0, config.catalog.fetchRetries) + 1;
    let lastFailure: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await loadOnce(target, etag);
        } catch (err) {
            lastFailure = err;
            if (attempt === attempts) break;
            const backoffMs = 250 * 2 ** (attempt - 1);
            log.debug(`catalog fetch attempt ${attempt}/${attempts} failed, retrying`, {
                target: redactTarget(target),
                backoffMs,
                error: String(err)
            });
            await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
    }
    throw lastFailure;
}

async function refresh(): Promise<Catalog> {
    const targets = [config.catalog.localFallbackUrl, config.catalog.url].filter(
        (t): t is string => typeof t === 'string' && t.length > 0
    );

    for (const target of targets) {
        try {
            const result = await loadWithRetry(target, entry?.etag ?? null);

            if (result === 'not-modified' && entry) {
                entry = { ...entry, fetchedAt: Date.now(), source: 'remote' };
                lastError = null;
                log.debug('catalog unchanged (304)', { target: redactTarget(target) });
                return entry.catalog;
            }
            if (result === 'not-modified') continue;

            const catalog = parseCatalog(result.raw);
            entry = {
                catalog,
                fetchedAt: Date.now(),
                etag: result.etag,
                source: asLocalPath(target) ? 'local' : 'remote'
            };
            lastError = null;
            log.info('catalog loaded', {
                target: redactTarget(target),
                items: catalog.items.length,
                generatedAt: catalog.generatedAt ?? null
            });
            return catalog;
        } catch (err) {
            lastError = String(err instanceof Error ? err.message : err);
            log.warn('catalog source failed', { target: redactTarget(target), error: lastError });
        }
    }

    // Stale is better than nothing: the data was valid, it is just old.
    if (entry) {
        log.warn('serving stale catalog', { ageSeconds: Math.round((Date.now() - entry.fetchedAt) / 1000) });
        entry = { ...entry, source: 'stale' };
        return entry.catalog;
    }

    try {
        const catalog = parseCatalog(SNAPSHOT);
        entry = { catalog, fetchedAt: Date.now(), etag: null, source: 'snapshot' };
        log.warn('serving bundled snapshot', { items: catalog.items.length });
        return catalog;
    } catch (err) {
        throw new CatalogUnavailableError(config.catalog.url, lastError ?? String(err));
    }
}

/** Single-flight: concurrent tool calls on a cold cache trigger one fetch. */
export async function getCatalog(): Promise<Catalog> {
    if (entry && isFresh(entry)) return entry.catalog;
    if (inFlight) return inFlight;

    inFlight = refresh().finally(() => {
        inFlight = null;
    });
    return inFlight;
}

export function getStatus(): CatalogStatus {
    return {
        source: entry?.source ?? 'snapshot',
        url: config.catalog.url,
        fetchedAt: entry ? new Date(entry.fetchedAt).toISOString() : null,
        itemCount: entry?.catalog.items.length ?? 0,
        categoryCount: entry?.catalog.categories.length ?? 0,
        generatedAt: entry?.catalog.generatedAt ?? null,
        lastError
    };
}

/** Test seam. */
export function resetCatalogCache(): void {
    entry = null;
    inFlight = null;
    lastError = null;
}
