#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { config } from './core/config.js';
import { log } from './core/logger.js';
import { createServer } from './server.js';

/**
 * Transport wiring, and nothing else.
 *
 * stdio means the client spawns this file as a child process and talks JSON-RPC
 * over its stdin/stdout. There is no host to pay for, no endpoint to keep up and
 * no auth to implement — which is the entire point of shipping an MCP server
 * this way.
 */
async function main(): Promise<void> {
    const server = createServer();
    const transport = new StdioServerTransport();

    // The client kills the subprocess when the session ends; close cleanly so an
    // in-flight response is flushed rather than truncated mid-frame.
    const shutdown = (signal: string) => {
        log.debug(`received ${signal}, shutting down`);
        void server.close().finally(() => process.exit(0));
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // An unhandled rejection would otherwise die silently and the client would
    // only see a broken pipe.
    process.on('unhandledRejection', reason => {
        log.error('unhandled rejection', { reason: String(reason) });
    });

    await server.connect(transport);
    log.info(`${config.server.name} v${config.server.version} listening on stdio`);
}

main().catch((err: unknown) => {
    log.error('failed to start', { error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
    process.exit(1);
});
