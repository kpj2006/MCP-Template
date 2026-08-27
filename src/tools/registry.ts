import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z, ZodRawShape } from 'zod';

import { ToolError } from '../core/errors.js';
import { log } from '../core/logger.js';

/**
 * One array is the single source of truth for the server's tools. `ListTools`
 * and `CallTool` are both derived from the registrations, so adding a tool is
 * one new file plus one line in `allTools` — there is no separate list handler
 * to forget to update.
 */

export interface ToolModule {
    name: string;
    register(server: McpServer): void;
}

type Shape<S extends ZodRawShape> = z.objectOutputType<S, z.ZodTypeAny>;

export interface ToolSpec<I extends ZodRawShape, O extends ZodRawShape> {
    name: string;
    title: string;
    /**
     * The model reads this to decide whether to call the tool. Say what it
     * returns and when to prefer it over the sibling tools.
     */
    description: string;
    inputSchema: I;
    outputSchema: O;
    annotations?: ToolAnnotations;
    run(args: Shape<I>): Promise<Shape<O>>;
    /** Compact prose for the `content` block. Keep it terse; it costs tokens. */
    render(result: Shape<O>): string;
}

export function defineTool<I extends ZodRawShape, O extends ZodRawShape>(
    spec: ToolSpec<I, O>
): ToolModule {
    return {
        name: spec.name,
        register(server) {
            server.registerTool(
                spec.name,
                {
                    title: spec.title,
                    description: spec.description,
                    inputSchema: spec.inputSchema,
                    outputSchema: spec.outputSchema,
                    annotations: {
                        readOnlyHint: true,
                        idempotentHint: true,
                        openWorldHint: true,
                        ...spec.annotations
                    }
                },
                // The SDK's ToolCallback generic is keyed to its own schema
                // normalisation; the cast keeps `spec.run` strongly typed for us
                // while satisfying the registration signature.
                (async (args: Shape<I>) => {
                    try {
                        const result = await spec.run(args);
                        return {
                            content: [{ type: 'text' as const, text: spec.render(result) }],
                            structuredContent: result as Record<string, unknown>
                        };
                    } catch (err) {
                        return toErrorResult(spec.name, err);
                    }
                }) as never
            );
        }
    };
}

/**
 * Tool failures are reported in-band (`isError: true`) rather than thrown as
 * protocol errors, so the model can read what went wrong and adjust. Raw stack
 * traces are logged to stderr and never returned — they leak local paths and
 * the model cannot act on them.
 */
function toErrorResult(toolName: string, err: unknown) {
    if (err instanceof ToolError) {
        log.warn(`${toolName} rejected the request`, { error: err.message });
        const text = err.hint ? `${err.message}\n\n${err.hint}` : err.message;
        return { content: [{ type: 'text' as const, text }], isError: true as const };
    }

    log.error(`${toolName} failed unexpectedly`, {
        error: err instanceof Error ? (err.stack ?? err.message) : String(err)
    });
    return {
        content: [
            {
                type: 'text' as const,
                text: `${toolName} failed unexpectedly. The server logged details to stderr.`
            }
        ],
        isError: true as const
    };
}
