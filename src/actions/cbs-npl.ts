"use server";
/**
 * @fileOverview Digital Loan Repayment integration with the Core Banking
 * System (CBS) for Non-Performing Loans (NPL).
 *
 *  Workflow (see docs/Digital-Loan-Repayment.postman_collection.json):
 *    1. uploadNplListToCbs() — pushes the current set of unpaid NPL account
 *       numbers to the CBS "bulk" endpoint for monitoring.
 *    2. processCreditNotification() — handles incoming credit notifications
 *       from the CBS, calls the CBS "repay" endpoint to debit the customer
 *       account, and posts the corresponding repayment in our ledgers.
 */
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";
import { differenceInDays, startOfDay } from "date-fns";
import {
  deleteNplAccount,
  getDefaultCbsProviderId,
  requestRepay,
  uploadNplBulkInBatches,
} from "@/lib/cbs-npl/client";
import type {
  CbsCreditNotificationPayload,
  CbsRepayResponse,
} from "@/lib/cbs-npl/types";
import { calculateTotalRepayable } from "@/lib/loan-calculator";
import { createAuditLog } from "@/lib/audit-log";
import logger from "@/lib/logger";
import sendSms from "@/lib/sms";

const truncate = (value: string | undefined, max = 4000) => {
  if (!value) return value;
  return value.length <= max ? value : `${value.slice(0, max)}…(truncated, len=${value.length})`;
};

const toJsonString = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------
// 1. Daily NPL bulk upload to the CBS
// ------------------------------------------------------------------

interface UploadResult {
  success: boolean;
  batchId: string;
  accountsSentCount: number;
  totalReceived?: number;
  insertedCount?: number;
  alreadyExistsCount?: number;
  message: string;
}

/**
 * Collect the active set of NPL account numbers (one per borrower w/ unpaid
 * NPL loans) and push them to the CBS bulk endpoint.
 */
export async function uploadNplListToCbs(opts?: {
  triggeredByUserId?: string;
  source?: "MANUAL" | "SCHEDULED";
}): Promise<UploadResult> {
  const source = opts?.source ?? (opts?.triggeredByUserId ? "MANUAL" : "SCHEDULED");

  const accountNumbers = await collectActiveNplAccountNumbers();

  const batch = await prisma.nplCbsUploadBatch.create({
    data: {
      triggeredByUserId: opts?.triggeredByUserId ?? null,
      source,
      status: "PENDING",
      accountsSentCount: accountNumbers.length,
      accountNumbers: JSON.stringify(accountNumbers),
    },
  });

  if (accountNumbers.length === 0) {
    const finished = await prisma.nplCbsUploadBatch.update({
      where: { id: batch.id },
      data: {
        status: "SUCCESS",
        totalReceived: 0,
        insertedCount: 0,
        alreadyExistsCount: 0,
        finishedAt: new Date(),
        responsePayload: JSON.stringify({ skipped: true, reason: "no NPL accounts" }),
      },
    });
    void logger.info(`[CBS-NPL] Upload skipped (no NPL accounts) batch=${batch.id}`);
    return {
      success: true,
      batchId: finished.id,
      accountsSentCount: 0,
      totalReceived: 0,
      insertedCount: 0,
      alreadyExistsCount: 0,
      message: "No NPL accounts to upload.",
    };
  }

  const result = await uploadNplBulkInBatches(accountNumbers);
  const finished = await prisma.nplCbsUploadBatch.update({
    where: { id: batch.id },
    data: {
      status: result.ok ? "SUCCESS" : "FAILED",
      httpStatus: result.status || null,
      totalReceived: result.data?.totalReceived ?? null,
      insertedCount: result.data?.insertedCount ?? null,
      alreadyExistsCount: result.data?.alreadyExistsCount ?? null,
      errorMessage:
        result.error ??
        (!result.ok ? truncate(result.rawResponse, 2000) ?? null : null),
      requestPayload: toJsonString(result.requestBody),
      responsePayload: result.rawResponse ?? null,
      finishedAt: new Date(),
    },
  });

  await createAuditLog({
    actorId: opts?.triggeredByUserId ?? "system",
    action: result.ok ? "CBS_NPL_BULK_UPLOAD_SUCCESS" : "CBS_NPL_BULK_UPLOAD_FAILED",
    entity: "NplCbsUploadBatch",
    entityId: finished.id,
    details: {
      accountsSentCount: accountNumbers.length,
      chunkCount: result.chunkCount,
      failedChunkIndexes: result.failedChunkIndexes,
      totalReceived: finished.totalReceived,
      insertedCount: finished.insertedCount,
      alreadyExistsCount: finished.alreadyExistsCount,
      httpStatus: finished.httpStatus,
      durationMs: result.durationMs,
      error: finished.errorMessage,
    },
  });

  const chunkNote =
    result.chunkCount > 1 ? ` in ${result.chunkCount} CBS request(s)` : "";

  return {
    success: result.ok,
    batchId: finished.id,
    accountsSentCount: accountNumbers.length,
    totalReceived: finished.totalReceived ?? undefined,
    insertedCount: finished.insertedCount ?? undefined,
    alreadyExistsCount: finished.alreadyExistsCount ?? undefined,
    message: result.ok
      ? `Uploaded ${accountNumbers.length} account(s) to CBS${chunkNote}.`
      : finished.errorMessage || "CBS upload failed.",
  };
}

