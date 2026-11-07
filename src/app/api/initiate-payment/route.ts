
import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { format } from 'date-fns';
import prisma from '@/lib/prisma';
import { calculateTotalRepayable } from '@/lib/loan-calculator';
import { getAsOfDate } from '@/lib/date-utils';
import { createAuditLog } from '@/lib/audit-log';
import { getSession } from '@/lib/session';
import { requireMiniAppAuthContext } from '@/lib/miniapp-auth';
import { getPhoneNumbersForAccount } from '@/lib/account-utils';
import { REPAYMENT_CONFIRMATION_WINDOW_MS } from '@/lib/repayment-window';
import { auditExternalApiRequest, auditExternalApiResponse, newAuditCorrelationId } from '@/lib/audit-log';

export async function POST(req: NextRequest) {
    
    // initiate payment request received (log removed to reduce console noise)

    // --- Step 1: Environment Validation ---
    // The account the repayment is paid into is the loan provider's Collection Account
    // (Step 3); ACCOUNT_NO is only the fallback for a provider that has none set.
    const CALLBACK_URL = process.env.CALLBACK_URL;
    const COMPANY_NAME = process.env.COMPANY_NAME;
    const NIB_PAYMENT_KEY = process.env.NIB_PAYMENT_KEY;
    const NIB_PAYMENT_URL = process.env.NIB_PAYMENT_URL;

    // environment variables check (log removed to reduce console noise)

    if (!CALLBACK_URL || !COMPANY_NAME || !NIB_PAYMENT_KEY || !NIB_PAYMENT_URL) {
        console.error('❌ Missing payment gateway environment variables.');
        return NextResponse.json(
            { error: 'Payment gateway is not configured on the server.' },
            { status: 500 }
        );
    }

    /** Set once this request's PendingPayment row exists. */
    let startedTransactionId: string | null = null;
    try {
        const ipAddress = req.headers.get('x-forwarded-for') || 'N/A';
        const userAgent = req.headers.get('user-agent') || 'N/A';

        // --- Step 2: Parse Request ---
        const body = await req.json();

        const { amount, loanId } = body;
        if (!amount || !loanId) {
            console.error('❌ Missing amount or loanId in the request.');
            return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
        }

        // --- Step 3: Fetch Loan Data ---
        const [loan, taxConfigs] = await Promise.all([
            prisma.loan.findUnique({
                where: { id: loanId },
                include: {
                    product: {
                        select: {
                            duration: true,
                            serviceFee: true,
                            serviceFeeEnabled: true,
                            dailyFee: true,
                            dailyFeeEnabled: true,
                            penaltyRules: true,
                            penaltyRulesEnabled: true,
                            penaltyPerInstallment: true,
                            provider: { select: { name: true, collectionAccount: true } },
                        },
                    },
                    payments: { select: { amount: true, date: true } },
                    installments: true,
                },
            }),
            prisma.tax.findMany({ where: { status: 'ACTIVE' } }),
        ]);

        if (!loan) {
            return NextResponse.json({ error: 'Loan not found.' }, { status: 404 });
        }

        // Repayments go into the collection account of the provider that lent the money.
        const ACCOUNT_NO = loan.product.provider.collectionAccount?.trim() || process.env.ACCOUNT_NO?.trim();
        if (!ACCOUNT_NO) {
            console.error(`❌ Loan provider "${loan.product.provider.name}" has no Collection Account.`);
            return NextResponse.json(
                { error: 'Repayments are not set up for this loan provider yet. Please try again later.' },
                { status: 500 }
            );
        }

        // The gateway debits the customer before our callback runs, and the callback
        // refuses an amount the loan does not owe — leaving money taken from the
        // customer that never reaches the loan. Refuse it here, before any debit.
        if (loan.repaymentStatus !== 'Unpaid') {
            return NextResponse.json({ error: 'This loan is not open for repayment.' }, { status: 400 });
        }
        const outstanding = Math.max(
            0,
            calculateTotalRepayable(loan as any, loan.product as any, taxConfigs as any, getAsOfDate(), true).total -
                (loan.repaidAmount || 0),
        );
        if (!(Number(amount) > 0) || Number(amount) > outstanding + 0.01) {
            return NextResponse.json(
                { error: `Amount must be between 0.01 and the outstanding balance of ${outstanding.toFixed(2)} ETB.` },
                { status: 400 },
            );
        }

        // --- Step 4: Retrieve Session ---
        const session = await getSession();

        const superAppToken = session?.superAppToken;

        if (!superAppToken) {
            console.error('❌ Super App authorization token is missing or malformed.');
            return NextResponse.json(
                {
                    error:
                        'Your session has expired or is invalid. Please reconnect from the main app.',
                    sessionData: session,
                },
                { status: 401 }
            );
        }

        const token = superAppToken;

        // --- Step 5: Generate Transaction Info ---
        const transactionId = randomUUID();
        const transactionTime = format(new Date(), 'yyyyMMddHHmmss');

        const signatureString = [
            `accountNo=${ACCOUNT_NO}`,
            `amount=${amount}`,
            `callBackURL=${CALLBACK_URL}`,
            `companyName=${COMPANY_NAME}`,
            `Key=${NIB_PAYMENT_KEY}`,
            `token=${token}`,
            `transactionId=${transactionId}`,
            `transactionTime=${transactionTime}`,
        ].join('&');

        // signature string built (log removed to reduce console noise)

        const signature = createHash('sha256').update(signatureString, 'utf8').digest('hex');
        // generated signature (log removed to reduce console noise)

        const payload = {
            accountNo: ACCOUNT_NO,
            amount: String(amount),
            callBackURL: CALLBACK_URL,
            companyName: COMPANY_NAME,
            token: token,
            transactionId,
            transactionTime,
            signature,
        };
        // final payload prepared for payment gateway (log removed to reduce console noise)

        // --- Step 6: Save Pending Payment, unless one is already in flight for this loan ---
        // Both payments would pass the outstanding-balance check above, because the loan is
        // only credited when a callback lands. The second one is then refused by the callback
        // as an overpayment after the money has left the customer (FAILED). So a loan takes
        // one payment at a time until the first is confirmed or its window runs out.
        const cutoff = new Date(Date.now() - REPAYMENT_CONFIRMATION_WINDOW_MS);
        const inFlight = await prisma.$transaction(async (tx) => {
            // Serialises initiations per loan, so two taps at once cannot both pass the check.
            // An application lock rather than a lock on the Loan row: the payment callback
            // locks Loan and PendingPayment in an order of its own, and only this route
            // takes this lock, so it cannot deadlock with a callback.
            const [lock] = await tx.$queryRaw<{ result: number }[]>`
                DECLARE @result int;
                EXEC @result = sp_getapplock @Resource = ${`initiate-payment:${loanId}`}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
                SELECT @result AS result;`;
            if (!lock || lock.result < 0) {
                throw new Error('We could not start the payment right now. Please try again.');
            }

            const existing = await tx.pendingPayment.findFirst({
                where: { loanId, status: 'PENDING', createdAt: { gt: cutoff } },
                orderBy: { createdAt: 'desc' },
                select: { transactionId: true, amount: true, createdAt: true },
            });
            if (existing) return existing;

            await tx.pendingPayment.create({
                data: {
                    transactionId,
                    loanId,
                    borrowerId: loan.borrowerId,
                    amount,
                    status: 'PENDING',
                },
            });
            return null;
        });

        if (inFlight) {
            const elapsedMs = Date.now() - inFlight.createdAt.getTime();
            const retryAfterSeconds = Math.max(1, Math.ceil((REPAYMENT_CONFIRMATION_WINDOW_MS - elapsedMs) / 1000));
            const wait = retryAfterSeconds <= 60 ? 'a minute' : `${Math.ceil(retryAfterSeconds / 60)} minutes`;

            // This route does not otherwise check that the loan is the caller's, so the
            // in-flight payment's reference only goes back to its owner — whose screen uses
            // it to rejoin that wait instead of showing an error.
            const ctx = await requireMiniAppAuthContext().catch(() => null);
            const ownsLoan = ctx ? (await getPhoneNumbersForAccount(ctx.borrowerId)).includes(loan.borrowerId) : false;

            await createAuditLog({
                actorId: ctx?.borrowerId ?? loan.borrowerId,
                action: 'PAYMENT_GATEWAY_REQUEST_BLOCKED',
                entity: 'LOAN',
                entityId: loanId,
                details: { reason: 'PAYMENT_IN_PROGRESS', amount, inFlightTransactionId: inFlight.transactionId },
            }).catch(() => null);

            return NextResponse.json(
                {
                    error: `A payment for this loan is already waiting for confirmation. Please wait about ${wait} before paying again.`,
                    code: 'PAYMENT_IN_PROGRESS',
                    retryAfterSeconds,
                    ...(ownsLoan ? { inFlight: { transactionId: inFlight.transactionId, amount: inFlight.amount } } : {}),
                },
                { status: 409, headers: { 'Retry-After': String(retryAfterSeconds) } },
            );
        }
        startedTransactionId = transactionId;

        await createAuditLog({
            actorId: loan.borrowerId,
            action: 'PAYMENT_GATEWAY_REQUEST',
            entity: 'LOAN',
            entityId: loanId,
            details: { transactionId, amount },
        });

        // --- Step 7: Send to Payment Gateway ---
        const correlationId = newAuditCorrelationId();
        const startedAt = Date.now();
        await auditExternalApiRequest(
            {
                actorId: loan.borrowerId,
                ipAddress,
                userAgent,
                integration: 'PAYMENT_GATEWAY',
                entity: 'LOAN',
                entityId: loanId,
                correlationId,
            },
            {
                method: 'POST',
                url: NIB_PAYMENT_URL,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${superAppToken}`,
                },
                body: {
                    accountNo: ACCOUNT_NO,
                    amount: String(amount),
                    callBackURL: CALLBACK_URL,
                    companyName: COMPANY_NAME,
                    transactionId,
                    transactionTime,
                    token,
                    signature,
                },
            },
        ).catch(() => null);

        const paymentResponse = await fetch(NIB_PAYMENT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${superAppToken}`,
            },
            body: JSON.stringify(payload),
        });

        const responseTextOrJson = await (async () => {
            try {
                const cloned = paymentResponse.clone();
                return await cloned.json();
            } catch {
                try {
                    const cloned = paymentResponse.clone();
                    return await cloned.text();
                } catch {
                    return null;
                }
            }
        })();

        await auditExternalApiResponse(
            {
                actorId: loan.borrowerId,
                ipAddress,
                userAgent,
                integration: 'PAYMENT_GATEWAY',
                entity: 'LOAN',
                entityId: loanId,
                correlationId,
            },
            {
                status: paymentResponse.status,
                statusText: (paymentResponse as any).statusText,
                headers: (() => {
                    const headersObj: Record<string, string> = {};
                    try {
                        for (const [k, v] of (paymentResponse.headers as any).entries()) {
                            headersObj[k] = v;
                        }
                    } catch {
                        // ignore
                    }
                    return headersObj;
                })(),
                body: responseTextOrJson,
                durationMs: Date.now() - startedAt,
            },
        ).catch(() => null);

        // payment gateway response status (log removed)

        if (!paymentResponse.ok) {
            const errorData = await paymentResponse.text();
            console.error('❌ PAYMENT GATEWAY ERROR RESPONSE:', errorData);
            throw new Error(`Payment gateway request failed: ${errorData}`);
        }

        const responseData = await paymentResponse.json();
        // payment gateway response body received (log removed)

        const paymentToken = responseData.token;

        if (!paymentToken) {
            throw new Error('Payment token not received from the gateway.');
        }

        return NextResponse.json({ paymentToken, transactionId });
    } catch (error) {
        // The payment row exists but its token never left this server, so the borrower
        // cannot be asked to approve it and no charge can follow. Releasing it keeps the
        // in-flight check above from holding up their retry for a payment that cannot happen.
        // NOT_STARTED, not FAILED: FAILED means money arrived and was refused, and is
        // listed for operators to resolve.
        if (startedTransactionId) {
            await prisma.pendingPayment
                .updateMany({ where: { transactionId: startedTransactionId, status: 'PENDING' }, data: { status: 'NOT_STARTED' } })
                .catch((e) => console.error('Could not release the unstarted payment', e));
        }
        console.error('💥 Error initiating payment:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
