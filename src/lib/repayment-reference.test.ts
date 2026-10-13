import { describe, expect, test } from 'vitest';
import { normalizeFtReference, parseRepaymentReference, referenceFor } from './repayment-reference';

/**
 * Regression guard for duplicate FT numbers in the repayment report.
 *
 * The report used to guess a repayment's FT by looking for a completed pending
 * payment on the same loan with the same amount. A loan with several same-amount
 * manual resolutions (e.g. eight 1.50 ETB payments, each with its own FT) showed
 * the newest FT on every row. The FT is already in the journal description.
 */
describe('parseRepaymentReference', () => {
  test('reads the FT from a CBS NPL auto-collection', () => {
    expect(
      parseRepaymentReference(
        'CBS NPL collection for loan cmo30wjjq12bjz7egicb0f0jo (correlationId=21fefeb6-8e44-431e-b425-250e289b59ab cbsTxn=FT26198YH98D)',
      ),
    ).toEqual({ kind: 'cbs', ft: 'FT26198YH98D' });
  });

  test('keeps the CBS FT when a later fix appended a note to the description', () => {
    expect(
      parseRepaymentReference(
        'CBS NPL collection for loan x (correlationId=y cbsTxn=FT26202FXY5R) — Restated to the 10,034.00 the CBS actually debited under FT26202FXY5R.',
      ),
    ).toEqual({ kind: 'cbs', ft: 'FT26202FXY5R' });
  });

  test('reads the FT and the resolved pending payment from both manual resolution formats', () => {
    expect(
      parseRepaymentReference('Manual resolution for pending payment cmo8rr9km07pcw6sdesmbhitk (FT: FT2611114DJM)'),
    ).toEqual({ kind: 'manual', ft: 'FT2611114DJM', pendingPaymentId: 'cmo8rr9km07pcw6sdesmbhitk' });
    expect(
      parseRepaymentReference(
        'Manual repayment resolution for pending payment cmo01ajuu0wr1z7egpmssj6cb (FT: FT261059WJCV)',
      ),
    ).toEqual({ kind: 'manual', ft: 'FT261059WJCV', pendingPaymentId: 'cmo01ajuu0wr1z7egpmssj6cb' });
  });

  test('uses the FT corrected on the resolved pending payment over a typo in the description', () => {
    // Tested against the previous portal: FT6092XS018 was typed at resolution and
    // corrected to FT26092XS018 on the pending payment afterwards.
    const reference = parseRepaymentReference(
      'Manual repayment resolution for pending payment cmnh94uwe08fyz7egbiq0117y (FT: FT6092XS018)',
    );
    const lookups = {
      ftByTxnRef: new Map<string, string>(),
      ftByPendingPayment: new Map([['cmnh94uwe08fyz7egbiq0117y', 'FT26092XS018']]),
    };
    expect(referenceFor(reference, lookups)).toBe('FT26092XS018');
    // Without a correction on the payment, the description's FT stands.
    expect(referenceFor(reference, { ...lookups, ftByPendingPayment: new Map() })).toBe('FT6092XS018');
  });

  test('gives distinct FTs to distinct same-amount manual resolutions', () => {
    const refs = [
      'Manual repayment resolution for pending payment a (FT: FT261059WJCV)',
      'Manual repayment resolution for pending payment b (FT: FT26105B383G)',
      'Manual repayment resolution for pending payment c (FT: FT26105Z4LTM)',
    ].map((d) => parseRepaymentReference(d));
    expect(new Set(refs.map((r) => (r.kind === 'manual' ? r.ft : null))).size).toBe(3);
  });

  test('returns the TxRef for SuperApp callbacks so the FT can be looked up', () => {
    expect(
      parseRepaymentReference(
        'SuperApp repayment for installment 1 of loan cmm3d380p06h7e1gzf6i14jrk via TxRef a3743ed2-2eb7-46db-bfa8-36b8cba44f90',
      ),
    ).toEqual({ kind: 'superapp', txnRef: 'a3743ed2-2eb7-46db-bfa8-36b8cba44f90' });
  });

  test('reports unknown rather than guessing', () => {
    expect(parseRepaymentReference('Loan disbursement for Salary Advance to borrower 2519')).toEqual({ kind: 'unknown' });
    expect(parseRepaymentReference(null)).toEqual({ kind: 'unknown' });
  });
});

/**
 * The manual repayment module writes the reference the Maker keyed in straight into
 * the journal description. Before this was parsed, the repayments report fell back
 * to the journal entry's own cuid and showed that in the Reference column.
 */
describe('parseRepaymentReference for manual repayments', () => {
  const DESCRIPTION =
    'Manual repayment cmv6fm0250001azzid5x8dtfb — Bank Transfer (Ref: FT123456789)';

  test('reads the reference the Maker entered', () => {
    expect(parseRepaymentReference(DESCRIPTION)).toEqual({
      kind: 'manualRepayment',
      reference: 'FT123456789',
      manualRepaymentId: 'cmv6fm0250001azzid5x8dtfb',
    });
  });

  test('a cash receipt or cheque number is a reference too, not only an FT', () => {
    expect(
      parseRepaymentReference('Manual repayment cmv6fm0250001azzid5x8dtfb — Cash (Ref: RCPT-00912)'),
    ).toMatchObject({ kind: 'manualRepayment', reference: 'RCPT-00912' });
    expect(
      parseRepaymentReference('Manual repayment cmv6fm0250001azzid5x8dtfb — Cheque (Ref: CHQ/2026/8841)'),
    ).toMatchObject({ kind: 'manualRepayment', reference: 'CHQ/2026/8841' });
  });

  test('a reference containing a bracket is captured whole', () => {
    expect(
      parseRepaymentReference('Manual repayment cmv6fm0250001azzid5x8dtfb — Other Channel (Ref: A(1)B)'),
    ).toMatchObject({ kind: 'manualRepayment', reference: 'A(1)B' });
  });

  test('does not swallow the legacy manual *resolution* description', () => {
    expect(
      parseRepaymentReference(
        'Manual repayment resolution for pending payment cmo01ajuu0wr1z7egpmssj6cb (FT: FT261059WJCV)',
      ),
    ).toEqual({ kind: 'manual', ft: 'FT261059WJCV', pendingPaymentId: 'cmo01ajuu0wr1z7egpmssj6cb' });
  });

  test('a reversal journal carries no reference of its own', () => {
    expect(
      parseRepaymentReference(
        'Reversal: manual repayment cmv6fpi34000sazzi8e4cfpu8 — keyed against the wrong loan',
      ),
    ).toEqual({ kind: 'unknown' });
  });

  test('referenceFor returns the entered reference without any lookup', () => {
    const lookups = { ftByTxnRef: new Map<string, string>(), ftByPendingPayment: new Map<string, string>() };
    expect(referenceFor(parseRepaymentReference(DESCRIPTION), lookups)).toBe('FT123456789');
  });
});

describe('normalizeFtReference', () => {
  test('accepts a CBS FT, trimmed and upper-cased', () => {
    expect(normalizeFtReference(' ft26123ab4cd ')).toBe('FT26123AB4CD');
  });

  test('rejects what was keyed in by mistake on manual resolutions', () => {
    expect(normalizeFtReference('7000000000001')).toBeNull(); // an account number
    expect(normalizeFtReference('FT6123AB4CD')).toBeNull(); // a digit short
    expect(normalizeFtReference('FT26123AB4CD9')).toBeNull(); // a character too many
    expect(normalizeFtReference('')).toBeNull();
    expect(normalizeFtReference(null)).toBeNull();
  });
});
