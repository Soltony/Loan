/**
 * Colours for the customer mini-app, worked out from a provider's brand colour.
 *
 * Providers can pick any colour (NIB's is a bright yellow), so the mini-app never puts fixed
 * white text on it, nor uses it as-is for text on white: both fail to read on a light brand
 * colour. Instead it derives
 *   - onBrand: text placed on the brand colour (white or a deep shade of the same hue,
 *     whichever contrasts more),
 *   - ink:     the brand colour darkened until it reads on white (WCAG AA, 4.5:1),
 *   - soft:    a light tint of the brand colour for chips and highlighted rows.
 */

export const DEFAULT_BRAND = '#fdb913';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** Reads #rgb, #rrggbb or #rrggbbaa (alpha ignored); null for anything else. */
export function parseHex(input: string | null | undefined): Rgb | null {
  if (typeof input !== 'string') return null;
  let hex = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{8}$/i.test(hex)) hex = hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

const linear = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(c: Rgb): number {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  // Whole channels, so a contrast checked here is the contrast of the hex that is output.
  return {
    r: Math.round(hue(p, q, h + 1 / 3) * 255),
    g: Math.round(hue(p, q, h) * 255),
    b: Math.round(hue(p, q, h - 1 / 3) * 255),
  };
}

/** The colour, darkened within its own hue until it reaches `target`:1 against `against`. */
export function darkenForContrast(c: Rgb, against: Rgb = WHITE, target = 4.5): Rgb {
  if (contrastRatio(c, against) >= target) return c;
  const { h, s, l } = rgbToHsl(c);
  for (let next = l - 0.01; next > 0; next -= 0.01) {
    const candidate = hslToRgb(h, s, next);
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return { r: 0, g: 0, b: 0 };
}

/** Text colour for content on the brand colour: white, or a deep shade of the same hue. */
export function foregroundOn(c: Rgb): Rgb {
  const { h, s } = rgbToHsl(c);
  const deep = hslToRgb(h, Math.min(s, 0.85), 0.1);
  return contrastRatio(WHITE, c) >= contrastRatio(deep, c) ? WHITE : deep;
}

/** Blend of `a` and `b`; `weightOfB` = 0 gives `a`, 1 gives `b`. */
export function mix(a: Rgb, b: Rgb, weightOfB: number): Rgb {
  const w = Math.min(1, Math.max(0, weightOfB));
  return {
    r: Math.round(a.r + (b.r - a.r) * w),
    g: Math.round(a.g + (b.g - a.g) * w),
    b: Math.round(a.b + (b.b - a.b) * w),
  };
}

export interface BrandTheme {
  /** The provider's colour (or the default when it is missing or malformed). */
  brand: string;
  /** Text on the brand colour. */
  onBrand: string;
  /** Brand-coloured text on white. */
  ink: string;
  /** Light tint for chips and highlighted rows (ink reads on it). */
  soft: string;
}

export function brandTheme(color?: string | null): BrandTheme {
  const base = parseHex(color) ?? (parseHex(DEFAULT_BRAND) as Rgb);
  const soft = mix(base, WHITE, 0.86);
  return {
    brand: toHex(base),
    onBrand: toHex(foregroundOn(base)),
    // Ink must read on both white and the soft tint.
    ink: toHex(darkenForContrast(darkenForContrast(base), soft)),
    soft: toHex(soft),
  };
}

/** The theme as CSS custom properties (the mini-app's Tailwind `brand` colours read them). */
export function brandCssVars(color?: string | null): Record<string, string> {
  const t = brandTheme(color);
  return {
    '--brand': t.brand,
    '--brand-fg': t.onBrand,
    '--brand-ink': t.ink,
    '--brand-soft': t.soft,
  };
}
