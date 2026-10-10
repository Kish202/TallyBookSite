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
 * Accepts up to two fractional digits. Rejects anything else (including
 * exponents, thousands separators, currency symbols or trailing whitespace)
 * so that callers never silently lose precision.
 */
export function parseCents(input: string): number {
  const match = DECIMAL_RE.exec(input);
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

/** Format cents as a decimal string with exactly two fractional digits. */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
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
