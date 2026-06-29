import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getUserFromSession } from "@/lib/user";
import { deleteNplAccountFromCbs } from "@/actions/cbs-npl";

// Permission key used to gate access. Falls back to admin-level checks.
const REQUIRED_PERMS = ["npl-collection", "npl"] as const;

function userHasAnyPerm(user: any, action: "read" | "update" | "create" | "delete"): boolean {
  if (!user?.permissions) return false;
  return REQUIRED_PERMS.some((key) => Boolean(user.permissions[key]?.[action]));
}

const bodySchema = z.object({
  accountNumbers: z.array(z.string().trim().min(1)).min(1).max(1000),
  reason: z.string().trim().max(500).optional(),
});

/** Manually delete one or more accounts from CBS NPL monitoring. */
export async function POST(req: NextRequest) {
  const user = await getUserFromSession({ allowRefresh: false });
  if (!user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (
    !userHasAnyPerm(user, "update") &&
    !userHasAnyPerm(user, "delete") &&
    !userHasAnyPerm(user, "create")
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.errors : "Invalid request body" },
      { status: 400 },
    );
  }

  // De-duplicate while preserving order.
  const accountNumbers = Array.from(new Set(parsed.accountNumbers.map((a) => a.trim())));

  const results = [];
  for (const accountNumber of accountNumbers) {
    try {
      const result = await deleteNplAccountFromCbs({
        accountNumber,
        source: "MANUAL",
        reason: parsed.reason || "Manual cleanup from NPL Collection page.",
        triggeredByUserId: user.id,
      });
      results.push(result);
    } catch (error: any) {
      results.push({
        id: "",
        accountNumber,
        status: "FAILED" as const,
        httpStatus: null,
        message: error?.message || "Unexpected error",
      });
    }
  }

  const success = results.filter((r) => r.status === "SUCCESS").length;
  const failed = results.length - success;

  return NextResponse.json({
    processed: results.length,
    success,
    failed,
    results,
  });
}

/** List recent CBS deletion attempts. */
export async function GET(req: NextRequest) {
  const user = await getUserFromSession({ allowRefresh: false });
  if (!user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!userHasAnyPerm(user, "read")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  const [total, rows] = await Promise.all([
    prisma.nplCbsDeletion.count(),
    prisma.nplCbsDeletion.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows: rows.map((r) => ({
      id: r.id,
      accountNumber: r.accountNumber,
      source: r.source,
      status: r.status,
      httpStatus: r.httpStatus,
      reason: r.reason,
      borrowerId: r.borrowerId,
      triggeredByUserId: r.triggeredByUserId,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  });
}
