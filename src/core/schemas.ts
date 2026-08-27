import { z } from 'zod';

/**
 * Runtime validation for the catalog document. The catalog is fetched over the
 * network from a static host, so it is untrusted input: a half-written
 * `catalog.json` on GitHub Pages must fail loudly here rather than surface as
 * `undefined` inside a tool result.
 *
 * scripts/build-catalog.mjs validates against catalog/catalog.schema.json,
 * which is the JSON-Schema mirror of this. Keep the two in step.
 */

export const CATALOG_CONTRACT_VERSION = 1;

export const catalogItemSchema = z
    .object({
        id: z
            .string()
            .min(1)
            .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'id must be URL-safe'),
        title: z.string().min(1),
        summary: z.string().default(''),
        category: z.string().min(1).optional(),
        tags: z.array(z.string().min(1)).default([]),
        url: z.string().url().optional(),
        content: z.string().optional(),
        metadata: z.record(z.unknown()).optional()
    })
    .strip();

export const catalogCategorySchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional()
    })
    .strip();

export const catalogSchema = z
    .object({
        version: z.number().int().positive(),
        generatedAt: z.string().optional(),
        project: z
            .object({
                name: z.string().optional(),
                description: z.string().optional(),
                homepage: z.string().optional(),
                repository: z.string().optional()
            })
            .strip()
            .optional(),
        categories: z.array(catalogCategorySchema).default([]),
        items: z.array(catalogItemSchema).default([])
    })
    .strip();

/** Parse + reject contract versions this build does not understand. */
export function parseCatalog(raw: unknown): z.infer<typeof catalogSchema> {
    const parsed = catalogSchema.parse(raw);
    if (parsed.version !== CATALOG_CONTRACT_VERSION) {
        throw new Error(
            `Catalog contract version ${parsed.version} is not supported by this server ` +
                `(expected ${CATALOG_CONTRACT_VERSION}). Upgrade the npm package.`
        );
    }
    return parsed;
}
