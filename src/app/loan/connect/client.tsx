'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { MiniAppShell } from '@/components/miniapp/shell';
import { BrandButton } from '@/components/miniapp/ui';

/** Customer-facing error, with the technical reason folded away for support staff. */
export function ConnectProblem({
    title,
    message,
    detail,
    onRetry,
}: {
    title: string;
    message: string;
    detail?: string;
    onRetry?: () => void;
}) {
    return (
        <MiniAppShell watchRepayments={false}>
            <div className="flex flex-col items-center px-2 pt-20 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-8 w-8" aria-hidden />
                </span>
                <h1 className="mt-4 text-xl font-semibold">{title}</h1>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">{message}</p>
                {onRetry && (
                    <BrandButton className="mt-6" size="lg" onClick={onRetry}>
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        Try again
                    </BrandButton>
                )}
                {detail && (
                    <details className="mt-8 w-full max-w-sm text-left text-xs text-gray-500">
                        <summary className="cursor-pointer select-none text-center">Details for support</summary>
                        <p className="mt-2 break-words rounded-xl bg-white p-3 font-mono">{detail}</p>
                    </details>
                )}
            </div>
        </MiniAppShell>
    );
}

export function ConnectClient({ superAppToken }: { superAppToken: string }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    // Retrying re-sends the token we already have: a reload may come back without the
    // super app's Authorization header.
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const createSession = async () => {
            try {
                const response = await fetch('/api/auth/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ superAppToken }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('[loan/connect] /api/auth/connect failed', {
                        status: response.status,
                        errorData,
                    });

                    const parts: string[] = [];
                    parts.push(String(errorData?.error || 'Session creation failed.'));
                    if (errorData?.upstreamWwwAuthenticate) {
                        parts.push(`WWW-Authenticate: ${String(errorData.upstreamWwwAuthenticate)}`);
                    }
                    if (errorData?.upstreamBodySnippet) {
                        parts.push(`Upstream: ${String(errorData.upstreamBodySnippet)}`);
                    }

                    throw new Error(parts.join(' '));
                }

                const { borrowerId } = await response.json();

                if (!borrowerId) {
                    throw new Error('Borrower ID not returned from session creation.');
                }

                router.push(`/loan?borrowerId=${borrowerId}`);

            } catch (err: any) {
                setError(err.message);
            }
        };

        createSession();
    }, [superAppToken, router, attempt]);

    if (error) {
        return (
            <ConnectProblem
                title="We couldn't open Loans"
                message="Something went wrong while signing you in. Please try again. If it keeps happening, close Loans and open it again from the app."
                detail={error}
                onRetry={() => {
                    setError(null);
                    setAttempt((n) => n + 1);
                }}
            />
        );
    }

    return (
        <MiniAppShell watchRepayments={false}>
            <div className="flex flex-col items-center pt-32 text-center" role="status" aria-live="polite">
                <Loader2 className="h-10 w-10 animate-spin text-brand-ink" aria-hidden />
                <h1 className="mt-4 text-lg font-semibold">Opening Loans…</h1>
                <p className="mt-1 text-sm text-gray-500">Setting up a secure session.</p>
            </div>
        </MiniAppShell>
    );
}