/**
 * Pull the distinct list of bank account numbers for borrowers that are
 * currently flagged NPL and have at least one unpaid loan. Falls back to
 * provisionedData's account-number field if no PhoneAccount is registered.
 */
async function collectActiveNplAccountNumbers(): Promise<string[]> {
  const nplLoans = await prisma.loan.findMany({
    where: {
      repaymentStatus: "Unpaid",
      borrower: { status: "NPL" },
    },
    select: {
      borrowerId: true,
      borrower: {
        select: {
          id: true,
          provisionedData: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { data: true },
          },
        },
      },
    },
  });

  if (nplLoans.length === 0) return [];

  const borrowerIds = Array.from(new Set(nplLoans.map((l) => l.borrowerId)));
  const phoneAccounts = await prisma.phoneAccount.findMany({
    where: { phoneNumber: { in: borrowerIds } },
    select: { phoneNumber: true, accountNumber: true, isActive: true },
  });

  const accountByBorrower = new Map<string, string>();
  for (const pa of phoneAccounts) {
    const existing = accountByBorrower.get(pa.phoneNumber);
    if (!existing || (pa.isActive && existing !== pa.accountNumber)) {
      accountByBorrower.set(pa.phoneNumber, pa.accountNumber);
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const loan of nplLoans) {
    let account = accountByBorrower.get(loan.borrowerId);
    if (!account) {
      const pdRaw = loan.borrower.provisionedData?.[0]?.data;
      if (pdRaw) {
        try {
          const pd = JSON.parse(pdRaw);
          const candidate =
            pd.AccountNumber ??
            pd.accountNumber ??
            pd.account_number ??
            pd.accountNo ??
            pd.account_no ??
            null;
          if (candidate) account = String(candidate);
        } catch {
          // ignore parse error
        }
      }
    }
    if (account && !seen.has(account)) {
      seen.add(account);
      out.push(String(account));
    }
  }
  return out;
}

// ------------------------------------------------------------------
// 1b. Removing accounts from CBS NPL monitoring
//
// Once a borrower exits NPL (their loan is fully repaid) we must tell the CBS
// to stop monitoring the account, otherwise the CBS keeps streaming credit
// notifications for accounts we no longer care about and its database fills up.
// ------------------------------------------------------------------

