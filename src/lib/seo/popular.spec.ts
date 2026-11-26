import { describe, expect, it } from "vitest";
import { popularContext, popularFor, type RowReader } from "./popular";

const P = (id: string, name: string, archetype_key: string | null, unit = "marketplace") => ({ id, name, slug: id, archetype_key, unit });
const PLAN = (id: string, provider_id: string, public_no: number, price_cents = 1000) => ({ id, name: `Plan ${id}`, provider_id, slug: `plan-${id}`, public_no, price_cents, sort_order: null });

const DATA: Record<string, any[]> = {
  service_archetypes: [{ key: "food", label: "Food" }, { key: "cleaning", label: "Cleaning" }, { key: "healthcare", label: "Healthcare" }],
  providers: [P("elias", "Elias", "food"), P("chef", "Chef", "food"), P("maid", "Maid", "cleaning"), P("clinic", "Clinic", "healthcare"), P("cars", "Atlantis", null, "vehicles")],
  provider_plans: [PLAN("a", "elias", 1), PLAN("b", "chef", 2, 500), PLAN("c", "maid", 3)],
  rental_vehicles: [{ id: "v1", name: "Jeep", slug: "jeep", public_no: 9, provider_id: "cars" }],
  "rpc/popular_plans": [{ plan_id: "a", sales_rank: 1 }],
  home_collections: [{ id: "x", title: "Date night", slug: "date-night" }],
};
const rows: RowReader = async (path) => DATA[path.split("?")[0]] ?? [];

describe("popular links", () => {
  it("knows which pages get a block", () => {
    expect(popularContext("/services/food")).toEqual({ kind: "service", key: "food" });
    expect(popularContext("/plans/plan-a-1")).toEqual({ kind: "plan", seg: "plan-a-1" });
    expect(popularContext("/account")).toBeNull();
    expect(popularContext("/checkout/abc")).toBeNull();
  });

  it("a service page: its businesses and its most-bought plans first", async () => {
    const g = await popularFor("/services/food", "en", rows);
    expect(g[0].links.map((l) => l.href)).toEqual(["/businesses/elias", "/businesses/chef"]);
    expect(g[1].links.map((l) => l.href)).toEqual(["/plans/plan-a-1", "/plans/plan-b-2"]);
    // Neighbours: never itself, never a service with nothing on sale (healthcare).
    const services = g.find((x) => x.key === "services")!.links.map((l) => l.href);
    expect(services).toContain("/services/cleaning");
    expect(services).toContain("/vehicles");
    expect(services).not.toContain("/services/food");
    expect(services).not.toContain("/services/healthcare");
  });

  it("a plan page: similar plans and other businesses, never itself", async () => {
    const g = await popularFor("/plans/plan-a-1", "en", rows);
    expect(g.find((x) => x.key === "plans")!.links.map((l) => l.href)).toEqual(["/plans/plan-b-2"]);
    expect(g.find((x) => x.key === "businesses")!.links.map((l) => l.href)).toEqual(["/businesses/chef"]);
  });

  it("speaks Spanish on /es", async () => {
    const g = await popularFor("/discovery", "es", rows);
    expect(g[0].heading).toBe("Servicios más buscados en Roatán");
    expect(g.some((x) => x.key === "collections")).toBe(true);
  });

  it("an unknown page or service gets nothing", async () => {
    expect(await popularFor("/services/nope", "en", rows)).toEqual([]);
    expect(await popularFor("/my-subscriptions", "en", rows)).toEqual([]);
  });
});
