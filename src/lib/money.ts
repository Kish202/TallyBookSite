/**
 * Money helpers.
 *
 * All amounts are stored and computed as integer minor units (cents) to avoid
 * floating point drift. These helpers convert between the wire format
 * (decimal strings such as "12.34") and integer cents.
 */

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

export class MoneyParseError extends Error {
  constructor(input: string) {
    super(`Invalid money amount: "${input}"`);
    this.name = "MoneyParseError";
  }
}

/**
 * Parse a decimal string into integer cents.
 *
 * Accepts up to two fractional digits and optional thousands separators
 * ("1,234.56"), which spreadsheet exports commonly include. Rejects anything
 * else (exponents, currency symbols, whitespace) so that callers never
 * silently lose precision.
 */
export function parseCents(input: string): number {
  const match = DECIMAL_RE.exec(input.replace(/,/g, ""));
  if (!match) {
    throw new MoneyParseError(input);
  }
  const [, sign, whole, fraction = ""] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new MoneyParseError(input);
  }
  return sign === "-" ? -cents : cents;
}

/** Format integer cents as a decimal string with exactly two fractional digits. */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatCents expects an integer, received ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Sum a list of integer cent values, guarding against overflow. */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Sum exceeds the safe integer range");
    }
  }
  return total;
}
