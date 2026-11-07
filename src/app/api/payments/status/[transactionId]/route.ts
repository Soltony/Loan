import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateTotalRepayable } from '@/lib/loan-calculator';
import { getAsOfDate } from '@/lib/date-utils';
import { getPhoneNumbersForAccount } from '@/lib/account-utils';
import { MiniAppAuthError, requireMiniAppAuthContext } from '@/lib/miniapp-auth';

export const dynamic = 'force-dynamic';

/**
 * Where a repayment the borrower started from the mini-app stands, polled by the
 * repayment status screen while the super app collects the money.
 *
 * `PendingPayment.status` is the whole answer:
 *  - PENDING   no callback yet. Either the borrower is still on the PIN sheet, or they
 *              cancelled it — the gateway sends nothing for a cancel, so this never
 *              turns into a failure on its own.
 *  - COMPLETED the callback booked the repayment (or an operator resolved it).
 *  - FAILED    the callback arrived — the money left the borrower — but it was more
 *              than the loan owed at that moment, so nothing was posted. Final: the
 *              callback refuses to process a row that is no longer PENDING.
 *  - NOT_STARTED  /api/initiate-payment never got a token from the gateway, so the
 *              borrower was never asked to approve anything and nothing was charged.
 */

/** Same product terms /api/initiate-payment loads; the full row carries ~1 MB of icon and salary data. */
const PRODUCT_TERMS = {
  name: true,
  duration: true,
  serviceFee: true,
  serviceFeeEnabled: true,
  dailyFee: true,
  dailyFeeEnabled: true,
  penaltyRules: true,
  penaltyRulesEnabled: true,
  penaltyPerInstallment: true,
  provider: { select: { name: true } },
} as const;

/** The calculator takes the parsed client shapes; the Prisma rows carry the same fields (JSON as strings, which it parses). */
type CalculatorArgs = Parameters<typeof calculateTotalRepayable>;

const TRANSACTION_ID = /^[A-Za-z0-9-]{8,64}$/;

const notFound = () => NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ transactionId: string }> }) {
  let borrowerId: string;
  try {
    borrowerId = (await requireMiniAppAuthContext()).borrowerId;
  } catch (error) {
    const status = error instanceof MiniAppAuthError ? error.status : 401;
    return NextResponse.json({ error: 'Not authenticated' }, { status });
  }

  const { transactionId } = await params;
  if (!transactionId || !TRANSACTION_ID.test(transactionId)) return notFound();

  try {
    const payment = await prisma.pendingPayment.findUnique({
      where: { transactionId },
      select: { transactionId: true, loanId: true, borrowerId: true, amount: true, status: true, createdAt: true, updatedAt: true },
    });
    if (!payment) return notFound();

    // A loan can sit under an older phone of the same account (phone changes), and the
    // dashboard shows those loans, so their payments are the borrower's to read too.
    // Anyone else's payment answers exactly like one that does not exist.
    const phones = await getPhoneNumbersForAccount(borrowerId);
    if (!phones.includes(payment.borrowerId)) return notFound();

    const base = {
      transactionId: payment.transactionId,
      status: payment.status,
      amount: payment.amount,
      startedAt: payment.createdAt.toISOString(),
    };

    // Polled every couple of seconds while the borrower is on the PIN sheet: the
    // unsettled answer stays a single indexed row read.
    if (payment.status !== 'COMPLETED' && payment.status !== 'FAILED') {
      return NextResponse.json({ ...base, settledAt: null, loan: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const [loan, taxConfigs] = await Promise.all([
      prisma.loan.findUnique({
        where: { id: payment.loanId },
        include: {
          product: { select: PRODUCT_TERMS },
          payments: { select: { amount: true, date: true }, orderBy: { date: 'asc' } },
          installments: { orderBy: { installmentNumber: 'asc' } },
        },
      }),
      prisma.tax.findMany({ where: { status: 'ACTIVE' } }),
    ]);

    const settledAt = payment.updatedAt.toISOString();
    if (!loan) return NextResponse.json({ ...base, settledAt, loan: null }, { headers: { 'Cache-Control': 'no-store' } });

    const fullyRepaid = loan.repaymentStatus === 'Paid';

    // The same figure the dashboard card and /api/initiate-payment use for "what is
    // still owed": total repayable as of today less loan.repaidAmount.
    const outstanding = fullyRepaid
      ? 0
      : Math.max(
          0,
          calculateTotalRepayable(
            loan as unknown as CalculatorArgs[0],
            loan.product as unknown as CalculatorArgs[1],
            taxConfigs as unknown as CalculatorArgs[2],
            getAsOfDate(),
            true,
          ).total - (loan.repaidAmount || 0),
        );

    const activeInstallment = loan.installments.find((i) => i.isActive && i.status !== 'PAID');
    const nextDue = fullyRepaid
      ? null
      : activeInstallment
        ? {
            date: activeInstallment.dueDate.toISOString(),
            installmentNumber: activeInstallment.installmentNumber,
            installmentCount: loan.installments.length,
          }
        : { date: loan.dueDate.toISOString(), installmentNumber: null, installmentCount: null };

    return NextResponse.json(
      {
        ...base,
        settledAt,
        loan: {
          id: loan.id,
          productName: loan.product.name,
          providerName: loan.product.provider.name,
          fullyRepaid,
          outstanding: Math.round(outstanding * 100) / 100,
          nextDue,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[payments/status] lookup failed', error);
    return NextResponse.json({ error: 'Could not check the payment right now.' }, { status: 500 });
  }
}
