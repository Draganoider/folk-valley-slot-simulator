/**
 * Exact rational numbers on BigInt, for the analyser's figures that are cheap to keep exact
 * (DR-006): the uncapped RTP and its split, the second moment, feature rates and the Scar
 * Card's stationary distribution. Every value is kept in lowest terms with a positive
 * denominator. Immutable plain objects; no global state.
 */

export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/** n / d in lowest terms. Throws on a zero denominator. */
export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let nn = typeof n === 'bigint' ? n : toBig(n);
  let dd = typeof d === 'bigint' ? d : toBig(d);
  if (dd === 0n) throw new RangeError('A rational needs a non-zero denominator.');
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd);
  return g === 1n || g === 0n ? { n: nn, d: dd } : { n: nn / g, d: dd / g };
}

function toBig(x: number): bigint {
  if (!Number.isSafeInteger(x)) throw new RangeError(`Only safe integers convert exactly; got ${x}.`);
  return BigInt(x);
}

export const ZERO: Rational = { n: 0n, d: 1n };
export const ONE: Rational = { n: 1n, d: 1n };

export function add(a: Rational, b: Rational): Rational {
  return a.d === b.d ? rat(a.n + b.n, a.d) : rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return a.d === b.d ? rat(a.n - b.n, a.d) : rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new RangeError('Division by a zero rational.');
  return rat(a.n * b.d, a.d * b.n);
}

export function isZero(a: Rational): boolean {
  return a.n === 0n;
}

export function cmp(a: Rational, b: Rational): number {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
}

export function sum(values: Iterable<Rational>): Rational {
  let acc = ZERO;
  for (const v of values) acc = add(acc, v);
  return acc;
}

/**
 * The nearest double, correctly rounded up to one unit in the last place: the quotient is
 * taken in BigInt with 64 significant bits before the single conversion, so a huge
 * numerator and denominator lose nothing to an early `Number()`.
 */
export function toNumber(a: Rational): number {
  if (a.n === 0n) return 0;
  const neg = a.n < 0n;
  const n = neg ? -a.n : a.n;
  const shift = 64 - (bitLength(n) - bitLength(a.d));
  const q = shift >= 0 ? (n << BigInt(shift)) / a.d : n / (a.d << BigInt(-shift));
  const v = Number(q) * 2 ** -shift;
  return neg ? -v : v;
}

function bitLength(x: bigint): number {
  return x.toString(2).length;
}

/** Plain-data form for JSON reports: the exact fraction as decimal strings, and its double. */
export interface RationalJson {
  readonly numerator: string;
  readonly denominator: string;
  readonly value: number;
}

export function toJson(a: Rational): RationalJson {
  return { numerator: a.n.toString(), denominator: a.d.toString(), value: toNumber(a) };
}
