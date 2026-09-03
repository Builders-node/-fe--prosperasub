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

export { VEHICLES_BASE, carPath, trimPath } from "./lib/routes";

/** Car-shaped screens that other surfaces host: the admin, the workspace. */
export { VehicleEditDialog } from "./components/VehicleEditDialog";
export { RentalTermsTab } from "./components/RentalTermsTab";
/** The car as a listing row — a PlanCard, so a provider page can shelve its
 *  fleet exactly where another business shelves its plans. */
export { VehicleCard } from "./components/VehicleCard";
export { useVehicles } from "./hooks/useVehicles";

export type {
  RentalVehicle, RentalBooking, VehicleStatus, Transmission, FuelType,
  InsuranceTier, RentalExtra, DeliveryZone,
} from "./types/carRental";
