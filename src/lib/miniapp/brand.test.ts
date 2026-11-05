import { describe, expect, it } from 'vitest';
import { brandTheme, contrastRatio, parseHex, DEFAULT_BRAND } from './brand';

const ratio = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);

describe('parseHex', () => {
  it('reads 3, 6 and 8 digit hex colours', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('f9c00e')).toEqual({ r: 249, g: 192, b: 14 });
    expect(parseHex('#f9c00e80')).toEqual({ r: 249, g: 192, b: 14 });
  });

  it('rejects anything else', () => {
    expect(parseHex('')).toBeNull();
    expect(parseHex('red')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex(undefined)).toBeNull();
  });
});

describe('brandTheme', () => {
  it('puts dark text on a light brand colour such as NIB yellow', () => {
    const t = brandTheme('#f9c00e');
    expect(ratio('#ffffff', '#f9c00e')).toBeLessThan(2); // why white text failed
    expect(ratio(t.onBrand, t.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps white text on a dark brand colour', () => {
    const t = brandTheme('#1e3a8a');
    expect(t.onBrand).toBe('#ffffff');
  });

  it('darkens the brand colour enough to read as text on white and on its tint', () => {
    for (const color of ['#f9c00e', '#fdb913', '#22c55e', '#06b6d4', '#ef4444', '#1e3a8a']) {
      const t = brandTheme(color);
      expect(ratio(t.ink, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.ink, t.soft)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.onBrand, t.brand)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves an already dark colour unchanged as ink', () => {
    expect(brandTheme('#1e3a8a').ink).toBe('#1e3a8a');
  });

  it('falls back to the default brand colour for a missing or malformed value', () => {
    expect(brandTheme(null).brand).toBe(DEFAULT_BRAND);
    expect(brandTheme('not-a-colour').brand).toBe(DEFAULT_BRAND);
  });
});
