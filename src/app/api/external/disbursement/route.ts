import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import sendSms from "@/lib/sms";
import { areDisbursementsEnabled } from "@/lib/disbursement-control";
import {
  auditExternalApiError,
  auditExternalApiRequest,
  auditExternalApiResponse,
  newAuditCorrelationId,
} from "@/lib/audit-log";
import {
  MiniAppAuthError,
  requireMiniAppAuthContext,
  assertBorrowerMatches,
} from "@/lib/miniapp-auth";

// The mini-app also sends creditAccount, providerId and amount. They are not
// read: the account and amount are the ones recorded when the loan was booked
// (POST /api/loans), so a request cannot redirect or resize a disbursement.
type Body = {
  loanId?: string;
};

// Saves the outcome on the loan's disbursement record (claimed as SENT before sending).
async function recordDisbursementResult(
  disbursementTransactionId: string,
  data: {
    providerId: string;
    originalProviderId?: string;
    creditAccount: string;
    amount?: number;
    requestPayload: string;
    responsePayload?: string;
    rawResponse?: string;
    statusCode?: number | null;
    transactionId?: string | null;
    disbursementStatus: string;
  },
) {
  return await prisma.disbursementTransaction.update({
    where: { id: disbursementTransactionId },
    data: {
      transactionId: data.transactionId ?? undefined,
      providerId: data.providerId,
      originalProviderId: data.originalProviderId,
      creditAccount: data.creditAccount,
      amount: data.amount,
      disbursementStatus: data.disbursementStatus,
      requestPayload: data.requestPayload,
      responsePayload: data.responsePayload,
      rawResponse: data.rawResponse,
      statusCode: data.statusCode,
    } as any, // Type assertion until Prisma client is regenerated
  });
}

