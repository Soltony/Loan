import { describe, it, expect } from 'vitest';
import { definitionsVersion, validateDefinition } from './statement-parameters';

const valid = {
  name: 'Telebirr transactions',
  direction: 'BOTH',
  matchWords: 'Telebirr, tele birr',
  excludeWords: '',
  measure: 'COUNT_PER_MONTH',
  minAmount: '',
};

describe('validateDefinition', () => {
  it('accepts and tidies a valid definition', () => {
    const r = validateDefinition(valid);
    expect(r).toEqual({
      ok: true,
      definition: {
        field: 'telebirrTransactions',
        name: 'Telebirr transactions',
        direction: 'BOTH',
        matchWords: 'telebirr, tele birr',
        excludeWords: null,
        measure: 'COUNT_PER_MONTH',
        minAmount: null,
      },
    });
  });

  it('keeps a given field (existing parameters keep theirs when renamed)', () => {
    const r = validateDefinition({ ...valid, name: 'Wallet use', field: 'telebirrTransactions' });
    expect(r.ok && r.definition.field).toBe('telebirrTransactions');
  });

  it.each([
    [{ name: 'ab' }, 'Name must be 3 to 60'],
    [{ name: '2 wallets' }, 'must start with a letter'],
    [{ name: 'Avg monthly deposit' }, 'built-in scoring field'],
    [{ direction: 'SIDEWAYS' }, 'money in, money out or both'],
    [{ measure: 'MEDIAN' }, 'what to measure'],
    [{ measure: 'SHARE_OF_INCOME' }, 'not both'],
    [{ matchWords: ' , ' }, 'at least one word'],
    [{ matchWords: 'a' }, '2 to 40 characters'],
    [{ minAmount: -5 }, 'Minimum amount'],
  ])('rejects %j', (change, message) => {
    const r = validateDefinition({ ...valid, ...change });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(message);
  });
});

describe('definitionsVersion', () => {
  const a = { field: 'a1b', name: 'A', direction: 'IN' as const, matchWords: 'x', measure: 'COUNT_PER_MONTH' as const };
  const b = { ...a, field: 'b2c' };

  it('ignores order and missing vs null', () => {
    expect(definitionsVersion([a, b])).toBe(definitionsVersion([{ ...b, excludeWords: null, minAmount: null }, a]));
  });

  it('changes when a definition changes', () => {
    expect(definitionsVersion([a])).not.toBe(definitionsVersion([{ ...a, matchWords: 'y' }]));
    expect(definitionsVersion([])).not.toBe(definitionsVersion([a]));
  });
});
