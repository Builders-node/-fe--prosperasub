import type { ReactNode } from "react";
import { CarFront } from "lucide-react";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { ProviderItemsPanel } from "@/components/provider/ProviderItemsPanel";
import { ServiceLocationsSection } from "@/components/food/admin/ServiceLocationsSection";
import { RentalTermsTab } from "@/features/vehicles";
import CarRentals from "@/pages/admin/CarRentals";
import { canonicalServiceKey } from "@/services/manifest";

/**
 * What a vertical adds to the provider workspace.
 *
 * The workspace gives every business the same screens — Overview, Offerings,
 * Schedule, Calendars, Money, Team — and that is deliberate: they are the
 * same job whatever is being sold. Three verticals want something more, and
 * the workspace was asking them by name to find out what.
 *
 * A business that has said nothing here gets the standard set, which is why
 * a service created in /admin/services needs no code to have a working
 * workspace.
 */

export interface WorkspaceContext {
  /** Universal `providers.id`. */
  providerId: string;
  /** The per-service id, for the verticals that still have one. */
  legacyId: string;
  isOwner: boolean;
  sourceKey: string;
}

export interface WorkspaceCustomisation {
  /**
   * Replaces the plans editor entirely, for a vertical that does not sell
   * plans at all.
   */
  offerings?: (ctx: WorkspaceContext) => ReactNode;
  /** A panel above the plans editor, for a vertical that sells plans AND more. */
  offeringsExtra?: (ctx: WorkspaceContext) => ReactNode;
  /** A panel appended to the Info tab. */
  infoExtra?: (ctx: WorkspaceContext) => ReactNode;
  /** Screens the standard set does not have. */
  extraTabs?: (ctx: WorkspaceContext) => PortalTab<unknown>[];
}

const NONE: WorkspaceCustomisation = {};

const WORKSPACE: Record<string, WorkspaceCustomisation> = {
  // Keyed by the UNIT, not an archetype — vehicles has none (see
  // lib/services/vehiclesUnit.ts).
  vehicles: {
    // What a rental business offers is coverage, extras and delivery — not
    // plans. A plan is a price for a period sold over and over; a car is one
    // object for a stretch of days. Showing the plans editor here only invited
    // someone to create a row nothing would ever read.
    offerings: ({ providerId, isOwner }) => (
      <RentalTermsTab providerId={providerId} canManage={isOwner} />
    ),
    // A fleet is not a plan and never will be: availability is per-unit and
    // continuous, and the thing booked is one physical object. So a rental
    // business gets its own tab while remaining an ordinary `providers` row —
    // same Overview, Money and Team as every other business.
    extraTabs: ({ providerId }) => [{
      value: "fleet",
      label: "Vehicles",
      icon: CarFront,
      // The admin's own car screen, scoped to this business. One place where
      // cars are managed, whoever is looking at it.
      render: () => <CarRentals embedded providerId={providerId} />,
    } as PortalTab<unknown>],
  },

  food: {
    // What a day is made of, above the plans that sell it: a plan says how
    // many, this says which. Only where something is delivered within a day —
    // a membership has no lunch.
    offeringsExtra: ({ providerId }) => <ProviderItemsPanel providerId={providerId} />,
    // Where this restaurant delivers.
    infoExtra: ({ legacyId }) => (legacyId ? <ServiceLocationsSection providerId={legacyId} /> : null),
  },
};

/**
 * What this vertical adds — nothing, for anything that has not said otherwise.
 *
 * Vehicles is keyed by its UNIT and food by its legacy `source_service_key`,
 * so the caller passes whichever it has and both land here.
 */
export function workspaceFor(key: string | null | undefined): WorkspaceCustomisation {
  return WORKSPACE[canonicalServiceKey(key)] ?? NONE;
}
