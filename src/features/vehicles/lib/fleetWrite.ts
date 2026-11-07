import { accountApi } from "@/integrations/supabase/client";

/**
 * Every write to the fleet and its terms (vehicles, insurance, extras, zones,
 * types) goes through the API, which checks the caller runs the business that
 * owns the row. The browser could write these tables directly — including a
 * car's price just before booking it — until migration 20261113120000.
 */
export type FleetTable =
  | "rental_vehicles" | "rental_insurance_tiers" | "rental_extras" | "rental_delivery_zones" | "rental_categories";

export async function fleetWrite(
  table: FleetTable,
  op: "insert" | "update" | "delete",
  args: { id?: string; row?: Record<string, unknown> } = {},
): Promise<{ data: unknown; error: Error | null }> {
  const { data, error } = await accountApi("/account/rental-fleet", {
    method: "POST",
    body: JSON.stringify({ table, op, id: args.id, row: args.row }),
  });
  return { data, error: (error as Error | null) ?? null };
}
