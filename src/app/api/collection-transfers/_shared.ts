import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit-log";
import { requestActorContext } from "@/lib/manual-repayment-access";
import { TransferError } from "@/lib/collection-transfers";

// Audit entity kept from the Tax Transfers page so earlier entries group with new ones.
const AUDIT_ENTITY = "TaxTransferSimulation";

export function transferErrorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.errors[0]?.message ?? "Validation error", details: error.errors },
      { status: 400 }
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json(
      { error: "This transfer reference is already used by a pending or approved transfer." },
      { status: 400 }
    );
  }
  if (error instanceof TransferError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

type AuditedTransfer = {
  id: string;
  providerId: string;
  component: string;
  transferAmount: number;
  transferReference: string;
};

export async function auditTransfer(
  request: NextRequest,
  actorId: string,
  action: string,
  transfer: AuditedTransfer,
  extra: Record<string, unknown> = {}
) {
  const { ipAddress, userAgent } = requestActorContext(request);
  await createAuditLog({
    actorId,
    action,
    entity: AUDIT_ENTITY,
    entityId: transfer.id,
    ipAddress,
    userAgent,
    details: {
      providerId: transfer.providerId,
      component: transfer.component,
      amount: transfer.transferAmount,
      reference: transfer.transferReference,
      ...extra,
    },
  });
}
