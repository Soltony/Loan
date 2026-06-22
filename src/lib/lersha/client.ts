import logger from "@/lib/logger";
import type {
  LoanDecisionPayload,
  DisbursementConfirmationPayload,
} from "./types";

const LERSHA_BASE_URL =
  process.env.LERSHA_API_BASE_URL ||
  "https://dev-api-integration.lersha.com/api/v1";

/**
 * Low-level helper to call Lersha endpoints.
 */
async function lershaFetch<T = unknown>(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${LERSHA_BASE_URL}${path}`;
  logger.info(`[Lersha] POST ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data: T | undefined;
  try {
    data = (await res.json()) as T;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    logger.error(
      `[Lersha] ${url} responded ${res.status}: ${JSON.stringify(data)}`,
    );
  }

  return { ok: res.ok, status: res.status, data: data as T };
}

/**
 * Notify Lersha about a loan approval or rejection.
 * POST /nib/loan-decision
 */
export async function sendLoanDecision(payload: LoanDecisionPayload) {
  return lershaFetch("/nib/loan-decision", payload);
}

/**
 * Confirm disbursement to Lersha with remaining balance.
 * POST /disbursement-confirmation
 */
export async function sendDisbursementConfirmation(
  payload: DisbursementConfirmationPayload,
) {
  return lershaFetch("/disbursement-confirmation", payload);
}
