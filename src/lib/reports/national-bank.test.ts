import { describe, expect, it } from 'vitest';
import { facilityType, splitFullName } from './national-bank';

describe('National Bank return', () => {
  it('reports each facility under exactly one type', () => {
    expect(facilityType('Salary Advance', true)).toBe('other');
    expect(facilityType('Personal Loan', false)).toBe('personal');
    // A salary advance is never a personal loan, whatever it is called.
    expect(facilityType('Personal Salary Advance', true)).toBe('other');
    expect(facilityType('BNPL Personal', false)).toBe('bnpl');
    expect(facilityType('Personal working capital', false)).toBe('personal');
    expect(facilityType('Working Capital', false)).toBe('workingCapital');
    expect(facilityType('Revolving credit limit', false)).toBe('revolving');
    expect(facilityType('MSME Micro', false)).toBe('msme');
  });

  it('splits a full name into first, middle and last', () => {
    expect(splitFullName('GEMECHU URGE SEGNI')).toEqual(['GEMECHU', 'URGE', 'SEGNI']);
    expect(splitFullName('  ABEBE   KEBEDE TOLA GUTA ')).toEqual(['ABEBE', 'KEBEDE', 'TOLA GUTA']);
    expect(splitFullName('ABEBE KEBEDE')).toEqual(['ABEBE', '', 'KEBEDE']);
    expect(splitFullName('ABEBE')).toEqual(['ABEBE', '', '']);
  });
});
