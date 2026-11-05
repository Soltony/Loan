import prisma from './prisma';
import logger from './logger';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

interface AuditLogData {
    actorId: string;
    action: string;
    entity?: string;
    entityId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
}

type ExternalApiAuditBase = {
    actorId: string;
    ipAddress?: string;
    userAgent?: string;
    integration: string; // e.g. DISBURSEMENT, SMS, TOKEN_VALIDATION
    entity?: string;
    entityId?: string;
    correlationId?: string;
};

type ExternalApiRequestDetails = {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
};

type ExternalApiResponseDetails = {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: unknown;
    durationMs?: number;
};

function truncateString(value: string, maxLen = 4000) {
    const str = value ?? '';
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + `…(truncated, len=${str.length})`;
}

function sanitizeUrl(url: string) {
    try {
        const u = new URL(url);
        const keys = Array.from(u.searchParams.keys());
        const query = keys.length ? `?${keys.map(k => `${encodeURIComponent(k)}=`).join('&')}` : '';
        return `${u.origin}${u.pathname}${query}`;
    } catch {
        return truncateString(String(url), 1000);
    }
}

function sanitizeHeaders(headers?: Record<string, string> | Headers | null) {
    if (!headers) return undefined;

    const out: Record<string, string> = {};
    const set = (kRaw: string, vRaw: string) => {
        const k = String(kRaw);
        const lower = k.toLowerCase();
        if (lower === 'authorization' || lower === 'cookie' || lower === 'set-cookie' || lower === 'x-api-key') {
            out[k] = '[redacted]';
            return;
        }
        out[k] = truncateString(String(vRaw), 500);
    };

    if (typeof (headers as any).forEach === 'function') {
        (headers as any).forEach((v: any, k: any) => set(k, v));
        return out;
    }

    for (const [k, v] of Object.entries(headers as Record<string, string>)) {
        set(k, v);
    }
    return out;
}

/**
 * The client IP (first hop of x-forwarded-for) and user agent to record with an
 * audit entry. Same rule as the manual-repayment module's `requestActorContext`.
 */
export function auditRequestContext(req: Request): { ipAddress: string; userAgent: string } {
    const forwarded = req.headers.get('x-forwarded-for');
    return {
        ipAddress: (forwarded ? forwarded.split(',')[0].trim() : null) || req.headers.get('x-real-ip') || 'N/A',
        userAgent: req.headers.get('user-agent') || 'N/A',
    };
}

export function sanitizeForAudit(value: unknown, opts?: { maxDepth?: number; maxArrayLen?: number; maxStringLen?: number }) {
    const maxDepth = opts?.maxDepth ?? 6;
    const maxArrayLen = opts?.maxArrayLen ?? 50;
    const maxStringLen = opts?.maxStringLen ?? 4000;

    const redactKey = (k: string) => /pass(word)?|secret|token|authorization|api[_-]?key|signature/i.test(k);

    const walk = (v: any, depth: number): any => {
        if (v == null) return v;
        if (depth <= 0) return '[max-depth]';

        if (typeof v === 'string') return truncateString(v, maxStringLen);
        if (typeof v === 'number' || typeof v === 'boolean') return v;

        if (Array.isArray(v)) {
            const slice = v.slice(0, maxArrayLen).map(x => walk(x, depth - 1));
            if (v.length > maxArrayLen) {
                slice.push(`[+${v.length - maxArrayLen} more]`);
            }
            return slice;
        }

        if (typeof v === 'object') {
            const out: Record<string, any> = {};
            for (const [k, val] of Object.entries(v)) {
                if (redactKey(k)) {
                    out[k] = '[redacted]';
                } else {
                    out[k] = walk(val, depth - 1);
                }
            }
            return out;
        }

        try {
            return truncateString(String(v), maxStringLen);
        } catch {
            return '[unserializable]';
        }
    };

    return walk(value, maxDepth);
}

export function newAuditCorrelationId() {
    try {
        return randomUUID();
    } catch {
        return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }
}

export async function auditExternalApiRequest(base: ExternalApiAuditBase, req: ExternalApiRequestDetails) {
    const correlationId = base.correlationId ?? newAuditCorrelationId();
    await createAuditLog({
        actorId: base.actorId,
        action: 'EXTERNAL_API_REQUEST_SENT',
        entity: base.entity ?? 'EXTERNAL_API',
        entityId: base.entityId,
        ipAddress: base.ipAddress,
        userAgent: base.userAgent,
        details: sanitizeForAudit({
            correlationId,
            integration: base.integration,
            request: {
                method: req.method,
                url: sanitizeUrl(req.url),
                headers: sanitizeHeaders(req.headers),
                body: sanitizeForAudit(req.body),
            },
        }),
    });

    return correlationId;
}

