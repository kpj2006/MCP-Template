/**
 * stdout belongs to the JSON-RPC stream. A single stray `console.log` corrupts
 * the framing and the client reports an opaque connection failure.
 *
 * Everything diagnostic goes to stderr, through here.
 * `scripts/check-stdout.mjs` fails the build if anything else in src/ can reach
 * stdout, so this stays the only door.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 } as const;
type Level = keyof typeof LEVELS;

function resolveLevel(): Level {
    const raw = (process.env.AOSSIE_MCP_LOG_LEVEL ?? '').toLowerCase();
    return raw in LEVELS ? (raw as Level) : 'info';
}

const threshold = LEVELS[resolveLevel()];

function emit(level: Exclude<Level, 'silent'>, msg: string, meta?: unknown): void {
    if (LEVELS[level] < threshold) return;
    const tail = meta === undefined ? '' : ` ${safeStringify(meta)}`;
    // The one sanctioned write in the codebase. See scripts/check-stdout.mjs.
    process.stderr.write(`[${level}] ${msg}${tail}\n`);
}

function safeStringify(value: unknown): string {
    try {
        return typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
        return '[unserialisable]';
    }
}

export const log = {
    debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
    info: (msg: string, meta?: unknown) => emit('info', msg, meta),
    warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
    error: (msg: string, meta?: unknown) => emit('error', msg, meta)
};
