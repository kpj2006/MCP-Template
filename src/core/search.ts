import type { CatalogItem } from './types.js';

/**
 * Dependency-free keyword ranking. A fuzzy-search library would be nicer for a
 * 100k-document corpus; a project catalog is hundreds of entries, so a weighted
 * token match over an in-memory array is both fast enough and one less
 * dependency for contributors to reason about.
 *
 * Field weights encode intent: a query word in a title means far more than the
 * same word buried in a body.
 */

const WEIGHTS = { id: 40, title: 8, tag: 5, category: 3, summary: 2, content: 0.5 } as const;

/** Cap the content contribution so one long document cannot outrank a precise title hit. */
const MAX_CONTENT_SCORE = 4;

export interface SearchFilters {
    category?: string;
    tags?: string[];
}

export interface ScoredItem {
    item: CatalogItem;
    score: number;
    /** Which fields matched. Useful in the tool result — the model can see why. */
    matchedIn: string[];
}

/**
 * `+`, `#` and `.` survive splitting so that `c++`, `c#` and `node.js` stay whole.
 *
 * Single characters are dropped only when the query has something longer to go
 * on: "solar a" should rank exactly like "solar", but a bare "R" must still be a
 * real search rather than an accidental match-everything.
 */
export function tokenize(input: string): string[] {
    const tokens = input
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter(Boolean);

    return tokens.some(token => token.length > 1) ? tokens.filter(token => token.length > 1) : tokens;
}

function countOccurrences(haystack: string, token: string): number {
    if (!haystack) return 0;
    let count = 0;
    let index = haystack.indexOf(token);
    while (index !== -1) {
        count += 1;
        index = haystack.indexOf(token, index + token.length);
    }
    return count;
}

function scoreItem(item: CatalogItem, tokens: string[]): ScoredItem | null {
    const title = item.title.toLowerCase();
    const summary = (item.summary ?? '').toLowerCase();
    const content = (item.content ?? '').toLowerCase();
    const category = (item.category ?? '').toLowerCase();
    const tags = (item.tags ?? []).map(tag => tag.toLowerCase());
    const id = item.id.toLowerCase();

    let score = 0;
    let contentScore = 0;
    const matchedIn = new Set<string>();
    let tokensMatched = 0;

    for (const token of tokens) {
        let tokenHit = false;

        if (id === token || id.includes(token)) {
            score += id === token ? WEIGHTS.id : WEIGHTS.id / 8;
            matchedIn.add('id');
            tokenHit = true;
        }
        if (title.includes(token)) {
            score += WEIGHTS.title;
            matchedIn.add('title');
            tokenHit = true;
        }
        if (tags.some(tag => tag === token)) {
            score += WEIGHTS.tag;
            matchedIn.add('tags');
            tokenHit = true;
        } else if (tags.some(tag => tag.includes(token))) {
            score += WEIGHTS.tag / 2;
            matchedIn.add('tags');
            tokenHit = true;
        }
        if (category.includes(token)) {
            score += WEIGHTS.category;
            matchedIn.add('category');
            tokenHit = true;
        }
        if (summary.includes(token)) {
            score += WEIGHTS.summary;
            matchedIn.add('summary');
            tokenHit = true;
        }
        const hits = countOccurrences(content, token);
        if (hits > 0) {
            contentScore += Math.min(hits, 5) * WEIGHTS.content;
            matchedIn.add('content');
            tokenHit = true;
        }

        if (tokenHit) tokensMatched += 1;
    }

    if (tokensMatched === 0) return null;

    score += Math.min(contentScore, MAX_CONTENT_SCORE);

    // Reward covering the whole query: "solar oracle" matching both words should
    // beat an item that mentions "solar" five times and never says "oracle".
    score *= tokensMatched / tokens.length;

    return { item, score, matchedIn: [...matchedIn] };
}

function passesFilters(item: CatalogItem, filters: SearchFilters): boolean {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.tags?.length) {
        const owned = new Set((item.tags ?? []).map(tag => tag.toLowerCase()));
        if (!filters.tags.every(tag => owned.has(tag.toLowerCase()))) return false;
    }
    return true;
}

/* -------------------------------------------------------- near-miss lookup */

function bigrams(value: string): Set<string> {
    const padded = ` ${value} `;
    const out = new Set<string>();
    for (let i = 0; i < padded.length - 1; i += 1) out.add(padded.slice(i, i + 2));
    return out;
}

/** Sørensen–Dice over character bigrams: cheap, and forgiving of a typo. */
function similarity(a: string, b: string): number {
    if (a === b) return 1;
    const left = bigrams(a);
    const right = bigrams(b);
    let shared = 0;
    for (const gram of left) if (right.has(gram)) shared += 1;
    return (2 * shared) / (left.size + right.size);
}

/**
 * Ids that look like what the caller typed.
 *
 * A wrong id is the most common way the get tool is called badly, and token
 * search does not help when the mistake is a single character —
 * "example" vs "examplx" shares no whole word. Character similarity does.
 */
export function nearestIds(
    items: readonly CatalogItem[],
    query: string,
    limit = 3,
    threshold = 0.4
): string[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    return items
        .map(item => {
            const id = item.id.toLowerCase();
            // A substring relationship is a strong signal that similarity alone
            // under-scores when the lengths differ a lot.
            const contains = id.includes(needle) || needle.includes(id) ? 0.5 : 0;
            return { id: item.id, score: Math.max(similarity(needle, id), contains) };
        })
        .filter(candidate => candidate.score >= threshold)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map(candidate => candidate.id);
}

/* ------------------------------------------------------------------ search */

export function searchItems(
    items: readonly CatalogItem[],
    query: string,
    filters: SearchFilters = {},
    limit = 10
): ScoredItem[] {
    const candidates = items.filter(item => passesFilters(item, filters));
    const tokens = tokenize(query);

    // A blank query is a browse, not a search: filters alone, stable alphabetical.
    if (query.trim() === '') {
        return candidates
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, limit)
            .map(item => ({ item, score: 0, matchedIn: [] }));
    }

    // A query that was all punctuation matched nothing. Returning the whole
    // catalog here would read to the caller as "these are your results".
    if (tokens.length === 0) return [];

    return candidates
        .map(item => scoreItem(item, tokens))
        .filter((scored): scored is ScoredItem => scored !== null)
        .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
        .slice(0, limit);
}
