/**
 * A family that owns its storefront.
 *
 * Vehicles is a unit of its own: it sells a physical object for a range of
 * days, it lives at `/vehicles` with its own header, its own type chips and
 * its own fleet, and it is administered on its own terms. Discovery's job for
 * such a family is to be a DOOR to that unit — rebuilding its browse UI as a
 * grid of "services" made the home page say the same word at three levels
 * that mean nothing to a visitor ("Cars" the family, "Cars" the service,
 * "Cars" the type).
 *
 * Experiences has no entry here on purpose: cleaning, food and lifestyle are
 * genuinely different services, and the grid is how a visitor chooses between
 * them.
 *
 * Declared here rather than branched on inside Discovery so the home page
 * asks "does this family own a storefront?" instead of naming a unit.
 */
export interface FamilyStorefront {
  /** Where the unit's own section lives. */
  href: string;
  /** The heading above the unit's tiles on Discovery. */
  title: string;
  /** The "everything" row — its title and what the visitor gets there. */
  allLabel: string;
  caption: string;
}

export const FAMILY_STOREFRONTS: Record<string, FamilyStorefront> = {
  vehicles: {
    href: "/vehicles",
    title: "Vehicles",
    allLabel: "All vehicles",
    caption: "Every vehicle, priced by the day",
  },
};

export const familyStorefront = (family: string | undefined): FamilyStorefront | null =>
  (family && FAMILY_STOREFRONTS[family]) || null;
