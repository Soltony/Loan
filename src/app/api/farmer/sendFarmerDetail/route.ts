import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendFarmerDetailArraySchema } from "@/lib/lersha/types";
import { createAuditLog } from "@/lib/audit-log";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate: the payload is an array of farmer details
    const parsed = sendFarmerDetailArraySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const farmers = parsed.data;
    const results: { farmerId: string; status: string }[] = [];

    for (const farmer of farmers) {
      // Upsert: if farmerId already exists, update; otherwise create
      // Note: Always set status to PENDING - farmers must be approved by admin before requesting loans
      const upserted = await prisma.lershaFarmer.upsert({
        where: { farmerId: farmer.farmerId },
        update: {
          farmerName: farmer.farmerName,
          phoneNumber: farmer.phoneNumber,
          kebeleIdDocUrl: farmer.kebeleIdDocUrl,
          landCertificateDocUrl: farmer.landCertificateDocUrl,
          totalFarmSizeInHectare: farmer.totalFarmSizeInHectare,
          cultivatedAreaInHectare: farmer.cultivatedAreaInHectare,
          primaryCropType: farmer.primaryCropType,
          farmRegistryNumber: farmer.farmRegistryNumber,
          requestedLoanAmount: farmer.requestedLoanAmount,
          repaymentSource: farmer.repaymentSource,
          requestedLoanTermInMonth: farmer.requestedLoanTermInMonth,
          applicationChannel: farmer.applicationChannel,
          creditScoreValue: farmer.creditScoreValue,
          scoreCalculationDate: new Date(farmer.scoreCalculationDate),
          emergencyContactName: farmer.emergencyContactName,
          emergencyContactPhone: farmer.emergencyContactPhone,
          emergencyContactRelationship: farmer.emergencyContactRelationship,
          emergencyContactAddress: farmer.emergencyContactAddress,
          status: "PENDING",
          marriageCertificateUrl: farmer.marriageCertificateUrl ?? null,
          address: farmer.address,
        },
        create: {
          farmerId: farmer.farmerId,
          farmerName: farmer.farmerName,
          phoneNumber: farmer.phoneNumber,
          kebeleIdDocUrl: farmer.kebeleIdDocUrl,
          landCertificateDocUrl: farmer.landCertificateDocUrl,
          totalFarmSizeInHectare: farmer.totalFarmSizeInHectare,
          cultivatedAreaInHectare: farmer.cultivatedAreaInHectare,
          primaryCropType: farmer.primaryCropType,
          farmRegistryNumber: farmer.farmRegistryNumber,
          requestedLoanAmount: farmer.requestedLoanAmount,
          repaymentSource: farmer.repaymentSource,
          requestedLoanTermInMonth: farmer.requestedLoanTermInMonth,
          applicationChannel: farmer.applicationChannel,
          creditScoreValue: farmer.creditScoreValue,
          scoreCalculationDate: new Date(farmer.scoreCalculationDate),
          emergencyContactName: farmer.emergencyContactName,
          emergencyContactPhone: farmer.emergencyContactPhone,
          emergencyContactRelationship: farmer.emergencyContactRelationship,
          emergencyContactAddress: farmer.emergencyContactAddress,
          status: "PENDING",
          marriageCertificateUrl: farmer.marriageCertificateUrl ?? null,
          address: farmer.address,
        },
      });

      // Delete existing loan purposes for this farmer then re-create
      await prisma.lershaLoanPurpose.deleteMany({
        where: { farmerId: upserted.id },
      });

      const loanPurposeResults: { productId: string | null; loanPurpose: string }[] = [];

      for (const purpose of farmer.loanPurposes) {
        const productId = purpose.loanPurpose === "Insurance" ? undefined : randomUUID();
        await prisma.lershaLoanPurpose.create({
          data: {
            farmerId: upserted.id,
            productId,
            loanPurpose: purpose.loanPurpose,
            specificVarietyName: purpose.specificVarietyName ?? null,
            quantity: purpose.quantity ?? null,
            unitOfMeasurement: purpose.unitOfMeasurement ?? null,
            unitPrice: purpose.unitPrice ?? null,
            totalCost: purpose.totalCost,
            agroDealerName: purpose.agro_dealer?.agro_dealer_name ?? null,
            agroDealerAccountNo:
              purpose.agro_dealer?.agro_dealer_account_number ?? null,
            insuranceName: purpose.Insurance?.insurance_name ?? null,
          },
        });
        loanPurposeResults.push({ productId: productId ?? null, loanPurpose: purpose.loanPurpose });
      }

      results.push({ farmerId: farmer.farmerId, status: "REGISTERED", loanPurposes: loanPurposeResults });
    }

    await createAuditLog({
      actorId: "lersha-integration",
      action: "LERSHA_FARMER_REGISTERED",
      entity: "LershaFarmer",
      details: {
        count: results.length,
        farmerIds: results.map((r) => r.farmerId),
      },
    });

    return NextResponse.json(
      { message: "Farmer details registered successfully", results },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[sendFarmerDetail] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
