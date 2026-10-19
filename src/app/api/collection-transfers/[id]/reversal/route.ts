/**
 * POST /api/collection-transfers/[id]/reversal
 *
 * An approved transfer is never edited; a record entered in error is backed out
 * by an approved reversal, with its own maker-checker pair:
 *
 *   action=request  APPROVED         -> PENDING_REVERSAL  (maker, reason mandatory)
 *   action=approve  PENDING_REVERSAL -> REVERSED          (checker; tax gets a compensating entry)
 *   action=reject   PENDING_REVERSAL -> APPROVED          (checker; the transfer stands)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getUserFromSession } from "@/lib/user";
import { canDecideTransfer, canRequestTransferReversal } from "@/lib/collection-transfer-access";
import {
  approveTransferReversal,
  rejectTransferReversal,
  requestTransferReversal,
} from "@/lib/collection-transfers";
import { auditTransfer, transferErrorResponse } from "../../_shared";

const schema = z.object({
  action: z.enum(["request", "approve", "reject"]),
  reason: z.string().trim().min(5, "Reason must be at least 5 characters").max(1000),
});

export async function POST(request: NextRequest, { params }: { params: any }) {
  try {
    const user = await getUserFromSession();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = (await params) ?? {};
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { action, reason } = schema.parse(await request.json());

    if (action === "request") {
      if (!canRequestTransferReversal(user)) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
      const result = await requestTransferReversal(prisma, { transferId: id, requesterId: user.id, reason });
      await auditTransfer(request, user.id, "COLLECTION_TRANSFER_REVERSAL_REQUESTED", result, {
        reason,
        requestedBy: user.fullName,
      });
      return NextResponse.json(result);
    }

    // Both remaining actions are the checker's.
    if (!canDecideTransfer(user)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (action === "reject") {
      const result = await rejectTransferReversal(prisma, { transferId: id, checkerId: user.id });
      await auditTransfer(request, user.id, "COLLECTION_TRANSFER_REVERSAL_DECLINED", result, {
        reason,
        declinedBy: user.fullName,
      });
      return NextResponse.json(result);
    }

    const result = await approveTransferReversal(prisma, { transferId: id, checkerId: user.id });
    await auditTransfer(request, user.id, "COLLECTION_TRANSFER_REVERSED", result, {
      reversalReason: result.reversalReason,
      requestedBy: result.reversalRequestedByUser?.fullName,
      approvedBy: user.fullName,
      note: reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    return transferErrorResponse(error, "Failed to process the reversal");
  }
}
