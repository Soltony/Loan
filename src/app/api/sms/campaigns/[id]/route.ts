import { NextRequest, NextResponse } from "next/server";
import { getUserFromSession } from "@/lib/user";
import { hasPermission } from "@/lib/permissions";
import {
  getSmsCampaign,
  cancelCampaign,
  processCampaign,
  deleteCampaign,
} from "@/actions/sms";
import { auditRequestContext, createAuditLog } from "@/lib/audit-log";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromSession();
    if (!user || !hasPermission(user, "sms-management", "read")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await getSmsCampaign(id);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ...campaign,
      targetCriteria: JSON.parse(campaign.targetCriteria),
    });
  } catch (error: any) {
    console.error("[API] GET /api/sms/campaigns/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromSession();
    if (!user || !hasPermission(user, "sms-management", "update")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { action } = await request.json();

    if (action === "cancel") {
      await cancelCampaign(id);
      return NextResponse.json({ success: true });
    }

    if (action === "process") {
      await createAuditLog({
        actorId: user.id,
        action: "SMS_CAMPAIGN_STARTED",
        entity: "SmsCampaign",
        entityId: id,
        ...auditRequestContext(request),
      });
      // Fire and forget
      processCampaign(id).catch(console.error);
      return NextResponse.json({
        success: true,
        message: "Campaign processing started",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[API] POST /api/sms/campaigns/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromSession();
    if (!user || !hasPermission(user, "sms-management", "delete")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await deleteCampaign(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] DELETE /api/sms/campaigns/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
