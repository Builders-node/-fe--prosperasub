import type { ReactNode } from "react";
import { CarFront, ClipboardList, ShieldCheck } from "lucide-react";
import type { PortalTab } from "@/components/provider/portalTab";
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
  /**
   * Replaces Offerings, Schedule and Calendars with the vertical's own
   * screens — for one whose day is not plans and occurrences at all.
   * Overview, Promote, Money and Team stay the platform's.
   */
  coreTabs?: (ctx: WorkspaceContext) => PortalTab<unknown>[];
  /** Above everything else on Overview — what the business looks at first. */
  overviewTop?: (ctx: WorkspaceContext) => ReactNode;
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
    //
    // A fleet is not a plan and never will be: availability is per-unit and
    // continuous, and the thing booked is one physical object. So a rental
    // business runs on the fleet's own screens — the admin's car page, one
    // section per tab — while remaining an ordinary `providers` row with the
    // same Overview, Promote, Money and Team as every other business. It used
    // to be ONE "Vehicles" tab holding that page whole, its own five tabs
    // nested under the workspace's eight, beside a Schedule and a Calendars
    // that cars never use.
    overviewTop: ({ providerId }) => <CarRentals embedded providerId={providerId} section="schedule" />,
    coreTabs: ({ providerId, isOwner }) => [
      { value: "fleet-bookings", label: "Bookings", icon: ClipboardList, render: () => <CarRentals embedded providerId={providerId} section="bookings" /> },
      { value: "fleet", label: "Vehicles", icon: CarFront, render: () => <CarRentals embedded providerId={providerId} section="fleet" /> },
      { value: "offerings", label: "Insurance & extras", icon: ShieldCheck, render: () => <RentalTermsTab providerId={providerId} canManage={isOwner} /> },
    ] as PortalTab<unknown>[],
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
