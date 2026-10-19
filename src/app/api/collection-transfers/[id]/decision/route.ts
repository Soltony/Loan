/**
 * POST /api/collection-transfers/[id]/decision
 *
 * The checker's decision on a submitted transfer (maker != checker):
 *   approved=true   PENDING_APPROVAL -> APPROVED  (tax transfers post their journal entry)
 *   approved=false  PENDING_APPROVAL -> REJECTED  (reason mandatory; reference freed)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getUserFromSession } from "@/lib/user";
import { canDecideTransfer } from "@/lib/collection-transfer-access";
import { approveCollectionTransfer, rejectCollectionTransfer } from "@/lib/collection-transfers";
import { auditTransfer, transferErrorResponse } from "../../_shared";

const decisionSchema = z
  .object({
    approved: z.boolean(),
    rejectionReason: z.string().trim().min(5, "Rejection reason must be at least 5 characters").max(1000).optional(),
  })
  .refine((v) => v.approved || !!v.rejectionReason, {
    message: "A reason is required when rejecting a transfer.",
    path: ["rejectionReason"],
  });

export async function POST(request: NextRequest, { params }: { params: any }) {
  try {
    const user = await getUserFromSession();
    if (!user || !canDecideTransfer(user)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { id } = (await params) ?? {};
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = decisionSchema.parse(await request.json());

    if (body.approved) {
      const result = await approveCollectionTransfer(prisma, { transferId: id, checkerId: user.id });
      await auditTransfer(request, user.id, "COLLECTION_TRANSFER_APPROVED", result, {
        maker: result.recordedByUser?.fullName,
        approvedBy: user.fullName,
        journalEntryId: result.journalEntryId,
      });
      return NextResponse.json(result);
    }

    const result = await rejectCollectionTransfer(prisma, {
      transferId: id,
      checkerId: user.id,
      reason: body.rejectionReason!,
    });
    await auditTransfer(request, user.id, "COLLECTION_TRANSFER_REJECTED", result, {
      maker: result.recordedByUser?.fullName,
      rejectedBy: user.fullName,
      reason: body.rejectionReason,
    });
    return NextResponse.json(result);
  } catch (error) {
    return transferErrorResponse(error, "Failed to record the decision");
  }
}
