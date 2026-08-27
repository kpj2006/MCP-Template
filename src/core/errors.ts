/**
 * Tool handlers throw these; `wrapHandler` in tools/registry.ts turns them into
 * `isError: true` results. Never let a raw stack trace reach the model — it is
 * noise the model cannot act on and it leaks local paths.
 */
export class ToolError extends Error {
    constructor(
        message: string,
        readonly hint?: string
    ) {
        super(message);
        this.name = 'ToolError';
    }
}

export class NotFoundError extends ToolError {
    constructor(what: string, id: string, hint?: string) {
        super(`No ${what} found with id "${id}".`, hint);
        this.name = 'NotFoundError';
    }
}

export class CatalogUnavailableError extends ToolError {
    constructor(url: string, cause: string) {
        super(
            `The catalog at ${url} could not be loaded and no bundled fallback was usable (${cause}).`,
            'This is a server-side data problem, not a bad request. Retrying will not help until the catalog is reachable.'
        );
        this.name = 'CatalogUnavailableError';
    }
}
