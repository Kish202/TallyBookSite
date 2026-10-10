import { describe, expect, it } from "vitest";
import { formatCents, MoneyParseError, parseCents, sumCents } from "../src/lib/money.js";

describe("parseCents", () => {
  it.each([
    ["0", 0],
    ["1", 100],
    ["12.34", 1234],
    ["12.3", 1230],
    ["-0.01", -1],
    ["-100", -10000],
    ["0.99", 99],
  ])("parses %s to %d", (input, expected) => {
    expect(parseCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "1,000", "$5", " 5", "5 ", "1e3", ".5", "5.", "+5", "NaN"])(
    "rejects %j",
    (input) => {
      expect(() => parseCents(input)).toThrow(MoneyParseError);
    },
  );

  it("rejects values outside the safe integer range", () => {
    expect(() => parseCents("99999999999999999")).toThrow(MoneyParseError);
  });
});

describe("formatCents", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [1234, "12.34"],
    [-1, "-0.01"],
    [-10000, "-100.00"],
    [100, "1.00"],
  ])("formats %d as %s", (input, expected) => {
    expect(formatCents(input)).toBe(expected);
  });

  it("round-trips with parseCents", () => {
    for (const value of ["0.00", "19.99", "-3.50", "1000000.01"]) {
      expect(formatCents(parseCents(value))).toBe(value);
    }
  });

  it("rejects non-integers", () => {
    expect(() => formatCents(1.5)).toThrow(TypeError);
  });
});

describe("sumCents", () => {
  it("sums integers exactly", () => {
    expect(sumCents([10, 20, -5])).toBe(25);
    expect(sumCents([])).toBe(0);
  });

  it("throws when the total leaves the safe range", () => {
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});
