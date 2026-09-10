import { describe, it, expect } from "vitest";
import { toCsv } from "./exportCsv";

const cols = [
  { header: "Name", value: (r: any) => r.name },
  { header: "Amount", value: (r: any) => r.amount },
];

describe("toCsv", () => {
  it("quotes every cell and doubles inner quotes", () => {
    const csv = toCsv([{ name: 'He said "hi"', amount: 12 }], cols);
    expect(csv).toContain('"He said ""hi"""');
  });

  it("keeps a comma inside one field", () => {
    const csv = toCsv([{ name: "Reyes, Ana", amount: 1 }], cols);
    expect(csv.split("\r\n")[1]).toBe('"Reyes, Ana","1"');
  });

  it("neutralises a cell that would run as a formula", () => {
    // Excel and Numbers execute a leading = + - or @; a customer name is not
    // a reason to run something on the accountant's machine.
    for (const bad of ["=1+1", "+x", "-x", "@x"]) {
      expect(toCsv([{ name: bad, amount: 0 }], cols)).toContain(`"'${bad}"`);
    }
  });

  it("writes empty for null and undefined rather than the words", () => {
    const csv = toCsv([{ name: null, amount: undefined }], cols);
    expect(csv.split("\r\n")[1]).toBe('"",""');
  });

  it("starts with a BOM so Excel reads UTF-8", () => {
    expect(toCsv([], cols).charCodeAt(0)).toBe(0xfeff);
  });
});