export async function auditExternalApiResponse(base: ExternalApiAuditBase, res: ExternalApiResponseDetails) {
    const correlationId = base.correlationId ?? newAuditCorrelationId();
    await createAuditLog({
        actorId: base.actorId,
        action: 'EXTERNAL_API_RESPONSE_RECEIVED',
        entity: base.entity ?? 'EXTERNAL_API',
        entityId: base.entityId,
        ipAddress: base.ipAddress,
        userAgent: base.userAgent,
        details: sanitizeForAudit({
            correlationId,
            integration: base.integration,
            response: {
                status: res.status,
                statusText: res.statusText,
                headers: sanitizeHeaders(res.headers as any),
                body: sanitizeForAudit(res.body),
                durationMs: res.durationMs,
            },
        }),
    });

    return correlationId;
}

export async function auditExternalApiError(base: ExternalApiAuditBase, error: unknown, extra?: { durationMs?: number; request?: Partial<ExternalApiRequestDetails> }) {
    const correlationId = base.correlationId ?? newAuditCorrelationId();
    const message = error instanceof Error ? error.message : String(error);
    await createAuditLog({
        actorId: base.actorId,
        action: 'EXTERNAL_API_ERROR',
        entity: base.entity ?? 'EXTERNAL_API',
        entityId: base.entityId,
        ipAddress: base.ipAddress,
        userAgent: base.userAgent,
        details: sanitizeForAudit({
            correlationId,
            integration: base.integration,
            error: {
                message,
                name: error instanceof Error ? error.name : undefined,
            },
            durationMs: extra?.durationMs,
            request: extra?.request
                ? {
                      method: extra.request.method,
                      url: extra.request.url ? sanitizeUrl(extra.request.url) : undefined,
                      headers: extra.request.headers ? sanitizeHeaders(extra.request.headers) : undefined,
                      body: extra.request.body ? sanitizeForAudit(extra.request.body) : undefined,
                  }
                : undefined,
        }),
    });

    return correlationId;
}

/**
 * Creates a structured audit log entry in the database.
 * This is used for compliance and tracking critical actions.
 * Never throws: an entry the database will not take is kept on disk and replayed
 * later (see "Durability" below), so callers never fail after their action is done.
 * @param data - The data for the audit log entry.
 */
export async function createAuditLog(data: AuditLogData) {
    'use server';
    await persistAuditRows([toAuditRow(data)]);
}

/**
 * Writes many audit entries in a few statements, e.g. one per borrower a batch job
 * flags. Never throws, like `createAuditLog`.
 */
export async function createAuditLogs(entries: AuditLogData[]) {
    if (entries.length === 0) return;
    await persistAuditRows(entries.map(toAuditRow));
}

// ---------------------------------------------------------------------------
// Durability
//
// Audit writes usually run after the action they record has committed (money has
// moved, a role has changed), so failing the request would be worse than useless.
// Instead a write that fails twice is appended to a local JSON-lines file, and the
// file is replayed into the table once writes succeed again. Every row carries its
// own id and timestamp from the moment it was recorded, so a retry or replay can
// never duplicate an entry or misdate it.
// ---------------------------------------------------------------------------

type AuditRow = {
    id: string;
    actorId: string;
    action: string;
    entity: string | null;
    entityId: string | null;
    details: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
};

// 9 bound columns per row; 200 rows stays under SQL Server's 2100-parameter limit.
const AUDIT_BULK_CHUNK = 200;
// Lookups bind one parameter per id.
const AUDIT_ID_LOOKUP_CHUNK = 1000;
// NVARCHAR(1000) columns; a longer value would fail the insert on every attempt.
const AUDIT_SHORT_COLUMN_MAX = 1000;
const AUDIT_RETRY_DELAY_MS = 250;
const AUDIT_REPLAY_CHECK_INTERVAL_MS = 60_000;

const AUDIT_FALLBACK_DIR = process.env.AUDIT_FALLBACK_DIR || process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');
const AUDIT_FALLBACK_FILE = 'audit-fallback.jsonl';
const AUDIT_REPLAYING_SUFFIX = '.replaying';
// Lines that can never be inserted (unparseable, or rejected by the table) are moved
// here for a person to look at; they are never dropped.
const AUDIT_REJECTED_FILE = 'audit-fallback.rejected.jsonl';

