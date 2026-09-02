/**
 * Transport is its own unit, not a service inside the marketplace.
 *
 * A rental company is still an ordinary `providers` row — that is what owns a
 * workspace, earns revenue and gets paid, and duplicating it would mean a
 * second identity and a second wallet for no gain. What is separate is the
 * PRODUCT: renting a car is not subscribing to a service, it is not sold in
 * plans and periods, and it does not belong under "pick a service to manage
 * its categories, providers and plans".
 *
 * So the split lives here, in one predicate, rather than as a scattered
 * `key === "vehicles"` in every screen that has to choose a side.
 */
export const TRANSPORT_ARCHETYPES = new Set<string>(["vehicles"]);

/** True when this archetype belongs to Transport rather than the marketplace. */
export const isTransportArchetype = (key: string | null | undefined): boolean =>
  TRANSPORT_ARCHETYPES.has(String(key ?? ""));
