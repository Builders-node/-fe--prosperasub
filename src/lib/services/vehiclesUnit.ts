/**
 * Vehicles — a unit of its own, and ONE word for it.
 *
 * It used to answer to five names at once: "Transport" on the home tab and the
 * admin sidebar, "Car Rental" on the storefront header, "Rental" in the URL
 * registry, "Fleet" on an admin tab and "Vehicles" on the shelf. Same thing,
 * five words, so nothing read as one product. The URL (`/vehicles`) and every
 * table (`rental_vehicles`, `rental_categories`) already said vehicles, so
 * that is the word that survives — everywhere, without exception.
 *
 * "Car" is not a synonym for it. A car is a TYPE of vehicle, a row in
 * `rental_categories` beside Motorbikes and Boats, and it is the only place
 * that word is allowed to appear.
 *
 * The unit has no archetype and no service layer. What it is:
 *
 *     Provider  →  Vehicle  →  type (rental_categories)
 *
 * A rental company is still an ordinary `providers` row — that is what owns a
 * workspace, earns revenue and gets paid — marked by `providers.unit`. It
 * carries no `category_key`: the type belongs to the product, because one
 * company can rent cars and motorbikes.
 */

/** `providers.unit` / `provider_applications.unit` for a vehicles business. */
export const VEHICLES_UNIT = "vehicles";

/** The unit every other business belongs to — the archetype-driven tree. */
export const MARKETPLACE_UNIT = "marketplace";

/** The word on every surface: tab, sidebar, header, crumb, heading. */
export const VEHICLES_LABEL = "Vehicles";

/** Where the unit's own storefront lives. */
export const VEHICLES_STOREFRONT = "/vehicles";

/** True when this business is run by the vehicles unit. */
export const isVehiclesProvider = (
  provider: { unit?: string | null } | null | undefined,
): boolean => provider?.unit === VEHICLES_UNIT;
