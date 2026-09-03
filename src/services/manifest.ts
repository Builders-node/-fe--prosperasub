/**
 * One place that knows what a vertical's key means.
 *
 * The descriptor tables — revenue, subscribers, analytics — are all keyed the
 * same way and all have to resolve the same aliases: `entertainment` is the
 * Lifestyle archetype the beach lives on, `beach_club` an older spelling still
 * in data. Three copies of that map would be three chances for them to
 * disagree about which vertical a row belongs to, and one of those three
 * decides money.
 *
 * Cars are matched on the archetype rather than a `source_service_key`,
 * because they never had a legacy service and never will.
 */
const ALIASES: Record<string, string> = {
  beach_club: "beach",
  entertainment: "beach",
};

/** The key a vertical's descriptors are filed under. */
export function canonicalServiceKey(key: string | null | undefined): string {
  const k = String(key ?? "").toLowerCase();
  return ALIASES[k] ?? k;
}
