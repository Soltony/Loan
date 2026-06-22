import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { loanRequestSchema } from "@/lib/lersha/types";
import { createAuditLog } from "@/lib/audit-log";
import { randomInt } from "crypto";
import sendSms from "@/lib/sms";

/** Generate a 6-character alphanumeric OTP */
function generateOtp(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += chars[randomInt(chars.length)];
  }
  return otp;
}

const OTP_EXPIRY_MINUTES = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = loanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { farmer_id, product_id } = parsed.data;

    // Verify farmer exists
    const farmer = await prisma.lershaFarmer.findUnique({
      where: { farmerId: farmer_id },
    });
    if (!farmer) {
      return NextResponse.json(
        { error: "Farmer not found. Please register the farmer first." },
        { status: 404 },
      );
    }

    // Check farmer status is APPROVED
    if (farmer.status !== "APPROVED") {
      return NextResponse.json(
        {
          error: `Farmer cannot request a loan. Current status: ${farmer.status}. Only farmers with APPROVED status can request loans.`,
        },
        { status: 403 },
      );
    }

    // Verify the product_id belongs to this farmer's loan purposes
    const loanPurpose = await prisma.lershaLoanPurpose.findUnique({
      where: { productId: product_id },
    });
    if (!loanPurpose || loanPurpose.farmerId !== farmer.id) {
      return NextResponse.json(
        { error: "Invalid product_id for this farmer." },
        { status: 400 },
      );
    }

    // Generate OTP and expiry
    const otp = generateOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Create loan request record
    const loanRequest = await prisma.lershaLoanRequest.create({
      data: {
        farmerId: farmer.id,
        productId: product_id,
        otp,
        otpExpiresAt,
        status: "PENDING_OTP",
      },
    });

    await createAuditLog({
      actorId: "lersha-integration",
      action: "LERSHA_LOAN_REQUESTED",
      entity: "LershaLoanRequest",
      entityId: loanRequest.id,
      details: { farmerId: farmer_id, productId: product_id },
    });

    // Send OTP directly to farmer via SMS
    const smsText = `Your NIB loan verification code is: ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`;
    const smsResult = await sendSms(farmer.phoneNumber, smsText);

    if (!smsResult.ok) {
      console.error("[loanRequest] Failed to send OTP SMS:", smsResult);
    }

    return NextResponse.json(
      {
        message: "OTP sent to farmer's registered phone number.",
        requestId: loanRequest.id,
        expiresAt: otpExpiresAt.toISOString(),
        smsSent: smsResult.ok,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[loanRequest] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