/** Pull a bank account number out of a provisionedData JSON blob. */
function accountNumberFromProvisionedData(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const pd = JSON.parse(raw);
    const candidate =
      pd.AccountNumber ??
      pd.accountNumber ??
      pd.account_number ??
      pd.accountNo ??
      pd.account_no ??
      null;
    return candidate ? String(candidate) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve every bank account number we may have uploaded for a borrower so we
 * can delete them from CBS monitoring. Mirrors the resolution used by the bulk
 * upload (registered PhoneAccount rows first, provisionedData as a fallback).
 */
async function resolveAccountNumbersForBorrower(borrowerId: string): Promise<string[]> {
  const accounts = new Set<string>();

  const phoneAccounts = await prisma.phoneAccount.findMany({
    where: { phoneNumber: borrowerId },
    select: { accountNumber: true },
  });
  for (const pa of phoneAccounts) {
    if (pa.accountNumber) accounts.add(String(pa.accountNumber));
  }

  if (accounts.size === 0) {
    const pd = await prisma.provisionedData.findFirst({
      where: { borrowerId },
      orderBy: { createdAt: "desc" },
      select: { data: true },
    });
    const fromPd = accountNumberFromProvisionedData(pd?.data);
    if (fromPd) accounts.add(fromPd);
  }

  return Array.from(accounts);
}

interface CbsDeletionResult {
  id: string;
  accountNumber: string;
  status: "SUCCESS" | "FAILED";
  httpStatus: number | null;
  message: string | null;
}

/**
 * Call the CBS delete endpoint for a single account and persist the outcome.
 * A 404 / "not found" response is treated as success: the goal is for the
 * account to be absent from CBS, and it already is.
 */
export async function deleteNplAccountFromCbs(args: {
  accountNumber: string;
  source: "AUTO" | "MANUAL";
  reason?: string;
  borrowerId?: string | null;
  triggeredByUserId?: string | null;
}): Promise<CbsDeletionResult> {
  const accountNumber = String(args.accountNumber).trim();
  const call = await deleteNplAccount(accountNumber);

  const notFound =
    call.status === 404 ||
    Boolean(call.data?.message?.toLowerCase().includes("not found"));
  const ok = call.ok || notFound;

  const record = await prisma.nplCbsDeletion.create({
    data: {
      accountNumber,
      source: args.source,
      status: ok ? "SUCCESS" : "FAILED",
      httpStatus: call.status || null,
      reason: args.reason ?? null,
      borrowerId: args.borrowerId ?? null,
      triggeredByUserId: args.triggeredByUserId ?? null,
      responsePayload: call.rawResponse ?? null,
      errorMessage: ok ? null : call.error ?? truncate(call.rawResponse, 2000) ?? null,
      finishedAt: new Date(),
    },
  });

  await createAuditLog({
    actorId: args.triggeredByUserId ?? (args.source === "AUTO" ? "cbs-auto" : "system"),
    action: ok ? "CBS_NPL_DELETE_SUCCESS" : "CBS_NPL_DELETE_FAILED",
    entity: "NplCbsDeletion",
    entityId: record.id,
    details: {
      accountNumber,
      source: args.source,
      httpStatus: call.status,
      borrowerId: args.borrowerId ?? null,
      message: call.data?.message ?? call.error ?? null,
    },
  });

  return {
    id: record.id,
    accountNumber,
    status: ok ? "SUCCESS" : "FAILED",
    httpStatus: call.status || null,
    message: call.data?.message ?? call.error ?? null,
  };
}

/**
 * Best-effort: when a borrower no longer has any unpaid loans, remove their
 * account(s) from CBS NPL monitoring. Safe to call after every repayment —
 * it no-ops while unpaid loans remain, and skips accounts already deleted
 * since the last upload. Never throws.
 */
export async function syncCbsDeletionForBorrower(
  borrowerId: string,
  opts?: { source?: "AUTO" | "MANUAL"; actorId?: string; reason?: string },
): Promise<void> {
  try {
    if (!borrowerId) return;

    const remainingUnpaid = await prisma.loan.count({
      where: { borrowerId, repaymentStatus: "Unpaid" },
    });
    if (remainingUnpaid > 0) return; // still has unpaid loans → keep monitored

    const accounts = await resolveAccountNumbersForBorrower(borrowerId);
    if (accounts.length === 0) return;

    const latestUpload = await prisma.nplCbsUploadBatch.aggregate({
      _max: { startedAt: true },
    });
    const latestUploadAt = latestUpload._max.startedAt;

    for (const accountNumber of accounts) {
      // Skip if we already deleted it and it hasn't been re-uploaded since.
      const priorSuccess = await prisma.nplCbsDeletion.findFirst({
        where: { accountNumber, status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (
        priorSuccess &&
        (!latestUploadAt || priorSuccess.createdAt >= latestUploadAt)
      ) {
        continue;
      }

      await deleteNplAccountFromCbs({
        accountNumber,
        source: opts?.source ?? "AUTO",
        reason: opts?.reason ?? "Borrower exited NPL (loan fully repaid).",
        borrowerId,
        triggeredByUserId: opts?.actorId ?? null,
      });
    }
  } catch (e: any) {
    void logger.error(
      `[CBS-NPL] syncCbsDeletionForBorrower failed for borrower=${borrowerId}: ${String(e?.message ?? e)}`,
    );
  }
}

/**
 * Compute accounts that we previously pushed to the CBS but that are no longer
 * part of the active NPL set and have not yet been deleted — i.e. accounts that
 * exited NPL before the delete integration existed and are still cluttering the
 * CBS database. This powers the manual cleanup tab.
 */
export async function computeStaleCbsAccounts(): Promise<string[]> {
  const batches = await prisma.nplCbsUploadBatch.findMany({
    where: { status: "SUCCESS" },
    select: { accountNumbers: true },
  });

  const uploaded = new Set<string>();
  for (const b of batches) {
    try {
      const arr = JSON.parse(b.accountNumbers);
      if (Array.isArray(arr)) {
        for (const a of arr) if (a) uploaded.add(String(a));
      }
    } catch {
      // ignore malformed batch payloads
    }
  }
  if (uploaded.size === 0) return [];

  const [current, deletedRows] = await Promise.all([
    collectActiveNplAccountNumbers(),
    prisma.nplCbsDeletion.findMany({
      where: { status: "SUCCESS" },
      select: { accountNumber: true },
    }),
  ]);
  const currentSet = new Set(current);
  const deletedSet = new Set(deletedRows.map((d) => d.accountNumber));

  const stale: string[] = [];
  for (const account of uploaded) {
    if (!currentSet.has(account) && !deletedSet.has(account)) stale.push(account);
  }
  return stale.sort();
}

// ------------------------------------------------------------------
// 2. Inbound credit notification processing
// ------------------------------------------------------------------

interface ProcessResult {
  notificationId: string;
  status: string;
  message: string;
  repayResponse?: CbsRepayResponse | null;
}

const REPAY_TRIGGERING_STATUSES = new Set([
  "PENDING",
  "FAILED",
  "UNMATCHED_ACCOUNT",
  "NO_OUTSTANDING",
]);

/**
 * Persist an incoming credit notification (if new) and attempt an immediate
 * /repay against the CBS for the matched loan. Safe to retry.
 */
export async function processCreditNotification(
  payload: CbsCreditNotificationPayload,
  opts?: { actorId?: string; sourceIp?: string | null },
): Promise<ProcessResult> {
  const accountNumber = String(payload.accountNumber ?? "").trim();
  const creditedAmount = Number(payload.amount);
  const externalReference = payload.externalReference ? String(payload.externalReference) : null;
  console.log("[CBS-NPL][Process] Start", {
    accountNumber,
    creditedAmount,
    externalReference,
    correlationId: (payload as any)?.correlationId ?? null,
    providerId: payload.providerId ?? null,
    sourceIp: opts?.sourceIp ?? null,
  });

  if (!accountNumber || !Number.isFinite(creditedAmount) || creditedAmount < 0) {
    const created = await prisma.nplCreditNotification.create({
      data: {
        correlationId: randomUUID(),
        externalReference,
        accountNumber: accountNumber || "(missing)",
        creditedAmount: Number.isFinite(creditedAmount) ? creditedAmount : 0,
        providerId: payload.providerId ?? null,
        rawPayload: JSON.stringify(payload),
        processStatus: "FAILED",
        resultMessage: "Invalid payload: accountNumber and positive amount are required.",
        attempts: 1,
        lastAttemptAt: new Date(),
      },
    });
    return {
      notificationId: created.id,
      status: created.processStatus,
      message: created.resultMessage ?? "Invalid payload.",
    };
  }

  // Dedup by externalReference if present.
  if (externalReference) {
    const existing = await prisma.nplCreditNotification.findUnique({
      where: { externalReference },
    });
    if (existing) {
      console.log("[CBS-NPL][Process] Duplicate externalReference detected", {
        notificationId: existing.id,
        externalReference,
        existingStatus: existing.processStatus,
      });
      if (!REPAY_TRIGGERING_STATUSES.has(existing.processStatus)) {
        return {
          notificationId: existing.id,
          status: "DUPLICATE",
          message: `Notification already processed (status=${existing.processStatus}).`,
        };
      }
      // Otherwise retry the existing record below.
      return await attemptRepayForNotification(existing.id, opts?.actorId);
    }
  }

  const correlationId = randomUUID();
  const notification = await prisma.nplCreditNotification.create({
    data: {
      correlationId,
      externalReference,
      accountNumber,
      creditedAmount,
      providerId: payload.providerId ?? null,
      rawPayload: JSON.stringify(payload),
      processStatus: "PENDING",
    },
  });
  console.log("[CBS-NPL][Process] Notification persisted", {
    notificationId: notification.id,
    correlationId: notification.correlationId,
    accountNumber: notification.accountNumber,
    creditedAmount: notification.creditedAmount,
  });

  return await attemptRepayForNotification(notification.id, opts?.actorId);
}

/**
 * Re-run the /repay pipeline for a previously stored notification.
 * Used by the inbound webhook (new payload) and by the admin "Retry" action.
 */
export async function attemptRepayForNotification(
  notificationId: string,
  actorId?: string,
): Promise<ProcessResult> {
  console.log("[CBS-NPL][Repay] Attempt start", { notificationId, actorId: actorId ?? "cbs-webhook" });
  const notification = await prisma.nplCreditNotification.findUnique({
    where: { id: notificationId },
  });
  if (!notification) {
    return {
      notificationId,
      status: "FAILED",
      message: "Notification not found.",
    };
  }
  if (!REPAY_TRIGGERING_STATUSES.has(notification.processStatus)) {
    console.log("[CBS-NPL][Repay] Skipped terminal status", {
      notificationId: notification.id,
      status: notification.processStatus,
    });
    return {
      notificationId,
      status: notification.processStatus,
      message: `Notification in terminal status ${notification.processStatus}; nothing to do.`,
    };
  }

  // 1. Locate the loan to repay.
  const match = await locateLoanByAccountNumber(notification.accountNumber);
  if (!match) {
    console.log("[CBS-NPL][Repay] No matching unpaid loan found", {
      notificationId: notification.id,
      accountNumber: notification.accountNumber,
    });
    const updated = await prisma.nplCreditNotification.update({
      where: { id: notification.id },
      data: {
        processStatus: "UNMATCHED_ACCOUNT",
        resultMessage: "No unpaid NPL loan found for the supplied account number.",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    await createAuditLog({
      actorId: actorId ?? "cbs-webhook",
      action: "CBS_CREDIT_NOTIFICATION_UNMATCHED",
      entity: "NplCreditNotification",
      entityId: updated.id,
      details: { accountNumber: notification.accountNumber },
    });
    return {
      notificationId: updated.id,
      status: updated.processStatus,
      message: updated.resultMessage ?? "Unmatched account.",
    };
  }

  const { loan, totalOutstanding, borrowerId } = match;
  console.log("[CBS-NPL][Repay] Loan matched", {
    notificationId: notification.id,
    borrowerId,
    loanId: loan.id,
    totalOutstanding,
    creditedAmount: notification.creditedAmount,
  });
  if (totalOutstanding <= 0.01) {
    const updated = await prisma.nplCreditNotification.update({
      where: { id: notification.id },
      data: {
        processStatus: "NO_OUTSTANDING",
        borrowerId,
        loanId: loan.id,
        resultMessage: "Matched loan has no outstanding balance; nothing to collect.",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    return {
      notificationId: updated.id,
      status: updated.processStatus,
      message: updated.resultMessage ?? "Loan is already fully paid.",
    };
  }

  // Determine how much can be collected based on the customer's available
  // balance (balance above the required minimum), NOT the credited amount.
  //   availableBalance = currentBalance - accountMinimumBalance
  //   amountToCollect  = min(totalOutstanding, availableBalance)
  let currentBalance = 0;
  let accountMinimumBalance = 0;
  try {
    const raw = JSON.parse(notification.rawPayload || "{}");
    currentBalance = Number(raw.currentBalance);
    accountMinimumBalance = Number(raw.accountMinimumBalance);
  } catch {
    // leave defaults; handled by the validity check below.
  }
  if (!Number.isFinite(currentBalance)) currentBalance = 0;
  if (!Number.isFinite(accountMinimumBalance)) accountMinimumBalance = 0;

  const availableBalance = Number((currentBalance - accountMinimumBalance).toFixed(2));
  const amountToCollect = Math.min(
    Number(totalOutstanding.toFixed(2)),
    availableBalance,
  );

  console.log("[CBS-NPL][Repay] Balance-based collection", {
    notificationId: notification.id,
    totalOutstanding: Number(totalOutstanding.toFixed(2)),
    currentBalance,
    accountMinimumBalance,
    availableBalance,
    amountToCollect,
  });

  // Nothing collectable: balance at/under the minimum. Keep retriable so a
  // future notification with more funds can collect later.
  if (amountToCollect <= 0.01) {
    const updated = await prisma.nplCreditNotification.update({
      where: { id: notification.id },
      data: {
        processStatus: "FAILED",
        borrowerId,
        loanId: loan.id,
        resultMessage: `Insufficient available balance to collect (currentBalance=${currentBalance}, accountMinimumBalance=${accountMinimumBalance}, available=${availableBalance}).`,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    console.log("[CBS-NPL][Repay] Skipped — no available balance", {
      notificationId: notification.id,
      availableBalance,
    });
    return {
      notificationId: updated.id,
      status: updated.processStatus,
      message: updated.resultMessage ?? "Insufficient available balance.",
    };
  }

  console.log("[CBS-NPL][Repay] Calling CBS /repay", {
    notificationId: notification.id,
    correlationId: notification.correlationId,
    accountNumber: notification.accountNumber,
    amountToCollect,
  });

  // 2. Call CBS /repay.
  const cbsProviderId = notification.providerId?.trim() || getDefaultCbsProviderId();
  const repayCall = await requestRepay({
    correlationId: notification.correlationId,
    accountNumber: notification.accountNumber,
    amount: amountToCollect,
    providerId: cbsProviderId,
  });

  const repayData = repayCall.data;
  const repaySuccess =
    repayCall.ok && repayData?.status === "Success" && repayData?.status_code === 200;
  console.log("[CBS-NPL][Repay] CBS /repay response", {
    notificationId: notification.id,
    ok: repayCall.ok,
    httpStatus: repayCall.status,
    status: repayData?.status ?? null,
    statusCode: repayData?.status_code ?? null,
    transactionId: repayData?.transactionId ?? null,
    message: repayData?.message ?? repayCall.error ?? null,
  });

  // 3. If CBS confirmed the debit, record the repayment internally.
  let paymentId: string | null = null;
  let breakdown: CbsRepaymentBreakdown | null = null;
  let internalError: string | null = null;
  if (repaySuccess) {
    try {
      console.log("[CBS-NPL][AutoDebit] Internal posting start", {
        notificationId: notification.id,
        loanId: loan.id,
        amount: amountToCollect,
      });
      breakdown = await recordCbsRepayment({
        loanId: loan.id,
        amount: amountToCollect,
        correlationId: notification.correlationId,
        cbsTransactionId: repayData?.transactionId ?? null,
      });
      paymentId = breakdown.paymentId;
      console.log("[CBS-NPL][AutoDebit] Internal posting success", {
        notificationId: notification.id,
        paymentId,
      });
    } catch (e: any) {
      internalError = e?.message ?? String(e);
      console.error("[CBS-NPL][AutoDebit] Internal posting failed", {
        notificationId: notification.id,
        loanId: loan.id,
        error: internalError,
      });
      void logger.error(
        `[CBS-NPL] Internal repayment posting failed for notification=${notification.id}: ${internalError}`,
      );
    }
  }

  const finalStatus = repaySuccess
    ? internalError
      ? "FAILED"
      : amountToCollect < Number(totalOutstanding.toFixed(2)) - 0.01
        ? "PARTIAL_REPAID"
        : "REPAID"
    : repayData?.message?.toLowerCase().includes("duplicate")
      ? "DUPLICATE"
      : "FAILED";

  const updated = await prisma.nplCreditNotification.update({
    where: { id: notification.id },
    data: {
      borrowerId,
      loanId: loan.id,
      paymentId: paymentId ?? null,
      processStatus: finalStatus,
      resultMessage: internalError
        ? `CBS debited but internal posting failed: ${internalError}`
        : repayData?.message ?? repayCall.error ?? null,
      repayHttpStatus: repayCall.status || null,
      repayTransactionId: repayData?.transactionId ?? null,
      repayDebitAmount: repayData?.debitAmount ?? amountToCollect,
      repayDebitAccount: repayData?.debitAccount ?? notification.accountNumber,
      repayCreditAccount: repayData?.creditAccount ?? null,
      repayResponse: repayCall.rawResponse ?? null,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  console.log("[CBS-NPL][Repay] Notification updated", {
    notificationId: updated.id,
    finalStatus: updated.processStatus,
    paymentId: updated.paymentId ?? null,
    repayTransactionId: updated.repayTransactionId ?? null,
  });

  await createAuditLog({
    actorId: actorId ?? "cbs-webhook",
    action: repaySuccess
      ? internalError
        ? "CBS_REPAY_INTERNAL_POSTING_FAILED"
        : "CBS_REPAY_SUCCESS"
      : "CBS_REPAY_FAILED",
    entity: "NplCreditNotification",
    entityId: updated.id,
    details: {
      loanId: loan.id,
      borrowerId,
      requestedAmount: amountToCollect,
      creditedAmount: notification.creditedAmount,
      cbsStatus: repayCall.status,
      cbsTransactionId: repayData?.transactionId,
      cbsMessage: repayData?.message,
      durationMs: repayCall.durationMs,
    },
  });

  // 4. Notify the borrower by SMS that a repayment was auto-debited, itemising
  // the principal, penalty and service fee collected. Best-effort: SMS failures
  // are logged but never roll back the (already committed) repayment.
  if (repaySuccess && !internalError && breakdown) {
    void notifyRepaymentBySms({
      phone: borrowerId,
      accountNumber: notification.accountNumber,
      breakdown,
      notificationId: notification.id,
    });
  }

  // When this repayment cleared the borrower's last unpaid loan, ask the CBS to
  // stop monitoring the account. Best-effort: never blocks or rolls back the
  // (already committed) repayment.
  if (repaySuccess && !internalError && breakdown?.isFullyPaid) {
    void syncCbsDeletionForBorrower(borrowerId, {
      source: "AUTO",
      reason: "NPL loan fully repaid via CBS auto-debit.",
    });
  }

  return {
    notificationId: updated.id,
    status: updated.processStatus,
    message:
      updated.resultMessage ??
      (repaySuccess ? "Repayment collected." : "Repayment failed."),
    repayResponse: repayData ?? null,
  };
}

/**
 * Send the borrower an SMS receipt for an auto-debited NPL repayment, breaking
 * the amount down into principal, penalty and service fee (interest and tax are
 * shown only when collected). Best-effort — never throws.
 */
async function notifyRepaymentBySms(args: {
  phone: string;
  accountNumber: string;
  breakdown: CbsRepaymentBreakdown;
  notificationId: string;
}): Promise<void> {
  const { phone, accountNumber, breakdown, notificationId } = args;
  const money = (n: number) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  // Mask the account number so only the last 4 digits are shown, e.g. **0841.
  const maskAccount = (acct: string) => {
    const digits = String(acct ?? "").replace(/\s/g, "");
    return digits.length <= 4 ? digits : `**${digits.slice(-4)}`;
  };

  const lines = [
    `Dear customer, a loan repayment of Birr ${money(breakdown.paymentAmount)} was deducted from account ${maskAccount(accountNumber)}. for Nibtera Loan repayment.`,
    `Penalty: Birr ${money(breakdown.applied.penalty)}`,
    `Service Fee: Birr ${money(breakdown.applied.serviceFee)}`,
    `Principal: Birr ${money(breakdown.applied.principal)}`,
  ];
  if (breakdown.applied.interest > 0) {
    lines.push(`Interest: Birr ${money(breakdown.applied.interest)}`);
  }
  if (breakdown.applied.tax > 0) {
    lines.push(`Tax: Birr ${money(breakdown.applied.tax)}`);
  }
  lines.push(
    breakdown.isFullyPaid
      ? "Your loan is now fully paid. for further info call 9698"
      : `Outstanding balance: Birr ${money(breakdown.remainingBalance)}.for further info call 9698`,
  );

  try {
    const res = await sendSms(String(phone), lines.join("\n"));
    console.log("[CBS-NPL][AutoDebit] Repayment SMS", {
      notificationId,
      to: phone,
      ok: res.ok,
      error: res.ok ? undefined : res.error,
    });
    if (!res.ok) {
      void logger.warn(
        `[CBS-NPL] Repayment SMS to ${phone} failed for notification=${notificationId}: ${res.error ?? "unknown"}`,
      );
    }
  } catch (e: any) {
    const error = e?.message ?? String(e);
    console.error("[CBS-NPL][AutoDebit] Repayment SMS threw", {
      notificationId,
      to: phone,
      error,
    });
    void logger.error(
      `[CBS-NPL] Repayment SMS to ${phone} threw for notification=${notificationId}: ${error}`,
    );
  }
}

/**
 * Find the unpaid loan to apply a CBS-credit repayment against.
 * Strategy: borrower with matching PhoneAccount.accountNumber, prefer the
 * most overdue Unpaid loan. Returns the loan, total outstanding, and
 * borrower id, or null when no match.
 */
async function locateLoanByAccountNumber(accountNumber: string) {
  const phoneAccounts = await prisma.phoneAccount.findMany({
    where: { accountNumber },
    select: { phoneNumber: true, isActive: true },
  });
  if (phoneAccounts.length === 0) return null;

  // Prefer the active mapping when there are multiple rows for the same account.
  const ordered = [...phoneAccounts].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const borrowerIds = Array.from(new Set(ordered.map((p) => p.phoneNumber)));

  const today = startOfDay(new Date());
  const taxConfigs = await prisma.tax.findMany({ where: { status: "ACTIVE" } });

  const loans = await prisma.loan.findMany({
    where: {
      borrowerId: { in: borrowerIds },
      repaymentStatus: "Unpaid",
    },
    include: {
      product: true,
      payments: { orderBy: { date: "asc" } },
      installments: true,
    },
    orderBy: { dueDate: "asc" },
  });

  for (const loan of loans) {
    const totals = calculateTotalRepayable(
      loan as any,
      loan.product as any,
      taxConfigs as any,
      today,
      true,
    );
    const repaid = loan.repaidAmount || 0;
    const outstanding = Math.max(0, totals.total - repaid);
    if (outstanding > 0.01) {
      return {
        loan,
        totalOutstanding: outstanding,
        borrowerId: loan.borrowerId,
      };
    }
  }

  return null;
}

/**
 * Post the CBS-collected repayment in our ledgers using the existing
 * payment pipeline (priority Penalty → ServiceFee → Interest → Tax → Principal).
 * Mirrors the loan-level branch of /api/payment-callback so the repayment is
 * indistinguishable from one received through the regular pending-payment flow.
 */
interface CbsRepaymentBreakdown {
  paymentId: string;
  paymentAmount: number;
  applied: {
    penalty: number;
    serviceFee: number;
    interest: number;
    tax: number;
    principal: number;
  };
  remainingBalance: number;
  isFullyPaid: boolean;
}

async function recordCbsRepayment(args: {
  loanId: string;
  amount: number;
  correlationId: string;
  cbsTransactionId: string | null;
}): Promise<CbsRepaymentBreakdown> {
  const { loanId, amount, correlationId, cbsTransactionId } = args;
  console.log("[CBS-NPL][AutoDebit] Preparing ledger posting", {
    loanId,
    amount,
    correlationId,
    cbsTransactionId,
  });

  const [loan, taxConfigs] = await Promise.all([
    prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        product: { include: { provider: { include: { ledgerAccounts: true } } } },
        payments: { orderBy: { date: "asc" } },
      },
    }),
    prisma.tax.findMany({ where: { status: "ACTIVE" } }),
  ]);
  if (!loan) throw new Error(`Loan ${loanId} not found`);

  const provider = loan.product.provider;
  const today = startOfDay(new Date());

  const totals = calculateTotalRepayable(
    loan as any,
    loan.product as any,
    taxConfigs as any,
    today,
    true,
  );
  const alreadyRepaid = loan.repaidAmount || 0;
  const totalDue = Math.max(0, totals.total - alreadyRepaid);

  const alreadyPaidPenalty = Math.min(totals.penalty, alreadyRepaid);
  const alreadyPaidServiceFee = Math.min(totals.serviceFee, Math.max(0, alreadyRepaid - totals.penalty));
  const alreadyPaidInterest = Math.min(
    totals.interest,
    Math.max(0, alreadyRepaid - totals.penalty - totals.serviceFee),
  );
  const alreadyPaidTax = Math.min(
    totals.tax,
    Math.max(0, alreadyRepaid - totals.penalty - totals.serviceFee - totals.interest),
  );
  const alreadyPaidPrincipal = Math.min(
    totals.principal,
    Math.max(
      0,
      alreadyRepaid - totals.penalty - totals.serviceFee - totals.interest - totals.tax,
    ),
  );

  const penaltyDue = Math.max(0, totals.penalty - alreadyPaidPenalty);
  const serviceFeeDue = Math.max(0, totals.serviceFee - alreadyPaidServiceFee);
  const interestDue = Math.max(0, totals.interest - alreadyPaidInterest);
  const taxDue = Math.max(0, totals.tax - alreadyPaidTax);
  const principalDue = Math.max(0, totals.principal - alreadyPaidPrincipal);

  const paymentAmount = Math.min(amount, totalDue);
  if (paymentAmount <= 0) {
    throw new Error("Nothing left to collect for this loan.");
  }

  const principalReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Principal" && a.type === "Receivable",
  );
  const interestReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Interest" && a.type === "Receivable",
  );
  const penaltyReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Penalty" && a.type === "Receivable",
  );
  const serviceFeeReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "ServiceFee" && a.type === "Receivable",
  );
  const taxReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Tax" && a.type === "Receivable",
  );

  const principalReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Principal" && a.type === "Received",
  );
  const interestReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Interest" && a.type === "Received",
  );
  const penaltyReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Penalty" && a.type === "Received",
  );
  const serviceFeeReceived = provider.ledgerAccounts.find(
    (a) => a.category === "ServiceFee" && a.type === "Received",
  );
  const taxReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Tax" && a.type === "Received",
  );

  const interestIncome = provider.ledgerAccounts.find(
    (a) => a.category === "Interest" && a.type === "Income",
  );
  const penaltyIncome = provider.ledgerAccounts.find(
    (a) => a.category === "Penalty" && a.type === "Income",
  );
  const serviceFeeIncome = provider.ledgerAccounts.find(
    (a) => a.category === "ServiceFee" && a.type === "Income",
  );

  if (
    !principalReceivable || !interestReceivable || !penaltyReceivable ||
    !serviceFeeReceivable || !taxReceivable || !principalReceived ||
    !interestReceived || !penaltyReceived || !serviceFeeReceived || !taxReceived
  ) {
    throw new Error(`Ledger accounts not configured for provider ${provider.id}`);
  }

  const paymentRecord = await prisma.$transaction(async (tx) => {
    let amountToApply = paymentAmount;
    const journalEntry = await tx.journalEntry.create({
      data: {
        providerId: provider.id,
        loanId: loan.id,
        date: today,
        description: `CBS NPL collection for loan ${loan.id} (correlationId=${correlationId}${
          cbsTransactionId ? ` cbsTxn=${cbsTransactionId}` : ""
        })`,
      },
    });

    const ledgerEntries: Array<{ ledgerAccountId: string; type: string; amount: number }> = [];

    const penaltyToPay = Math.min(amountToApply, penaltyDue);
    if (penaltyToPay > 0) {
      if (!penaltyIncome) throw new Error("Penalty Income ledger account missing");
      await tx.ledgerAccount.update({ where: { id: penaltyReceivable.id }, data: { balance: { decrement: penaltyToPay } } });
      await tx.ledgerAccount.update({ where: { id: penaltyReceived.id }, data: { balance: { increment: penaltyToPay } } });
      await tx.ledgerAccount.update({ where: { id: penaltyIncome.id }, data: { balance: { increment: penaltyToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: penaltyReceivable.id, type: "Credit", amount: penaltyToPay },
        { ledgerAccountId: penaltyReceived.id, type: "Debit", amount: penaltyToPay },
        { ledgerAccountId: penaltyIncome.id, type: "Credit", amount: penaltyToPay },
      );
      amountToApply -= penaltyToPay;
    }

    const serviceFeeToPay = Math.min(amountToApply, serviceFeeDue);
    if (serviceFeeToPay > 0) {
      if (!serviceFeeIncome) throw new Error("Service Fee Income ledger account missing");
      await tx.ledgerAccount.update({ where: { id: serviceFeeReceivable.id }, data: { balance: { decrement: serviceFeeToPay } } });
      await tx.ledgerAccount.update({ where: { id: serviceFeeReceived.id }, data: { balance: { increment: serviceFeeToPay } } });
      await tx.ledgerAccount.update({ where: { id: serviceFeeIncome.id }, data: { balance: { increment: serviceFeeToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: serviceFeeReceivable.id, type: "Credit", amount: serviceFeeToPay },
        { ledgerAccountId: serviceFeeReceived.id, type: "Debit", amount: serviceFeeToPay },
        { ledgerAccountId: serviceFeeIncome.id, type: "Credit", amount: serviceFeeToPay },
      );
      amountToApply -= serviceFeeToPay;
    }

    const interestToPay = Math.min(amountToApply, interestDue);
    if (interestToPay > 0) {
      if (!interestIncome) throw new Error("Interest Income ledger account missing");
      await tx.ledgerAccount.update({ where: { id: interestReceivable.id }, data: { balance: { decrement: interestToPay } } });
      await tx.ledgerAccount.update({ where: { id: interestReceived.id }, data: { balance: { increment: interestToPay } } });
      await tx.ledgerAccount.update({ where: { id: interestIncome.id }, data: { balance: { increment: interestToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: interestReceivable.id, type: "Credit", amount: interestToPay },
        { ledgerAccountId: interestReceived.id, type: "Debit", amount: interestToPay },
        { ledgerAccountId: interestIncome.id, type: "Credit", amount: interestToPay },
      );
      amountToApply -= interestToPay;
    }

    const taxToPay = Math.min(amountToApply, taxDue);
    if (taxToPay > 0) {
      await tx.ledgerAccount.update({ where: { id: taxReceivable.id }, data: { balance: { decrement: taxToPay } } });
      await tx.ledgerAccount.update({ where: { id: taxReceived.id }, data: { balance: { increment: taxToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: taxReceivable.id, type: "Credit", amount: taxToPay },
        { ledgerAccountId: taxReceived.id, type: "Debit", amount: taxToPay },
      );
      amountToApply -= taxToPay;
    }

    const principalToPay = Math.min(amountToApply, principalDue);
    if (principalToPay > 0) {
      await tx.ledgerAccount.update({ where: { id: principalReceivable.id }, data: { balance: { decrement: principalToPay } } });
      await tx.ledgerAccount.update({ where: { id: principalReceived.id }, data: { balance: { increment: principalToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: principalReceivable.id, type: "Credit", amount: principalToPay },
        { ledgerAccountId: principalReceived.id, type: "Debit", amount: principalToPay },
      );
      amountToApply -= principalToPay;
    }

    if (ledgerEntries.length > 0) {
      await tx.ledgerEntry.createMany({
        data: ledgerEntries.map((e) => ({ ...e, journalEntryId: journalEntry.id })),
      });
    }

    const payment = await tx.payment.create({
      data: {
        loanId: loan.id,
        amount: paymentAmount,
        date: today,
        outstandingBalanceBeforePayment: totalDue,
        journalEntryId: journalEntry.id,
      },
    });

    const newRepaid = alreadyRepaid + paymentAmount;
    const isFullyPaid = newRepaid >= totals.total - 0.01;
    const repaymentBehavior = isFullyPaid
      ? differenceInDays(today, startOfDay(loan.dueDate)) > 0
        ? "LATE"
        : "ON_TIME"
      : null;

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        repaidAmount: newRepaid,
        repaymentStatus: isFullyPaid ? "Paid" : "Unpaid",
        ...(isFullyPaid && { penaltyAmount: 0 }),
        ...(repaymentBehavior && { repaymentBehavior }),
      },
    });

    // Clear NPL flag if borrower has no remaining unpaid loans.
    if (isFullyPaid) {
      const remaining = await tx.loan.count({
        where: { borrowerId: loan.borrowerId, repaymentStatus: "Unpaid" },
      });
      if (remaining === 0) {
        await tx.borrower.updateMany({
          where: { id: loan.borrowerId, status: "NPL" },
          data: { status: "Active" },
        });
      }
    }

    return {
      payment,
      applied: {
        penalty: penaltyToPay,
        serviceFee: serviceFeeToPay,
        interest: interestToPay,
        tax: taxToPay,
        principal: principalToPay,
      },
      remainingBalance: Math.max(0, totals.total - newRepaid),
      isFullyPaid,
    };
  });
  console.log("[CBS-NPL][AutoDebit] Ledger posting committed", {
    loanId,
    paymentId: paymentRecord.payment.id,
    paymentAmount,
    applied: paymentRecord.applied,
    remainingBalance: paymentRecord.remainingBalance,
  });

  return {
    paymentId: paymentRecord.payment.id,
    paymentAmount,
    applied: paymentRecord.applied,
    remainingBalance: paymentRecord.remainingBalance,
    isFullyPaid: paymentRecord.isFullyPaid,
  };
}
