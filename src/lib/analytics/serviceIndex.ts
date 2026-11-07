import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";

/**
 * Which SERVICE a sale belongs to — the one the admin sees in Settings →
 * Services (Food, Cleaning, Lifestyle, Healthcare…), not the table it was
 * written to.
 *
 * Money used to be grouped by the read model's source arm (cleaning · food ·
 * beach · plan · cars). That made "Beach Club" a service when it is a business
 * inside Lifestyle, and folded every new service — Healthcare, Water, Clubs &
 * Sport — into one "Other services" line, so the moment two of them sold
 * nobody could tell them apart. A sale now takes its business's
 * `archetype_key`; a car is Vehicles (its own unit, not an archetype); a sale
 * whose business is unknown is Unassigned. A new service appears in Finance
 * and Analytics as data, with no code.
 */

/** The `subscriptions_unified.service` arm — which table a row came from. */
export type SaleSource = "cleaning" | "food" | "beach" | "plan" | "cars";

export const VEHICLES_KEY = "vehicles";
export const UNASSIGNED_KEY = "unassigned";

export interface ServiceInfo {
  key: string;
  label: string;
  /** Icon key for `resolveCategoryIcon`; null for the synthetic buckets. */
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ServiceIndex {
  /** Universal provider id → service key. */
  providerService: Map<string, string>;
  /** Every service that exists, in Settings order, plus Vehicles and Unassigned. */
  services: ServiceInfo[];
  byKey: Map<string, ServiceInfo>;
}

export const SERVICE_INDEX_KEY = ["admin-service-index"] as const;

export async function fetchServiceIndex(): Promise<ServiceIndex> {
  const [providers, archetypes] = await Promise.all([
    fetchAllRows<{ id: string; archetype_key: string | null }>(() => supabaseDb
      .from("providers").select("id, archetype_key").order("id")),
    supabaseDb.from("service_archetypes").select("key, label, icon, is_active, sort_order").order("sort_order"),
  ]);
  if (archetypes.error) throw archetypes.error;

  const services: ServiceInfo[] = ((archetypes.data ?? []) as any[]).map((a) => ({
    key: String(a.key),
    label: String(a.label ?? a.key),
    icon: a.icon ?? null,
    isActive: !!a.is_active,
    sortOrder: Number(a.sort_order) || 0,
  }));
  services.push(
    { key: VEHICLES_KEY, label: "Vehicles", icon: "car", isActive: true, sortOrder: 9_000 },
    { key: UNASSIGNED_KEY, label: "Unassigned", icon: null, isActive: false, sortOrder: 9_001 },
  );

  return {
    providerService: new Map(providers.filter((p) => p.archetype_key).map((p) => [String(p.id), String(p.archetype_key)])),
    services,
    byKey: new Map(services.map((s) => [s.key, s])),
  };
}

/** The service a sale counts under. */
export function serviceOfSale(
  sale: { service?: string | null; provider_id?: string | null },
  index: ServiceIndex,
): string {
  if (sale.service === "cars") return VEHICLES_KEY;
  const key = sale.provider_id ? index.providerService.get(String(sale.provider_id)) : undefined;
  return key && index.byKey.has(key) ? key : UNASSIGNED_KEY;
}

export const serviceLabelOf = (key: string, index?: ServiceIndex | null) =>
  index?.byKey.get(key)?.label ?? (key === VEHICLES_KEY ? "Vehicles" : key === UNASSIGNED_KEY ? "Unassigned" : key);

/**
 * The services worth a row: every switched-on service, plus any other one that
 * has sales (a switched-off service still earned what it earned). Settings order.
 */
export function visibleServices(index: ServiceIndex, keysWithSales: Iterable<string>): ServiceInfo[] {
  const sold = new Set(keysWithSales);
  return index.services.filter((s) =>
    sold.has(s.key) || (s.isActive && s.key !== VEHICLES_KEY && s.key !== UNASSIGNED_KEY));
}

let cached: { at: number; promise: Promise<ServiceIndex> } | null = null;
/** The index, shared by every reader on the page for a minute. */
export function getServiceIndex(): Promise<ServiceIndex> {
  if (cached && Date.now() - cached.at < 60_000) return cached.promise;
  const promise = fetchServiceIndex().catch((e) => { cached = null; throw e; });
  cached = { at: Date.now(), promise };
  return promise;
}
