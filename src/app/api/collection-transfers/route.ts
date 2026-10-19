import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getUserFromSession } from "@/lib/user";
import { parseDayEnd, parseDayStart } from "@/lib/date-utils";
import {
  expandStatusFilter,
  TRANSFER_COMPONENT_KEYS,
  TRANSFER_STATUSES,
} from "@/lib/collection-transfer-utils";
import { canSubmitTransfer, canViewTransfers } from "@/lib/collection-transfer-access";
import {
  getCollectionTransferSummary,
  submitCollectionTransfer,
  TransferError,
  transferInclude,
} from "@/lib/collection-transfers";
import { auditTransfer, transferErrorResponse } from "./_shared";

const createSchema = z.object({
  providerId: z.string().min(1, "Provider is required"),
  component: z.enum(TRANSFER_COMPONENT_KEYS),
  transferAmount: z.preprocess((v) => {
    if (typeof v === "string") return Number(v.replace(/,/g, ""));
    return v;
  }, z.number().positive("Transfer amount must be positive")),
  sourceAccountName: z
    .string()
    .trim()
    .min(1, "Source (from) account is required")
    .max(255, "Source account must be at most 255 characters"),
  destinationAccountName: z
    .string()
    .trim()
    .min(1, "Destination (to) account is required")
    .max(200, "Destination account must be at most 200 characters"),
  transferReference: z
    .string()
    .trim()
    .min(1, "Transfer reference is required")
    .max(100, "Transfer reference must be less than 100 characters"),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Transfer date must be yyyy-MM-dd"),
  notes: z.string().trim().max(2000).optional(),
});

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromSession();
    if (!user || !canViewTransfers(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("providerId");

    if (searchParams.get("summary") === "true") {
      if (!providerId) {
        return NextResponse.json({ error: "providerId is required for summary" }, { status: 400 });
      }
      return NextResponse.json(await getCollectionTransferSummary(prisma, providerId));
    }

    const component = searchParams.get("component");
    // Comma-separated, e.g. "PENDING_APPROVAL,PENDING_REVERSAL" for the checker queue.
    const statuses = (searchParams.get("status") || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is (typeof TRANSFER_STATUSES)[number] => (TRANSFER_STATUSES as readonly string[]).includes(s))
      .flatMap(expandStatusFilter);
    const from = parseDayStart(searchParams.get("from"));
    const to = parseDayEnd(searchParams.get("to"));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));

    const where: Prisma.TaxTransferSimulationWhereInput = {};
    if (providerId) where.providerId = providerId;
    if (component && (TRANSFER_COMPONENT_KEYS as readonly string[]).includes(component)) {
      where.component = component;
    }
    if (statuses.length > 0) where.status = { in: statuses };
    if (from || to) {
      where.transferDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    const [transfers, total] = await Promise.all([
      prisma.taxTransferSimulation.findMany({
        where,
        include: transferInclude,
        orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.taxTransferSimulation.count({ where }),
    ]);

    return NextResponse.json({
      data: transfers,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return transferErrorResponse(error, "Failed to fetch collection transfers");
  }
}

/** Maker submits a transfer; it waits in the Transfer Approvals queue. */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromSession();
    if (!user || !canSubmitTransfer(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const data = createSchema.parse(await request.json());

    const transferDate = parseDayStart(data.transferDate);
    if (!transferDate) throw new TransferError("Invalid transfer date");
    // This page records transfers that already happened in the CBS.
    if (transferDate.getTime() > (parseDayEnd(localToday()) as Date).getTime()) {
      throw new TransferError("Transfer date cannot be in the future.");
    }
    // Store at local noon so the calendar day survives timezone conversion.
    transferDate.setHours(12, 0, 0, 0);

    const provider = await prisma.loanProvider.findUnique({
      where: { id: data.providerId },
      select: { id: true, name: true },
    });
    if (!provider) throw new TransferError("Provider not found", 404);

    const result = await submitCollectionTransfer(prisma, {
      providerId: provider.id,
      component: data.component,
      amount: data.transferAmount,
      sourceAccountName: data.sourceAccountName,
      destinationAccountName: data.destinationAccountName,
      transferReference: data.transferReference,
      transferDate,
      notes: data.notes,
      makerId: user.id,
    });

    await auditTransfer(request, user.id, "COLLECTION_TRANSFER_SUBMITTED", result, {
      providerName: provider.name,
      from: result.sourceAccountName,
      to: result.destinationAccountName,
      transferDate: data.transferDate,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return transferErrorResponse(error, "Failed to submit collection transfer");
  }
}
