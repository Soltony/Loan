/**
 * POST /api/manual-repayments/[id]/decision
 *
 * The Checker's approve/reject (BRD 3.6). Approval is the only path that moves
 * money: the repayment is posted inside the same transaction that flips the row to
 * APPROVED, so a repayment is never marked posted without its ledger entries and
 * never posted twice if two checkers click at once.
 *
 * Body: { approved: true } | { approved: false, rejectionReason: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { createAuditLog } from '@/lib/audit-log';
import { handleApiError, validationErrorResponse } from '@/lib/error-utils';
import { sendSms } from '@/lib/sms';
import { syncCbsDeletionForBorrower } from '@/actions/cbs-npl';
import {
  CLOSED_LOAN_STATUSES,
  MANUAL_REPAYMENT_TOLERANCE as TOLERANCE,
  PAYMENT_SOURCE_LABELS,
  type PaymentSource,
  formatBirr,
  getManualRepaymentPolicy,
  loanBalanceSnapshot,
  repaymentStatusLabel,
  retiredReferenceKey,
} from '@/lib/manual-repayment';
import { postManualRepayment } from '@/lib/manual-repayment-posting';
import { canDecideRepayment, requestActorContext } from '@/lib/manual-repayment-access';

const decisionSchema = z
  .object({
    approved: z.boolean(),
    rejectionReason: z.string().trim().min(5).max(1000).optional(),
  })
  .refine((v) => v.approved || !!v.rejectionReason, {
    message: 'A reason is required when rejecting a repayment.',
    path: ['rejectionReason'],
  });

/** Posting touches the ledger, the schedule and the loan; give it room on a slow link. */
const TRANSACTION_OPTIONS = { timeout: 60_000, maxWait: 15_000 };

