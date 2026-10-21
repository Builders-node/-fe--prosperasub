import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Admin-only look at a service that is not live yet.
 *
 * `?preview=1` on a listing, provider or plan page drops the "active only"
 * filters — for a signed-in admin, and for nobody else. Customers keep seeing
 * exactly what they saw. Buying is still refused by the checkout, which reads
 * the plan's status itself (lib/checkout/planCheckoutModel.ts).
 */
export function useDraftPreview(): boolean {
  const [params] = useSearchParams();
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin && params.get("preview") === "1";
}
