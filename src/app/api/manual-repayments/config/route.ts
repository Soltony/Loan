/**
 * GET  /api/manual-repayments/config — the module's policy, readable by anyone who
 *                                      can use the module (the entry form needs the
 *                                      limit and the overpayment rule).
 * PUT  /api/manual-repayments/config — System Admin changes the policy (BRD 3.7).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { createAuditLog } from '@/lib/audit-log';
import { handleApiError, validationErrorResponse } from '@/lib/error-utils';
import {
  ALLOCATION_BUCKETS,
  OVERPAYMENT_POLICIES,
  getManualRepaymentPolicy,
} from '@/lib/manual-repayment';
import {
  canConfigureModule,
  canEnterRepayment,
  canViewRepayments,
  requestActorContext,
} from '@/lib/manual-repayment-access';

const configSchema = z.object({
  allocationOrder: z
    .array(z.enum(ALLOCATION_BUCKETS))
    .length(ALLOCATION_BUCKETS.length)
    .refine((order) => new Set(order).size === ALLOCATION_BUCKETS.length, {
      message: 'The allocation order must list every bucket exactly once.',
    }),
  makerApprovalLimit: z.number().positive().nullable(),
  overpaymentPolicy: z.enum(OVERPAYMENT_POLICIES),
  requireAttachment: z.boolean(),
  notifyCustomer: z.boolean(),
});

export async function GET() {
  const user = await getUserFromSession();
  if (!user || (!canViewRepayments(user) && !canEnterRepayment(user))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  try {
    const policy = await getManualRepaymentPolicy(prisma);
    return NextResponse.json({ policy, canEdit: canConfigureModule(user) });
  } catch (error) {
    return handleApiError(error, { operation: 'GET /api/manual-repayments/config' });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user || !canConfigureModule(user)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { ipAddress, userAgent } = requestActorContext(req);

  try {
    const body = configSchema.parse(await req.json());
    const before = await getManualRepaymentPolicy(prisma);

    const data = {
      allocationOrder: JSON.stringify(body.allocationOrder),
      makerApprovalLimit: body.makerApprovalLimit,
      overpaymentPolicy: body.overpaymentPolicy,
      requireAttachment: body.requireAttachment,
      notifyCustomer: body.notifyCustomer,
      updatedById: user.id,
    };

    await prisma.manualRepaymentConfig.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...data },
      update: data,
    });

    await createAuditLog({
      actorId: user.id,
      action: 'MANUAL_REPAYMENT_POLICY_UPDATED',
      entity: 'ManualRepaymentConfig',
      entityId: 'global',
      ipAddress,
      userAgent,
      details: { before, after: body },
    });

    return NextResponse.json({ ok: true, policy: await getManualRepaymentPolicy(prisma) });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return handleApiError(error, { operation: 'PUT /api/manual-repayments/config' });
  }
}