function fitColumn(value: string | null | undefined, max = AUDIT_SHORT_COLUMN_MAX): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value);
    return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function serializeDetails(details: unknown): string | null {
    if (!details) return null;
    try {
        return JSON.stringify(details);
    } catch {
        // Circular or BigInt values: keep a bounded, printable copy rather than lose the entry.
        try {
            return JSON.stringify(sanitizeForAudit(details));
        } catch {
            return JSON.stringify(String(details));
        }
    }
}

function toAuditRow(data: AuditLogData): AuditRow {
    return {
        id: randomUUID(),
        actorId: fitColumn(data.actorId) || 'unknown',
        action: fitColumn(data.action) || 'UNKNOWN',
        entity: fitColumn(data.entity),
        entityId: fitColumn(data.entityId),
        details: serializeDetails(data.details),
        ipAddress: fitColumn(data.ipAddress),
        userAgent: data.userAgent ?? null,
        createdAt: new Date(),
    };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorCode = (error: unknown) => (error as { code?: unknown } | null)?.code;
const isDuplicateKey = (error: unknown) => errorCode(error) === 'P2002';
// P2xxx (other than duplicate key) means the row itself is bad; retrying cannot help.
const isRowError = (error: unknown) => {
    const code = errorCode(error);
    return typeof code === 'string' && code.startsWith('P2') && code !== 'P2002';
};
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Inserts one chunk. A duplicate key means some rows already landed (a retry after
 * a lost acknowledgement, or two replays racing), so the chunk is redone row by row
 * and rows that already exist are skipped.
 */
async function insertChunk(rows: AuditRow[]) {
    try {
        await prisma.auditLog.createMany({ data: rows });
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        for (const row of rows) {
            try {
                await prisma.auditLog.create({ data: row });
            } catch (rowError) {
                if (!isDuplicateKey(rowError)) throw rowError;
            }
        }
    }
}

async function persistAuditRows(rows: AuditRow[]) {
    for (let i = 0; i < rows.length; i += AUDIT_BULK_CHUNK) {
        const chunk = rows.slice(i, i + AUDIT_BULK_CHUNK);
        try {
            await insertChunk(chunk);
        } catch {
            await sleep(AUDIT_RETRY_DELAY_MS);
            try {
                await insertChunk(chunk);
            } catch (error) {
                // This chunk and everything after it go to disk; replay sorts out bad rows.
                saveToFallback(rows.slice(i), error);
                return;
            }
        }
    }
    maybeReplayFallback();
}

const fallbackPath = (name: string) => path.join(AUDIT_FALLBACK_DIR, name);
const toFallbackLine = (row: AuditRow) => JSON.stringify({ ...row, createdAt: row.createdAt.toISOString() });

// True when this process may have entries on disk. Starts true so a fresh process
// picks up whatever an earlier one left behind.
let fallbackPending = true;
let lastReplayCheck = 0;
let replayInFlight: Promise<AuditReplayResult> | null = null;

function saveToFallback(rows: AuditRow[], error: unknown) {
    const lines = rows.map(toFallbackLine).join('\n') + '\n';
    try {
        fs.mkdirSync(AUDIT_FALLBACK_DIR, { recursive: true });
        // Synchronous, so the entries are on disk even if the process dies right after.
        fs.appendFileSync(fallbackPath(AUDIT_FALLBACK_FILE), lines, 'utf8');
        fallbackPending = true;
        const message = `[audit] database write failed; ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} kept in ${fallbackPath(AUDIT_FALLBACK_FILE)} for replay: ${describe(error)}`;
        console.error(message);
        void logger.error(message);
    } catch (fileError) {
        // Last resort: put the entries in the process output so they still exist somewhere.
        console.error('[audit] database write AND fallback file failed; entries follow:\n' + lines, fileError);
    }
}

function maybeReplayFallback() {
    if (!fallbackPending || replayInFlight) return;
    if (Date.now() - lastReplayCheck < AUDIT_REPLAY_CHECK_INTERVAL_MS) return;
    lastReplayCheck = Date.now();
    void replayAuditFallback().catch((error) => console.error('[audit] fallback replay failed:', error));
}

function parseFallbackLine(line: string): AuditRow | null {
    try {
        const v = JSON.parse(line);
        const str = (x: unknown) => (typeof x === 'string' ? x : null);
        const createdAt = new Date(v?.createdAt);
        if (!str(v?.id) || !str(v?.action) || Number.isNaN(createdAt.getTime())) return null;
        return {
            id: v.id,
            actorId: str(v.actorId) || 'unknown',
            action: v.action,
            entity: str(v.entity),
            entityId: str(v.entityId),
            details: str(v.details),
            ipAddress: str(v.ipAddress),
            userAgent: str(v.userAgent),
            createdAt,
        };
    } catch {
        return null;
    }
}

export type AuditReplayResult = {
    files: number;
    inserted: number;
    alreadyPresent: number;
    rejected: number;
    /** True when the database failed mid-replay; the remaining files are kept for next time. */
    stopped: boolean;
};

/**
 * Moves audit entries saved on disk during a database outage into the table.
 * Runs automatically after the next successful audit write; also callable from a
 * script or the worker (`audit-replay`). Safe to run from several processes at once.
 */
export async function replayAuditFallback(): Promise<AuditReplayResult> {
    if (!replayInFlight) {
        replayInFlight = replayFallbackFiles().finally(() => {
            replayInFlight = null;
        });
    }
    return replayInFlight;
}

async function replayFallbackFiles(): Promise<AuditReplayResult> {
    const result: AuditReplayResult = { files: 0, inserted: 0, alreadyPresent: 0, rejected: 0, stopped: false };
    if (!fs.existsSync(AUDIT_FALLBACK_DIR)) {
        fallbackPending = false;
        return result;
    }

    // Claim the live file by renaming it; anything written from now on starts a new one.
    if (fs.existsSync(fallbackPath(AUDIT_FALLBACK_FILE))) {
        try {
            fs.renameSync(
                fallbackPath(AUDIT_FALLBACK_FILE),
                fallbackPath(`${AUDIT_FALLBACK_FILE}.${Date.now()}-${process.pid}${AUDIT_REPLAYING_SUFFIX}`),
            );
        } catch {
            // Another process claimed it first.
        }
    }

    const claimed = fs.readdirSync(AUDIT_FALLBACK_DIR)
        .filter((name) => name.startsWith(`${AUDIT_FALLBACK_FILE}.`) && name.endsWith(AUDIT_REPLAYING_SUFFIX))
        .sort();

    for (const name of claimed) {
        let text: string;
        try {
            text = fs.readFileSync(fallbackPath(name), 'utf8');
        } catch {
            continue; // finished by another process meanwhile
        }

        const rows: AuditRow[] = [];
        const rejected: string[] = [];
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            const row = parseFallbackLine(line);
            if (row) rows.push(row);
            else rejected.push(line);
        }

        try {
            const existing = new Set<string>();
            for (let i = 0; i < rows.length; i += AUDIT_ID_LOOKUP_CHUNK) {
                const found = await prisma.auditLog.findMany({
                    where: { id: { in: rows.slice(i, i + AUDIT_ID_LOOKUP_CHUNK).map((r) => r.id) } },
                    select: { id: true },
                });
                found.forEach((f) => existing.add(f.id));
            }
            const missing = rows.filter((r) => !existing.has(r.id));
            let refused = 0;

            for (let i = 0; i < missing.length; i += AUDIT_BULK_CHUNK) {
                const chunk = missing.slice(i, i + AUDIT_BULK_CHUNK);
                try {
                    await insertChunk(chunk);
                } catch (error) {
                    if (!isRowError(error)) throw error;
                    // Find the row(s) the table refuses; insert the rest.
                    for (const row of chunk) {
                        try {
                            await insertChunk([row]);
                        } catch (rowError) {
                            if (!isRowError(rowError)) throw rowError;
                            rejected.push(toFallbackLine(row));
                            refused += 1;
                        }
                    }
                }
            }

            if (rejected.length > 0) {
                fs.appendFileSync(fallbackPath(AUDIT_REJECTED_FILE), rejected.join('\n') + '\n', 'utf8');
                const message = `[audit] ${rejected.length} fallback entr${rejected.length === 1 ? 'y' : 'ies'} could not be inserted; moved to ${fallbackPath(AUDIT_REJECTED_FILE)}`;
                console.error(message);
                void logger.error(message);
            }
            fs.unlinkSync(fallbackPath(name));

            result.files += 1;
            result.inserted += missing.length - refused;
            result.alreadyPresent += rows.length - missing.length;
            result.rejected += rejected.length;
        } catch (error) {
            // The database is failing again: keep this file (and the rest) for the next run.
            result.stopped = true;
            console.error(`[audit] fallback replay stopped at ${name}:`, describe(error));
            break;
        }
    }

    fallbackPending = result.stopped || fs.existsSync(fallbackPath(AUDIT_FALLBACK_FILE));
    if (result.files > 0) {
        void logger.info(`[audit] fallback replay: files=${result.files} inserted=${result.inserted} alreadyPresent=${result.alreadyPresent} rejected=${result.rejected} stopped=${result.stopped}`);
    }
    return result;
}
