/**
 * Transport is its own unit — and it has no archetype, not even in the model.
 *
 * The marketplace is a tree: Service (archetype) → Category → Provider → Plan.
 * Transport is not that shape and pretending otherwise cost us an invisible
 * service layer nobody could see but every screen had to carry: a "Cars"
 * archetype whose only child was a "Cars" category whose only member was one
 * business, and a Types editor that asked which SERVICE a vehicle type
 * belongs to.
 *
 * What transport actually is:
 *
 *     Provider  →  Vehicle  →  type (rental_categories)
 *
 * A rental company is still an ordinary `providers` row — that is what owns a
 * workspace, earns revenue and gets paid, and duplicating it would mean a
 * second identity and a second wallet for no gain. It is marked by
 * `providers.unit`, not by an archetype, and it carries no `category_key`:
 * the TYPE belongs to the product, because one company can rent cars and
 * motorbikes.
 */

/** `providers.unit` / `provider_applications.unit` for a rental business. */
export const TRANSPORT_UNIT = "transport";

/** The unit every other business belongs to — the archetype-driven tree. */
export const MARKETPLACE_UNIT = "marketplace";

/** True when this business is run by the transport unit. */
export const isTransportProvider = (
  provider: { unit?: string | null } | null | undefined,
): boolean => provider?.unit === TRANSPORT_UNIT;

/** Where the unit's own storefront lives. */
export const TRANSPORT_STOREFRONT = "/vehicles";
