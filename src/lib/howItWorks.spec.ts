import { describe, expect, it } from "vitest";
import { cleanSteps, hasHowItWorksProblems, howItWorksProblems, pickHowItWorks, type HowItWorksRow } from "./howItWorks";

const row = (plan_id: string | null, title: string): HowItWorksRow => ({
  id: title, provider_id: "p", plan_id, updated_at: "", steps: [{ title, text: null, icon: null }, { title: `${title}2`, text: null, icon: null }],
});

describe("pickHowItWorks", () => {
  it("prefers the plan's own steps, then the business's, then none (default)", () => {
    const rows = [row(null, "biz"), row("plan-a", "a")];
    expect(pickHowItWorks(rows, "plan-a")?.source).toBe("plan");
    expect(pickHowItWorks(rows, "plan-a")?.steps[0].title).toBe("a");
    expect(pickHowItWorks(rows, "plan-b")?.source).toBe("business");
    expect(pickHowItWorks(rows, null)?.steps[0].title).toBe("biz");
    expect(pickHowItWorks([row("plan-a", "a")], "plan-b")).toBeNull();
    expect(pickHowItWorks(undefined, "x")).toBeNull();
  });
});

describe("cleanSteps", () => {
  it("drops what a page cannot render and unknown icons", () => {
    expect(cleanSteps([{ title: " A ", text: " ", icon: "nope" }, { text: "no title" }, null, "x"]))
      .toEqual([{ title: "A", text: null, icon: null }]);
    expect(cleanSteps({ title: "A" })).toEqual([]);
  });
});

describe("howItWorksProblems", () => {
  const s = (title: string, text = "") => ({ title, text, icon: null });
  it("needs 2–6 steps with titles inside the limits", () => {
    expect(hasHowItWorksProblems(howItWorksProblems([s("A"), s("B")]))).toBe(false);
    expect(howItWorksProblems([s("A")]).list).toMatch(/at least 2/);
    expect(howItWorksProblems(Array.from({ length: 7 }, () => s("A"))).list).toMatch(/At most 6/);
    expect(howItWorksProblems([s(" "), s("B")]).steps[0]).toMatch(/title/);
    expect(howItWorksProblems([s("a".repeat(61)), s("B")]).steps[0]).toMatch(/60/);
    expect(howItWorksProblems([s("A", "x".repeat(241)), s("B")]).steps[0]).toMatch(/240/);
  });
});
