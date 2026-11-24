import { describe, expect, it } from "vitest";
import { vatCentsFor, vatLabel } from "./vat";

describe("vatCentsFor", () => {
  it("adds the rate on the goods", () => {
    expect(vatCentsFor(10_000, 15)).toBe(1_500);
  });
  it("rounds to the cent", () => {
    expect(vatCentsFor(999, 7.5)).toBe(75); // 74.925
  });
  it("is nothing without a rate or a price", () => {
    expect(vatCentsFor(10_000, 0)).toBe(0);
    expect(vatCentsFor(10_000, null)).toBe(0);
    expect(vatCentsFor(0, 15)).toBe(0);
    expect(vatCentsFor(-5, 15)).toBe(0);
  });
  it("labels the rate without trailing zeros", () => {
    expect(vatLabel(15)).toBe("VAT 15%");
    expect(vatLabel(7.5)).toBe("VAT 7.5%");
  });
});
