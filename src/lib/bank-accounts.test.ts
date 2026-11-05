import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { accountBelongsToPhone, accountNumbersFrom } from './bank-accounts';

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('accountNumbersFrom', () => {
  it('reads AccountNumber as text from the details list', () => {
    expect([...accountNumbersFrom({ details: [{ AccountNumber: 7000100663371 }, { AccountNumber: ' 7000023875182 ' }] })]).toEqual([
      '7000100663371',
      '7000023875182',
    ]);
    expect(accountNumbersFrom({ status: 'Error' }).size).toBe(0);
    expect(accountNumbersFrom(null).size).toBe(0);
  });
});

describe('accountBelongsToPhone', () => {
  const env = { ...process.env };
  beforeEach(() => {
    (globalThis as any).__bankAccountsByPhone?.clear();
    process.env.EXTERNAL_API_URL = 'http://bank.test/get-accounts';
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it('says yes only for an account the bank lists under the phone', async () => {
    const fetchMock = vi.fn(async () => answer(200, { details: [{ AccountNumber: '7000100663371' }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await accountBelongsToPhone('251949385646', '7000100663371')).toBe('yes');
    expect(await accountBelongsToPhone('251949385646', '7000023875182')).toBe('no');
    const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(sent).toEqual({ phoneNumber: '251949385646' });
  });

  it('is unavailable when the bank answers with an error or cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(500, { error: 'down' })));
    expect(await accountBelongsToPhone('251900000001', '7000100663371')).toBe('unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await accountBelongsToPhone('251900000001', '7000100663371')).toBe('unavailable');
  });

  it('without a bank URL: refuses in production, allows only on a development machine with test login', async () => {
    delete process.env.EXTERNAL_API_URL;
    (process.env as any).NODE_ENV = 'production';
    process.env.MINIAPP_TEST_LOGIN = 'true';
    expect(await accountBelongsToPhone('251900000002', '7000100663371')).toBe('unavailable');
    (process.env as any).NODE_ENV = 'development';
    expect(await accountBelongsToPhone('251900000002', '7000100663371')).toBe('yes');
    process.env.MINIAPP_TEST_LOGIN = 'false';
    expect(await accountBelongsToPhone('251900000002', '7000100663371')).toBe('unavailable');
  });
});
