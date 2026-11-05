
import { NextRequest, NextResponse } from 'next/server';
import { createSession, createLegacySession } from '@/lib/session';
import { auditRequestContext, createAuditLog } from '@/lib/audit-log';

function snippet(text: string, maxLen = 300) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) return normalized;
    return normalized.slice(0, maxLen) + '…';
}

export async function POST(req: NextRequest) {
    const TOKEN_VALIDATION_API_URL = process.env.TOKEN_VALIDATION_API_URL;
    
    if (!TOKEN_VALIDATION_API_URL) {
        return NextResponse.json({ error: "The token validation URL is not configured on the server." }, { status: 500 });
    }

    try {
        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const { superAppToken } = await req.json();

        const { ipAddress, userAgent } = auditRequestContext(req);
        const auditFailure = (reason: string, extra?: Record<string, unknown>) =>
            createAuditLog({
                actorId: 'anonymous',
                action: 'BORROWER_CONNECT_FAILED',
                ipAddress,
                userAgent,
                details: { reason, ...extra },
            });

        if (!superAppToken || !superAppToken.startsWith('Bearer ')) {
            return NextResponse.json({ error: "Super App Token is missing or malformed." }, { status: 400 });
        }
        
        const authHeader = superAppToken;
        const token = authHeader.substring(7);

        let externalResponse: Response;
        try {
            externalResponse = await fetch(TOKEN_VALIDATION_API_URL, {
                method: 'GET',
                headers: {
                    Authorization: authHeader,
                    Accept: 'application/json',
                },
                cache: 'no-store',
            });
        } catch (err: any) {
            const message = err?.message || String(err);
            console.error('[auth/connect] token validation request failed', {
                requestId,
                message,
                TOKEN_VALIDATION_API_URL,
                tokenLength: token?.length,
            });
            await auditFailure('Token validation request failed', { error: message });

            return NextResponse.json(
                { error: `Token validation request failed: ${message}` },
                { status: 502 },
            );
        }

        if (!externalResponse.ok) {
            const contentType = externalResponse.headers.get('content-type') || '';
            const wwwAuthenticate = externalResponse.headers.get('www-authenticate') || '';
            const rawBody = await externalResponse.text().catch(() => '');

            console.log('[auth/connect] token validation response', {
                requestId,
                upstreamStatus: externalResponse.status,
                upstreamContentType: contentType,
                upstreamWwwAuthenticate: wwwAuthenticate || undefined,
                upstreamBodySnippet: rawBody ? snippet(rawBody, 1200) : undefined,
                TOKEN_VALIDATION_API_URL,
            });

            let errorMessage = `Token validation failed (status ${externalResponse.status}).`;
            try {
                const maybeJson = JSON.parse(rawBody || '{}');
                if (maybeJson?.message && typeof maybeJson.message === 'string') {
                    errorMessage = maybeJson.message;
                } else if (rawBody) {
                    errorMessage = `${errorMessage} Upstream response: ${snippet(rawBody)}`;
                }
            } catch {
                if (rawBody) {
                    errorMessage = `${errorMessage} Upstream response: ${snippet(rawBody)}`;
                } else if (contentType) {
                    errorMessage = `${errorMessage} Upstream content-type: ${contentType}`;
                }
            }
            await auditFailure('Super app token rejected', { upstreamStatus: externalResponse.status });

            return NextResponse.json(
                {
                    error: errorMessage,
                    upstreamStatus: externalResponse.status,
                    upstreamContentType: contentType,
                    upstreamWwwAuthenticate: wwwAuthenticate || undefined,
                    upstreamBodySnippet: rawBody ? snippet(rawBody, 1200) : undefined,
                },
                { status: externalResponse.status },
            );
        }

        const responseData = await externalResponse.json();
        let phone = responseData.phone;

        console.log('[auth/connect] token validated', {
            requestId,
            phonePresent: Boolean(phone),
            TOKEN_VALIDATION_API_URL,
        });
        
        if (!phone) {
            await auditFailure('Phone number missing from token validation response');
            return NextResponse.json({ error: "Phone number not found in validation response." }, { status: 400 });
        }
        
        // if (typeof phone === 'string' && phone.startsWith('251') && phone.length === 12) {
        //     phone = phone.substring(3);
        // }

        // Resolve the phone to a local DB user and create a DB-backed session
        const { default: prisma } = await import('@/lib/prisma');
        const user = await prisma.user.findUnique({ where: { phoneNumber: phone } });

        if (!user) {
            // No local user exists — create a legacy session cookie so the mini-app
            // can log in using only the super app token (no provisioning required).
            await createLegacySession(phone, token);
            await createAuditLog({
                actorId: String(phone),
                action: 'BORROWER_CONNECT_SUCCESS',
                entity: 'Borrower',
                entityId: String(phone),
                ipAddress,
                userAgent,
            });
            return NextResponse.json({ borrowerId: phone, userId: null, legacy: true }, { status: 200 });
        }

        await createSession(user.id, token); // Pass DB user id and raw token to session
        // A super-app token whose phone matches a staff account opens a full user
        // session with no password, so it gets its own action to stand out.
        await createAuditLog({
            actorId: user.id,
            action: 'USER_LOGIN_VIA_SUPERAPP',
            entity: 'USER',
            entityId: user.id,
            ipAddress,
            userAgent,
            details: { phoneNumber: phone },
        });

        return NextResponse.json({ borrowerId: phone, userId: user.id }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: `An internal error occurred: ${error.message}` }, { status: 500 });
    }
}
