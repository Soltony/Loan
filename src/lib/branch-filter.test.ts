import { describe, expect, it } from 'vitest';
import { branchCodeFromSnippet, extractBranchCode } from './branch-filter';

/** What the database scan returns for a stored payload: 64 characters from the first `"branchcode"` key, any case. */
function snippetOf(stored: string): string | null {
  const at = stored.toLowerCase().indexOf('"branchcode"');
  return at < 0 ? null : stored.slice(at, at + 64);
}

const payloads: unknown[] = [
  { detail: { CustomerName: 'ABEBE', Branchcode: 132, Tinno: null, Gender: 'MALE' } },
  { Branchcode: '409', AccountNumber: '1000123' },
  { detail: { BranchCode: 409 } },
  { branchcode: 4 },
  { a: { b: { BRANCHCODE: 15 } } },
  { first: { Branchcode: 7 }, Branchcode: 8 },
  { Branchcode: '0409' },
  { name: 'no branch here' },
  { Branchcode: null },
  { detail: { Branchcode: 'ET0010409' } },
];

describe('branch code of a provisioned-data payload', () => {
  it('reads the same code from the scanned snippet as from the parsed JSON', () => {
    for (const payload of payloads) {
      for (const stored of [JSON.stringify(payload), JSON.stringify(payload, null, 2)]) {
        expect(branchCodeFromSnippet(snippetOf(stored)), stored).toBe(extractBranchCode(payload));
      }
    }
  });

  it('is exact: branch 409 is never branch 4', () => {
    expect(branchCodeFromSnippet('"Branchcode":409,"Tinno":null')).toBe(409);
    expect(branchCodeFromSnippet('"Branchcode": "4"}')).toBe(4);
    expect(branchCodeFromSnippet('"branchcode":null,')).toBeNull();
    expect(branchCodeFromSnippet(null)).toBeNull();
  });
});
