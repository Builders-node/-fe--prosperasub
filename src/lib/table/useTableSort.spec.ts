import { describe, expect, it } from "vitest";
import { sortRows } from "./useTableSort";

describe("sortRows", () => {
  it("puts empties last in both directions", () => {
    const rows = [{ v: 2 }, { v: null }, { v: 10 }, { v: undefined }, { v: 1 }];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([1, 2, 10, null, undefined]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([10, 2, 1, null, undefined]);
  });
  it("compares text naturally and without case", () => {
    const rows = ["plan 10", "Plan 2", "apple"].map((v) => ({ v }));
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual(["apple", "Plan 2", "plan 10"]);
  });
  it("sorts dates by time and keeps ties stable", () => {
    const rows = [
      { id: "a", d: new Date("2026-03-01") },
      { id: "b", d: new Date("2026-01-01") },
      { id: "c", d: new Date("2026-03-01") },
    ];
    expect(sortRows(rows, (r) => r.d, "desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
});
