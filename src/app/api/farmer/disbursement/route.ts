import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { disbursementConfirmationPayloadSchema } from "@/lib/lersha/types";
import { sendDisbursementConfirmation } from "@/lib/lersha/client";
import { createAuditLog } from "@/lib/audit-log";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = disbursementConfirmationPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { farmer_id, remaining_balance } = parsed.data;

    // Find farmer
    const farmer = await prisma.lershaFarmer.findUnique({
      where: { farmerId: farmer_id },
    });
    if (!farmer) {
      return NextResponse.json(
        { error: "Farmer not found." },
        { status: 404 },
      );
    }

    // Find the latest approved/OTP-verified loan request for this farmer
    const loanRequest = await prisma.lershaLoanRequest.findFirst({
      where: {
        farmerId: farmer.id,
        status: { in: ["APPROVED", "OTP_VERIFIED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!loanRequest) {
      return NextResponse.json(
        { error: "No approved loan request found for this farmer." },
        { status: 404 },
      );
    }

    // Update loan request with remaining balance and mark as disbursed
    await prisma.lershaLoanRequest.update({
      where: { id: loanRequest.id },
      data: {
        remainingBalance: remaining_balance,
        status: "DISBURSED",
        disbursementConfirmedAt: new Date(),
      },
    });

    // Notify Lersha about the disbursement
    const lershaResponse = await sendDisbursementConfirmation({
      farmer_id,
      remaining_balance,
    });

    await createAuditLog({
      actorId: "system",
      action: "LERSHA_DISBURSEMENT_CONFIRMED",
      entity: "LershaLoanRequest",
      entityId: loanRequest.id,
      details: {
        farmerId: farmer_id,
        remainingBalance: remaining_balance,
        lershaResponseOk: lershaResponse.ok,
        lershaStatus: lershaResponse.status,
      },
    });

    return NextResponse.json(
      {
        message: "Disbursement confirmed and Lersha notified.",
        loanRequestId: loanRequest.id,
        remainingBalance: remaining_balance,
        lershaNotified: lershaResponse.ok,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[disbursement] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
