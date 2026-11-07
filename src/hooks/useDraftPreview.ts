import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * A look at a business that is not live yet.
 *
 * `?preview=1` on a listing, provider or plan page drops the "active only"
 * filters — for a signed-in admin, and for anyone who runs a business (owner
 * or team). It used to be admin-only, so the owner pressing "View public" on
 * their own draft saw an empty page and could not check it before launch.
 *
 * This is presentation, not a gate: the rows were never secret, and buying is
 * still refused by the checkout, which reads the plan's status itself
 * (lib/checkout/planCheckoutModel.ts).
 */
export function useDraftPreview(): boolean {
  const [params] = useSearchParams();
  const { isSuperAdmin, userData } = useAuth();
  const asked = params.get("preview") === "1";
  const uid = userData?.id ? String(userData.id) : null;

  const { data: runsBusiness = false } = useQuery({
    queryKey: ["draft-preview-runs-business", uid],
    enabled: asked && !isSuperAdmin && !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [owned, member] = await Promise.all([
        supabaseDb.from("providers").select("id", { count: "exact", head: true }).eq("admin_user_id", uid!),
        supabaseDb.from("provider_members").select("id", { count: "exact", head: true }).eq("user_id", uid!),
      ]);
      return (owned.count ?? 0) + (member.count ?? 0) > 0;
    },
  });

  return asked && (isSuperAdmin || runsBusiness);
}