export async function POST(req: Request) {
  try {
    const ipAddress = req.headers.get("x-forwarded-for") || "N/A";
    const userAgent = req.headers.get("user-agent") || "N/A";
    const actorId = "system";

    const ctx = await requireMiniAppAuthContext();

    const enabled = await areDisbursementsEnabled();
    if (!enabled) {
      return NextResponse.json(
        { error: "Disbursements are currently disabled." },
        { status: 503 },
      );
    }

    const body: Body = await req.json();
    const loanId = typeof body?.loanId === "string" ? body.loanId : "";
    // For testing: force the provider id to PRO0001 unless overridden by env
    const forcedProviderId = process.env.FORCE_PROVIDER_ID ?? "PRO0001";
    const sendProviderId = forcedProviderId;
    if (!loanId)
      return NextResponse.json({ error: "loanId is required" }, { status: 400 });

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      select: {
        borrowerId: true,
        loanAmount: true,
        taxDeducted: true,
        netDisbursedAmount: true,
        product: { select: { providerId: true } },
      },
    });
    if (!loan)
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    assertBorrowerMatches(loan.borrowerId, ctx);

    const providerId = loan.product.providerId;
    // The net amount (after inclusive tax) when tax was deducted, else the principal.
    const amount =
      loan.netDisbursedAmount != null && loan.taxDeducted > 0
        ? loan.netDisbursedAmount
        : loan.loanAmount;

    // Claim the loan's PENDING record before sending, so the same loan cannot be
    // sent twice (a repeated or concurrent call finds nothing PENDING). A record
    // left SENT means the request went out and its outcome was not recorded.
    const disbursement = await prisma.disbursementTransaction.findFirst({
      where: { loanId, disbursementStatus: "PENDING" },
      select: { id: true, creditAccount: true },
    });
    const claimed = disbursement
      ? await prisma.disbursementTransaction.updateMany({
          where: { id: disbursement.id, disbursementStatus: "PENDING" },
          data: { disbursementStatus: "SENT" },
        })
      : null;
    if (!disbursement || claimed?.count !== 1) {
      return NextResponse.json(
        { error: "This loan has already been sent for disbursement." },
        { status: 409 },
      );
    }
    const creditAccount = disbursement.creditAccount;

    const apiUrl = process.env.EXTERNAL_DISBURSEMENT_URL;
    const user = process.env.EXTERNAL_API_USERNAME;
    const pass = process.env.EXTERNAL_API_PASSWORD;

    const auth =
      user && pass
        ? "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")
        : undefined;

    // Log outgoing request details (mask password)
    try {
      const maskedAuth = auth ? auth.replace(/:(.*)@/, ":*****@") : undefined;
    } catch (e) {
      // ignore logging errors
    }

    if (!apiUrl) {
      const errMsg = "Missing EXTERNAL_DISBURSEMENT_URL env var";
      console.error("[external][disbursement] config error", { error: errMsg });

      await auditExternalApiError(
        {
          actorId,
          ipAddress,
          userAgent,
          integration: "DISBURSEMENT",
          entity: "DisbursementTransaction",
        },
        errMsg,
        {
          request: {
            method: "POST",
            url: "EXTERNAL_DISBURSEMENT_URL",
            body: { creditAccount, providerId: sendProviderId, amount },
          },
        },
      ).catch(() => null);

      try {
        await recordDisbursementResult(disbursement.id, {
          providerId: sendProviderId,
          originalProviderId: providerId ?? undefined,
          creditAccount: String(creditAccount),
          amount:
            typeof amount === "number"
              ? amount
              : Number(String(amount)) || undefined,
          requestPayload: JSON.stringify({
            creditAccount,
            providerId: sendProviderId,
            amount,
            loanId,
          }),
          responsePayload: JSON.stringify({ error: errMsg }),
          rawResponse: errMsg,
          statusCode: null,
          disbursementStatus: "FAILED",
        });
      } catch (e) {
        console.error(
          "[external][disbursement] failed to save disbursement transaction (missing url)",
          e,
        );
      }
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    let res;
    const correlationId = newAuditCorrelationId();
    const startedAt = Date.now();
    try {
      await auditExternalApiRequest(
        {
          actorId,
          ipAddress,
          userAgent,
          integration: "DISBURSEMENT",
          entity: "DisbursementTransaction",
          correlationId,
        },
        {
          method: "POST",
          url: apiUrl,
          headers: {
            "Content-Type": "application/json",
            ...(auth ? { Authorization: auth } : {}),
          },
          body: { creditAccount, providerId: sendProviderId, amount },
        },
      ).catch(() => null);

      res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: auth } : {}),
        },
        body: JSON.stringify({
          creditAccount,
          providerId: sendProviderId,
          amount,
        }),
      });

      const durationMs = Date.now() - startedAt;
      // We'll log the response body later once parsed.
      (res as any).__audit = { correlationId, durationMs };
    } catch (fetchErr: any) {
      const details = String(fetchErr?.message ?? fetchErr);
      console.error("[external][disbursement] fetch failed", {
        apiUrl,
        error: details,
      });

      await auditExternalApiError(
        {
          actorId,
          ipAddress,
          userAgent,
          integration: "DISBURSEMENT",
          entity: "DisbursementTransaction",
          correlationId,
        },
        fetchErr,
        {
          durationMs: Date.now() - startedAt,
          request: {
            method: "POST",
            url: apiUrl,
            headers: {
              "Content-Type": "application/json",
              ...(auth ? { Authorization: auth } : {}),
            },
            body: { creditAccount, providerId: sendProviderId, amount },
          },
        },
      ).catch(() => null);

      try {
        await recordDisbursementResult(disbursement.id, {
          providerId: sendProviderId,
          originalProviderId: providerId ?? undefined,
          creditAccount: String(creditAccount),
          amount:
            typeof amount === "number"
              ? amount
              : Number(String(amount)) || undefined,
          requestPayload: JSON.stringify({
            creditAccount,
            providerId: sendProviderId,
            amount,
            loanId,
          }),
          responsePayload: JSON.stringify({
            error: "Upstream fetch failed",
            details,
          }),
          rawResponse: details,
          statusCode: null,
          disbursementStatus: "FAILED",
        });
      } catch (e) {
        console.error(
          "[external][disbursement] failed to save disbursement transaction (fetch error)",
          e,
        );
      }

      return NextResponse.json(
        { error: "Upstream fetch failed", details },
        { status: 502 },
      );
    }

    const txt = await res.text().catch(() => null);
    // Try to parse JSON, fallback to text
    let payload: any = null;
    try {
      payload = txt ? JSON.parse(txt) : null;
    } catch (e) {
      payload = txt;
    }

    try {
      const auditMeta = (res as any).__audit as
        | { correlationId?: string; durationMs?: number }
        | undefined;
      const correlationId = auditMeta?.correlationId ?? newAuditCorrelationId();
      await auditExternalApiResponse(
        {
          actorId,
          ipAddress,
          userAgent,
          integration: "DISBURSEMENT",
          entity: "DisbursementTransaction",
          correlationId,
        },
        {
          status: res.status,
          statusText: (res as any).statusText,
          headers: (() => {
            const headersObj: Record<string, string> = {};
            try {
              for (const [k, v] of (res.headers as any).entries()) {
                headersObj[k] = v;
              }
            } catch {
              // ignore
            }
            return headersObj;
          })(),
          body: payload,
          durationMs: auditMeta?.durationMs,
        },
      );
    } catch {
      // ignore audit failures
    }

    // Log upstream response for debugging
    try {
      const headersObj: Record<string, string> = {};
      try {
        // Response headers may be iterable
        for (const [k, v] of (res.headers as any).entries()) {
          headersObj[k] = v;
        }
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore logging errors
    }

    // Persist disbursement transaction to DB for audit/reconciliation
    try {
      // extract transactionId if present
      let upstreamTransactionId: string | null = null;
      if (payload && typeof payload === "object") {
        upstreamTransactionId =
          payload.transactionId ??
          payload.transactionid ??
          payload.transaction_id ??
          null;
      } else if (typeof txt === "string") {
        const m =
          txt.match(
            /transactionId['"]?\s*[:=]\s*['"]?([A-Za-z0-9_-]+)['"]?/i,
          ) || txt.match(/'transactionId'\s*:\s*'([^']+)'/i);
        if (m) upstreamTransactionId = m[1];
      }

      // Determine disbursement status based on response
      const isSuccess =
        res.ok &&
        (typeof res.status === "number"
          ? res.status >= 200 && res.status < 300
          : false);
      const disbursementStatus = isSuccess ? "SUCCESS" : "FAILED";

      await recordDisbursementResult(disbursement.id, {
        transactionId: upstreamTransactionId ?? undefined,
        providerId: sendProviderId,
        originalProviderId: providerId ?? undefined,
        creditAccount: String(creditAccount),
        amount:
          typeof amount === "number"
            ? amount
            : Number(String(amount)) || undefined,
        requestPayload: JSON.stringify({
          creditAccount,
          providerId: sendProviderId,
          amount,
          loanId,
        }),
        responsePayload:
          typeof payload === "string"
            ? payload
            : payload
              ? JSON.stringify(payload)
              : undefined,
        rawResponse: txt ?? undefined,
        statusCode: typeof res.status === "number" ? res.status : undefined,
        disbursementStatus,
      }).catch((e) => {
        console.error(
          "[external][disbursement] failed to save disbursement transaction",
          e,
        );
      });
    } catch (e) {
      console.error("[external][disbursement] saving transaction failed", e);
    }

    // Attempt to send SMS notification to the phone tied to the credited account (fire-and-forget)
    (async () => {
      try {
        // Find phone by account mapping
        const phoneMap = await prisma.phoneAccount.findFirst({
          where: { accountNumber: String(creditAccount) },
        });
        const phoneNumber = phoneMap?.phoneNumber ?? null;
        if (!phoneNumber) {
          // No mapping found; nothing to notify
          return;
        }

        // Compose message based on upstream result
        let message = "";
        const amt = amount ?? "";
        if (res.ok) {
          message = `Your loan request of ETB ${amt} has been successfully disbursed to your account ${creditAccount}. Thank you for choosing NIBtera Loan.`;
        } else {
          const reason =
            payload &&
            typeof payload === "object" &&
            (payload.message || payload.Message)
              ? payload.message || payload.Message
              : typeof payload === "string"
                ? payload
                : (txt ?? "Unknown error");
          message = `Your loan request of ETB ${amt} could not be disbursed to your account ${creditAccount}. Please try again later or contact NIBtera Loan support for assistance.`;
        }
        const smsRes = await sendSms(phoneNumber, message);
        if (!smsRes.ok)
          console.warn("[external][disbursement] sms send failed", smsRes);
      } catch (e) {
        console.error("[external][disbursement] sms notify failed", e);
      }
    })();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream error", status: res.status, body: payload },
        { status: 502 },
      );
    }

    return NextResponse.json(
      payload ?? { status: "OK", status_code: res.status },
      { status: res.status },
    );
  } catch (err: any) {
    if (err instanceof MiniAppAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[external][disbursement] error", err);
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