export async function POST(req: NextRequest, { params }: { params: any }) {
  const user = await getUserFromSession();
  if (!user || !canDecideRepayment(user)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { id } = (await params) ?? {};
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { ipAddress, userAgent } = requestActorContext(req);

  try {
    const body = decisionSchema.parse(await req.json());

    const repayment = await prisma.manualRepayment.findUnique({ where: { id } });
    if (!repayment) {
      return NextResponse.json({ error: 'Repayment not found.' }, { status: 404 });
    }
    if (repayment.status !== 'PENDING_APPROVAL') {
      return NextResponse.json(
        { error: `This repayment has already been ${label(repayment.status)}.` },
        { status: 409 },
      );
    }
    // Maker ≠ Checker (BRD 3.6).
    if (repayment.makerId === user.id) {
      return NextResponse.json(
        { error: 'You cannot approve a repayment you recorded yourself.' },
        { status: 403 },
      );
    }

    if (!body.approved) {
      return await reject(repayment, user, body.rejectionReason!, { ipAddress, userAgent });
    }

    return await approve(repayment, user, { ipAddress, userAgent });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return handleApiError(error, { operation: 'POST /api/manual-repayments/[id]/decision' });
  }
}

type Repayment = NonNullable<Awaited<ReturnType<typeof prisma.manualRepayment.findUnique>>>;
type Actor = { id: string; fullName: string };
type RequestContext = { ipAddress: string; userAgent: string };

async function reject(
  repayment: Repayment,
  user: Actor,
  rejectionReason: string,
  ctx: RequestContext,
) {
  // Free the reference: the money never reached the loan, and the branch has to be
  // able to re-submit the same genuine bank reference once the entry is corrected.
  const { count } = await prisma.manualRepayment.updateMany({
    where: { id: repayment.id, status: 'PENDING_APPROVAL' },
    data: {
      status: 'REJECTED',
      checkerId: user.id,
      checkerIp: ctx.ipAddress,
      decidedAt: new Date(),
      rejectionReason,
      referenceKey: retiredReferenceKey(
        repayment.paymentSource,
        repayment.referenceNumber,
        repayment.id,
      ),
    },
  });
  if (count !== 1) {
    return NextResponse.json({ error: 'This repayment has already been processed.' }, { status: 409 });
  }

  await createAuditLog({
    actorId: user.id,
    action: 'MANUAL_REPAYMENT_REJECTED',
    entity: 'ManualRepayment',
    entityId: repayment.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    details: {
      loanId: repayment.loanId,
      borrowerId: repayment.borrowerId,
      amount: repayment.amount,
      referenceNumber: repayment.referenceNumber,
      makerId: repayment.makerId,
      checkerName: user.fullName,
      rejectionReason,
    },
  });

  return NextResponse.json({ ok: true, status: 'REJECTED' });
}

async function approve(repayment: Repayment, user: Actor, ctx: RequestContext) {
  const [loan, taxConfigs, policy] = await Promise.all([
    prisma.loan.findUnique({
      where: { id: repayment.loanId },
      include: {
        product: true,
        installments: { orderBy: { installmentNumber: 'asc' } },
        payments: { orderBy: { date: 'asc' } },
      },
    }),
    prisma.tax.findMany({ where: { status: 'ACTIVE' } }),
    getManualRepaymentPolicy(prisma),
  ]);

  if (!loan) return NextResponse.json({ error: 'Loan not found.' }, { status: 404 });
  if (CLOSED_LOAN_STATUSES.includes(loan.repaymentStatus)) {
    return NextResponse.json(
      {
        error:
          'This loan has been settled since the repayment was recorded. Reject the entry and ' +
          'refer the payment for refund.',
      },
      { status: 409 },
    );
  }

  // The balance moves between entry and approval as interest and penalties accrue,
  // so it is re-read here, as of the date the money was actually received.
  const balanceNow = loanBalanceSnapshot(loan, loan.product, taxConfigs, repayment.paymentDate);
  if (balanceNow.total <= TOLERANCE) {
    return NextResponse.json(
      { error: 'This loan no longer has an outstanding balance. Reject the entry.' },
      { status: 409 },
    );
  }
  if (policy.overpaymentPolicy === 'REJECT' && repayment.amount > balanceNow.total + TOLERANCE) {
    return NextResponse.json(
      {
        error:
          `The outstanding balance is now ${formatBirr(balanceNow.total)}, less than the recorded ` +
          `${formatBirr(repayment.amount)}. Reject the entry and have it re-keyed.`,
      },
      { status: 409 },
    );
  }

  const posted = await prisma.$transaction(async (tx) => {
    // Claim the row first. A second checker approving the same repayment finds
    // zero rows updated and the whole transaction unwinds, so the ledger entries
    // this block is about to write are never booked twice.
    const claimed = await tx.manualRepayment.updateMany({
      where: { id: repayment.id, status: 'PENDING_APPROVAL' },
      data: {
        status: 'APPROVED',
        checkerId: user.id,
        checkerIp: ctx.ipAddress,
        decidedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new AlreadyDecidedError();

    const result = await postManualRepayment(tx, {
      loanId: repayment.loanId,
      amount: repayment.amount,
      paymentDate: repayment.paymentDate,
      allocationOrder: policy.allocationOrder,
      description:
        `Manual repayment ${repayment.id} — ` +
        `${PAYMENT_SOURCE_LABELS[repayment.paymentSource as PaymentSource] ?? repayment.paymentSource} ` +
        `(Ref: ${repayment.referenceNumber})`,
    });

    await tx.manualRepayment.update({
      where: { id: repayment.id },
      data: {
        postedAt: new Date(),
        allocation: JSON.stringify({ ...result.allocation, unapplied: result.unapplied }),
        balanceAfter: result.balanceAfter,
        loanStatusAfter: result.loanStatusAfter,
        paymentId: result.paymentId,
        journalEntryId: result.journalEntryId,
      },
    });

    return result;
  }, TRANSACTION_OPTIONS).catch((error) => {
    if (error instanceof AlreadyDecidedError) return null;
    throw error;
  });

  if (!posted) {
    return NextResponse.json({ error: 'This repayment has already been processed.' }, { status: 409 });
  }

  await createAuditLog({
    actorId: user.id,
    action: 'MANUAL_REPAYMENT_POSTED',
    entity: 'ManualRepayment',
    entityId: repayment.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    details: {
      loanId: repayment.loanId,
      borrowerId: repayment.borrowerId,
      amount: repayment.amount,
      referenceNumber: repayment.referenceNumber,
      paymentSource: repayment.paymentSource,
      paymentDate: repayment.paymentDate.toISOString(),
      makerId: repayment.makerId,
      checkerName: user.fullName,
      allocation: posted.allocation,
      unapplied: posted.unapplied,
      balanceBefore: posted.balanceBefore.total,
      balanceAfter: posted.balanceAfter,
      loanStatusBefore: posted.loanStatusBefore,
      loanStatusAfter: posted.loanStatusAfter,
      paymentId: posted.paymentId,
      journalEntryId: posted.journalEntryId,
    },
  });

  // Side effects, both best-effort: neither is allowed to undo a posted repayment.
  if (policy.notifyCustomer) {
    void sendSms(
      repayment.borrowerId,
      `Dear customer, a repayment of ${formatBirr(repayment.amount)} has been posted to your loan. ` +
        `Outstanding balance: ${formatBirr(posted.balanceAfter)}. Thank you — Nib International Bank.`,
    ).catch((e) => console.error('[manual-repayment] SMS notification failed', e));
  }
  if (posted.fullyPaid) {
    void syncCbsDeletionForBorrower(repayment.borrowerId, { source: 'MANUAL', actorId: user.id });
  }

  return NextResponse.json({
    ok: true,
    status: 'APPROVED',
    allocation: posted.allocation,
    unapplied: posted.unapplied,
    balanceAfter: posted.balanceAfter,
    repaymentStatus: repaymentStatusLabel(posted.balanceAfter, true),
  });
}

class AlreadyDecidedError extends Error {}

const label = (status: string) => status.replace(/_/g, ' ').toLowerCase();
