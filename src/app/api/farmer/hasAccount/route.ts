import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hasAccountQuerySchema } from "@/lib/lersha/types";

export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get("phone");

    const parsed = hasAccountQuerySchema.safeParse({ phone });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing or invalid 'phone' query parameter." },
        { status: 400 },
      );
    }

    const farmer = await prisma.lershaFarmer.findFirst({
      where: { phoneNumber: parsed.data.phone },
      select: { farmerId: true, farmerName: true, status: true },
    });

    if (!farmer) {
      return NextResponse.json(
        { hasAccount: false },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        hasAccount: true,
        farmerId: farmer.farmerId,
        farmerName: farmer.farmerName,
        status: farmer.status,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[hasAccount] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
