/**
 * Number formatting for the statistics panel. Every function returns the text shown and a
 * spoken form for screen readers, which read "×", "σ", "−" and superscript exponents badly
 * or not at all. Pure, so it is tested in Node (`tests/ui/stats.test.ts`).
 *
 * Amounts are virtual credits or multiples of the bet (AGENTS.md rule 3): nothing here
 * formats a currency.
 */

export interface Shown {
  /** What the page shows. */
  readonly text: string;
  /** What a screen reader says instead. */
  readonly spoken: string;
}

const MINUS = '−';

function shown(text: string, spoken = text): Shown {
  return { text, spoken };
}

/** Thousands separators, a typographic minus. */
export function formatCount(n: number, digits = 0): Shown {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const negative = n < 0 && Number(abs.replace(/,/g, '')) !== 0;
  return shown(negative ? `${MINUS}${abs}` : abs, negative ? `minus ${abs}` : abs);
}

/** A share or rate as a percentage: 0.95997 → "95.997%" with `digits` 3. */
export function formatPercent(x: number, digits = 1): Shown {
  const n = formatCount(x * 100, digits);
  return shown(`${n.text}%`, `${n.spoken} percent`);
}

/** Percentage points, for a part of the RTP: 0.2022 → "20.2 points". */
export function formatPoints(x: number, digits = 1): Shown {
  const n = formatCount(x * 100, digits);
  return shown(`${n.text} points`, `${n.spoken} percentage points`);
}

/** A multiple of the bet: 5.715 → "5.72× bet". */
export function formatTimesBet(x: number, digits = 2): Shown {
  const n = formatCount(x, digits);
  return shown(`${n.text}× bet`, `${n.spoken} times the bet`);
}

/** Virtual credits, as the rest of the page writes them. */
export function formatCreditsShown(credits: number): Shown {
  const n = formatCount(credits);
  const unit = Math.abs(credits) === 1 ? 'credit' : 'credits';
  return shown(`${n.text} ${unit}`, `${n.spoken} ${unit}`);
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

/** 9.6e15 → "9.6 × 10¹⁵", spoken "9.6 times 10 to the power 15". */
export function formatScientific(x: number, digits = 1): Shown {
  if (x === 0) return shown('0');
  const exponent = Math.floor(Math.log10(Math.abs(x)));
  let mantissa = Number((x / 10 ** exponent).toFixed(digits));
  let e = exponent;
  if (Math.abs(mantissa) >= 10) {
    mantissa /= 10;
    e += 1;
  }
  const m = mantissa.toFixed(digits);
  const sup = String(e).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
  return shown(`${m} × 10${sup}`, `${m} times 10 to the power ${e}`);
}

/**
 * A probability as "1 in N": 0.105 → "1 in 9.5", 0.00709 → "1 in 141", 1e-16 → "1 in
 * 9.6 × 10¹⁵". Zero is "never".
 */
export function formatOneIn(p: number): Shown {
  if (!(p > 0)) return shown('never');
  const n = 1 / p;
  if (n < 10) return prefixOneIn(formatCount(n, 1));
  if (n < 1e6) return prefixOneIn(formatCount(Math.round(n)));
  return prefixOneIn(formatScientific(n, 1));
}

function prefixOneIn(n: Shown): Shown {
  return shown(`1 in ${n.text}`, `1 in ${n.spoken}`);
}

/** A z-score in words: "0.8 standard errors above", "1.3 below", "exactly on". */
export function formatZ(z: number): Shown {
  if (!Number.isFinite(z)) return shown(z > 0 ? 'far above' : 'far below');
  const a = formatCount(Math.abs(z), 1);
  if (a.text === '0.0') return shown('within 0.1 standard errors');
  const side = z > 0 ? 'above' : 'below';
  return shown(`${a.text} SE ${side}`, `${a.spoken} standard errors ${side}`);
}

/** A signed z-score for a table cell: "+0.8", "−1.3". */
export function formatSignedZ(z: number): Shown {
  if (!Number.isFinite(z)) return shown(z > 0 ? '+∞' : `${MINUS}∞`, z > 0 ? 'plus infinity' : 'minus infinity');
  const a = formatCount(Math.abs(z), 2);
  if (z >= 0) return shown(`+${a.text}`, `plus ${a.spoken}`);
  return shown(`${MINUS}${a.text}`, `minus ${a.spoken}`);
}

/** A placeholder for a figure with no value yet. */
export const NOT_AVAILABLE: Shown = shown('—', 'not available');
