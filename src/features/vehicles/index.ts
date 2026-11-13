/**
 * What the rest of the app may use from the car feature.
 *
 * Everything inside `features/vehicles/` is private to it; this file is the
 * door. The point is not ceremony — it is that when the next vertical moves
 * in here, "what does the outside actually depend on?" has a one-file answer
 * instead of a grep.
 *
 * The pages are deliberately NOT re-exported. `App.tsx` lazy-imports
 * `pages/VehiclesApp` directly, because importing a page through a barrel
 * pulls the whole feature into one chunk and undoes the code splitting that
 * keeps the car storefront out of a marketplace visitor's download.
 */

export { VEHICLES_BASE, carPath, carProviderPath, trimPath } from "./lib/routes";

/** Car-shaped screens that other surfaces host: the admin, the workspace. */
export { VehicleEditDialog } from "./components/VehicleEditDialog";
export { RentalTermsTab } from "./components/RentalTermsTab";
/** The car as a listing row — a PlanCard, so a provider page can shelve its
 *  fleet exactly where another business shelves its plans. */
export { VehicleCard } from "./components/VehicleCard";
export { useVehicleTypes, VEHICLE_TYPES_KEY, type VehicleType } from "./hooks/useVehicleTypes";
export { VehicleTypesPanel } from "./components/VehicleTypesPanel";
export { useVehicles } from "./hooks/useVehicles";
/** Running the fleet — the admin's and the rental company's screens. */
export { useFleet, FLEET_KEY } from "./admin/fleetData";
export { FleetOverview } from "./admin/FleetOverview";
export { FleetCalendar } from "./admin/FleetCalendar";
export { RentalBookingSheet } from "./admin/RentalBookingSheet";
export { NewRentalDialog, type NewRentalSeed } from "./admin/NewRentalDialog";
/** Every write to the fleet and its terms goes through the API. */
export { fleetWrite } from "./lib/fleetWrite";

export type {
  RentalVehicle, RentalBooking, VehicleStatus, Transmission, FuelType,
  InsuranceTier, RentalExtra, DeliveryZone,
} from "./types/carRental";
