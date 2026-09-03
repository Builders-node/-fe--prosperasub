/**
 * What the rest of the app may use from the beach feature.
 *
 * Only the membership dialog: the provider workspace's Bookings tab opens it
 * to sell a membership on the spot. Everything else here is pages, which the
 * router lazy-imports directly so each screen keeps its own chunk.
 */
export { NewBeachMembershipDialog } from "./components/NewBeachMembershipDialog";
