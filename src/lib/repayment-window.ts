/**
 * How long a mini-app repayment is treated as "in flight" after it is started.
 *
 * Shared by /api/initiate-payment (which refuses a second payment on the same loan inside
 * it) and the repayment status screen (which waits this long for the callback before
 * saying "still waiting"), so the borrower is never told to wait while the server would
 * already take another payment, or the other way round.
 *
 * Two minutes because that is when the callback arrives: of 6,256 gateway-confirmed
 * payments in the local data (snapshot 2026-11-06), 6,250 were confirmed within two
 * minutes and every refused (FAILED) one within 90 seconds. A cancelled PIN sheet sends
 * nothing at all, so a borrower who cancels waits out the rest of this window before
 * paying again.
 */
export const REPAYMENT_CONFIRMATION_WINDOW_MS = 2 * 60_000;
