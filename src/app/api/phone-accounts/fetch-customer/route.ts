import { NextResponse, after } from "next/server";
import prisma from "../../../../lib/prisma";
import { Prisma } from "@prisma/client";
import {
  MiniAppAuthError,
  requireMiniAppAuthContext,
} from "@/lib/miniapp-auth";
import {
  storedDataStamps,
  syncBorrowerData,
  within,
} from "@/lib/borrower-data-sync";

// How long this route waits before answering. Customer info usually comes within 20 s, but a new
// customer in a rush waits their turn at the data API; the fetch carries on after we answer.
const CUSTOMER_INFO_WAIT_MS = 20_000;
// Enough for figures that are still fresh, or a statement the data API already holds. A read from
// ODS takes a minute or more and carries on after we answer.
const STATEMENT_WAIT_MS = 3_000;

// POST { phoneNumber, accountNumber }
//
// Answers { ok, saved | reused | stale, provisionedDataId, changed, pending, customerInfoFetchedAt,
// figuresComputedAt }. changed = new data was stored while we waited (recalculate the limit now);
// pending = more is still being fetched (202 while even the customer info is): ask
// /api/phone-accounts/data-status when it has landed.
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
    // Customer info, then the statement figures (unless they are fresh or statement fetching is
    // switched off). Scoring goes ahead without what has not landed yet.
    const sync = syncBorrowerData(borrowerId, account, config.id);
    after(sync.done);

    const result = await within(sync.customerInfo, CUSTOMER_INFO_WAIT_MS);
    if (result && !result.ok) {
      return NextResponse.json(
        { error: "Upstream error", status: result.status, body: result.body },
        { status: 502 }
      );
    }
    const statement = result
      ? await within(sync.statement, STATEMENT_WAIT_MS)
      : undefined;
    return NextResponse.json(
      {
        ok: true,
        ...(result
          ? { [result.outcome]: true, provisionedDataId: result.provisionedDataId }
          : {}),
        changed:
          result?.outcome === "saved" ||
          (statement?.ok === true && statement.outcome === "saved"),
        pending: result === undefined || statement === undefined,
        ...(await storedDataStamps(borrowerId, account)),
      },
      { status: result ? 200 : 202 }
    );
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
