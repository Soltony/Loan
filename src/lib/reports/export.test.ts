import { describe, expect, it } from 'vitest';
import { EXPORT_SHEETS, exportFileName, parseSheets, sanitize } from './export';

describe('report export', () => {
  const allowed = EXPORT_SHEETS.filter((sheet) => sheet !== 'utilization');

  it('exports the sheets asked for, in workbook order, never one the user may not see', () => {
    expect(parseSheets('repayments,providerLoans', allowed)).toEqual(['providerLoans', 'repayments']);
    expect(parseSheets('utilization', allowed)).toEqual(allowed);
    expect(parseSheets('utilization,aging', allowed)).toEqual(['aging']);
    expect(parseSheets(null, EXPORT_SHEETS)).toEqual([...EXPORT_SHEETS]);
  });

  it('writes text a spreadsheet would run as a formula as text', () => {
    expect(sanitize('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(sanitize('+251911')).toBe(`'+251911`);
    expect(sanitize('-5')).toBe(`'-5`);
    expect(sanitize('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(sanitize('ABEBE')).toBe('ABEBE');
    expect(sanitize(-5)).toBe(-5);
  });

  it('names the file after its one sheet, or as the full report', () => {
    expect(exportFileName(['providerLoans'], 'monthly', '2026-11-05')).toBe(
      'LoanFlow_Provider_Loans_monthly_2026-11-05.xlsx',
    );
    expect(exportFileName(['aging', 'borrowerAging'], 'overall', '2026-11-05')).toBe(
      'LoanFlow_Report_overall_2026-11-05.xlsx',
    );
  });
});
