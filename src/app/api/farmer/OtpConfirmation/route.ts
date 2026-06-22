import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { otpConfirmationSchema } from "@/lib/lersha/types";
import { createAuditLog } from "@/lib/audit-log";
import { autoDisburseFarmerLoan } from "@/lib/lersha/disbursement";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = otpConfirmationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { uniqueRequestIdentifier, otp } = parsed.data;

    // Find the loan request by ID
    const loanRequest = await prisma.lershaLoanRequest.findUnique({
      where: { id: uniqueRequestIdentifier },
      include: { farmer: true },
    });

    if (!loanRequest) {
      return NextResponse.json(
        { error: "Loan request not found." },
        { status: 404 },
      );
    }

    if (loanRequest.otpVerified) {
      return NextResponse.json(
        { error: "OTP has already been verified for this request." },
        { status: 409 },
      );
    }

    // Check expiry
    if (loanRequest.otpExpiresAt && new Date() > loanRequest.otpExpiresAt) {
      return NextResponse.json(
        { error: "OTP has expired. Please request a new loan." },
        { status: 410 },
      );
    }

    // Verify OTP (constant-time comparison to prevent timing attacks)
    const storedOtp = loanRequest.otp ?? "";
    if (
      otp.length !== storedOtp.length ||
      !timingSafeEqual(otp, storedOtp)
    ) {
      return NextResponse.json(
        { error: "Invalid OTP." },
        { status: 401 },
      );
    }

    // Generate reference number
    const referenceNo = `REF${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Update the loan request
    const updated = await prisma.lershaLoanRequest.update({
      where: { id: uniqueRequestIdentifier },
      data: {
        otpVerified: true,
        otp: null, // Clear OTP after verification
        status: "OTP_VERIFIED",
        referenceNo,
      },
    });

    await createAuditLog({
      actorId: "lersha-integration",
      action: "LERSHA_OTP_VERIFIED",
      entity: "LershaLoanRequest",
      entityId: updated.id,
      details: {
        farmerId: loanRequest.farmer.farmerId,
        referenceNo,
      },
    });

    // Trigger automatic disbursement
    const disbursementResult = await autoDisburseFarmerLoan(uniqueRequestIdentifier);

    // Prepare response with both OTP verification and disbursement status
    const responseData: any = {
      message: "OTP verified successfully.",
      referenceNo,
      status: updated.status,
      disbursement: disbursementResult,
    };

    if (!disbursementResult.success) {
      // OTP was verified but disbursement failed
      responseData.warning = `OTP verified but automatic disbursement failed: ${disbursementResult.message}`;
    }

    return NextResponse.json(responseData, { status: 200 });
  } catch (error: any) {
    console.error("[OtpConfirmation] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Constant-time string comparison to prevent timing attacks on OTP.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
