import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit-log";
import { z } from "zod";

/**
 * Admin approval endpoint for farmers.
 * Allows admins to approve or reject farmers before they can request loans.
 */

const approvalSchema = z.object({
  farmer_id: z.string().min(1, "farmer_id is required"),
  decision: z.enum(["APPROVED", "REJECTED"], {
    errorMap: () => ({ message: "decision must be APPROVED or REJECTED" }),
  }),
  rejectionReason: z.string().optional(),
});

type ApprovalInput = z.infer<typeof approvalSchema>;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = approvalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { farmer_id, decision, rejectionReason } = parsed.data;

    // Find the farmer
    const farmer = await prisma.lershaFarmer.findUnique({
      where: { farmerId: farmer_id },
    });

    if (!farmer) {
      return NextResponse.json(
        { error: "Farmer not found." },
        { status: 404 },
      );
    }

    // Can only approve/reject farmers in PENDING status
    if (farmer.status !== "PENDING") {
      return NextResponse.json(
        {
          error: `Cannot ${decision.toLowerCase()} farmer with status: ${farmer.status}. Only PENDING farmers can be approved/rejected.`,
        },
        { status: 409 },
      );
    }

    // Update farmer status
    const updated = await prisma.lershaFarmer.update({
      where: { farmerId: farmer_id },
      data: {
        status: decision,
      },
    });

    await createAuditLog({
      actorId: "admin-approval", // In production, use the actual admin user ID
      action: `LERSHA_FARMER_${decision}`,
      entity: "LershaFarmer",
      entityId: updated.id,
      details: {
        farmerId: farmer_id,
        farmerName: farmer.farmerName,
        decision,
        rejectionReason: rejectionReason || null,
      },
    });

    return NextResponse.json(
      {
        message: `Farmer ${decision.toLowerCase()} successfully.`,
        farmerId: farmer_id,
        farmerName: farmer.farmerName,
        status: updated.status,
        rejectionReason: rejectionReason || null,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[farmer/approval] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
