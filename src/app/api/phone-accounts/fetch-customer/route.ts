import { NextResponse, after } from "next/server";
import prisma from "../../../../lib/prisma";
import { Prisma } from "@prisma/client";
import {
  MiniAppAuthError,
  requireMiniAppAuthContext,
} from "@/lib/miniapp-auth";
import { syncCustomerInfo } from "@/lib/customer-info";
import { refreshStatementFigures } from "@/lib/statement-figures";

// POST { phoneNumber, accountNumber }
export async function POST(req: Request) {
  try {
    const ctx = await requireMiniAppAuthContext();
    const body = await req.json();
    const { phoneNumber, accountNumber, providerId } = body;
    if (!phoneNumber || !accountNumber)
      return NextResponse.json(
        { error: "phoneNumber and accountNumber required" },
        { status: 400 }
      );

    if (String(phoneNumber) !== String(ctx.borrowerId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Deterministic column mapping for ExternalCustomerInfo
    const desiredColumns = [
      {
        id: "col-ext-0",
        name: "AccountNumber",
        type: "string",
        isIdentifier: true,
        options: [],
      },
      {
        id: "col-ext-1",
        name: "AccountOpeningDate",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-2",
        name: "CustomerName",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-3",
        name: "Country",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-4",
        name: "Street",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-5",
        name: "City",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-6",
        name: "Nationality",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-7",
        name: "Residence",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-8",
        name: "NationalId",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-9",
        name: "ResidenceRegion",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-10",
        name: "Gender",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-11",
        name: "DateOfBirth",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-12",
        name: "MaritalStatus",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-13",
        name: "Occupation",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-14",
        name: "EmployersName",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-15",
        name: "NetMonthlyIncome",
        type: "number",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-16",
        name: "Woreda",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-17",
        name: "MotherName",
        type: "string",
        isIdentifier: false,
        options: [],
      },
      {
        id: "col-ext-18",
        name: "SubCity",
        type: "string",
        isIdentifier: false,
        options: [],
      },
    ];

    // Determine or create the target provider-scoped ExternalCustomerInfo config
    let config = null;
    if (providerId) {
      config = await prisma.dataProvisioningConfig.findFirst({
        where: { providerId: providerId, name: "ExternalCustomerInfo" },
      });
      if (!config) {
        const created = await prisma.dataProvisioningConfig.create({
          data: {
            providerId: providerId,
            name: "ExternalCustomerInfo",
            columns: JSON.stringify(desiredColumns),
          },
        });
        config = created;
      }
    } else {
      // No providerId supplied: attempt to find any provider-scoped ExternalCustomerInfo config
      config = await prisma.dataProvisioningConfig.findFirst({
        where: { name: "ExternalCustomerInfo" },
      });
      if (!config) {
        return NextResponse.json(
          {
            error:
              "No provider specified and no ExternalCustomerInfo config exists.",
          },
          { status: 400 }
        );
      }
    }

    // Ensure Borrower exists. Use phoneNumber as borrower id (as used in auth/connect).
    const borrowerId = String(phoneNumber);
    // Create borrower defensively. Prisma `upsert` on SQL Server can fail under
    // concurrency (unique constraint) so we use create and ignore P2002.
    try {
      await prisma.borrower.create({
        data: { id: borrowerId, status: "Active" },
      });
    } catch (e: any) {
      // P2002: the borrower already exists. Leave its status alone: resetting it
      // here cleared the NPL flag every time the dashboard loaded.
      if (
        !(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        )
      ) {
        throw e;
      }
    }

    const account = String(accountNumber).trim();
    const result = await syncCustomerInfo(borrowerId, account, config.id);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Upstream error", status: result.status, body: result.body },
        { status: 502 }
      );
    }
    if (result.outcome !== "stale") {
      // The first statement fetch of the day can take minutes: run it after responding.
      // Scoring goes ahead without statement figures until they are stored.
      // Does nothing while statement fetching is switched off (see statementFiguresEnabled).
      after(() =>
        refreshStatementFigures(borrowerId, account).catch((err) =>
          console.error("[phone-accounts][fetch-customer] statement refresh failed", err)
        )
      );
    }
    return NextResponse.json({
      ok: true,
      [result.outcome]: true,
      provisionedDataId: result.provisionedDataId,
    });
  } catch (err: any) {
    if (err instanceof MiniAppAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[phone-accounts][fetch-customer] error", err);
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
