import { useQuery } from "@tanstack/react-query";
import { accountApi } from "@/integrations/supabase/client";
import { carProviderPath } from "@/features/vehicles";
import { planHref, providerHref } from "@/lib/services/serviceUrls";

/**
 * Paid placements on the storefront (Edge routes/promotions.ts).
 *
 * The server decides what is shown and which order a placement brought — the
 * browser only reports what was seen and tapped, with a per-browser session id
 * so a click made before signing in still counts once the visitor signs in.
 */

export type PromoPlacement = "home" | "service";

export interface ActivePromotion {
  id: string;
  kind: "boost" | "featured";
  provider: {
    id: string; name: string; description: string | null;
    avatarUrl: string | null; bannerUrl: string | null;
    archetypeKey: string | null; unit: string | null;
    sourceServiceKey: string | null; sourceProviderId: string | null;
  };
  plan: { id: string; name: string; priceCents: number; period: string | null; sourcePlanId: string | null } | null;
}

export function useActivePromotions(placement: PromoPlacement, archetypeKey?: string | null) {
  return useQuery({
    queryKey: ["promotions-active", placement, archetypeKey ?? null],
    enabled: placement === "home" || !!archetypeKey,
    staleTime: 60_000,
    queryFn: async () => {
      const qs = new URLSearchParams({ placement, ...(archetypeKey ? { archetype: archetypeKey } : {}) });
      const { data, error } = await accountApi(`/promotions/active?${qs}`);
      // A rail is an extra: on any failure it simply isn't there.
      if (error) return [] as ActivePromotion[];
      return (Array.isArray(data) ? data : []) as ActivePromotion[];
    },
  });
}

/** Where a placement leads: the offer when one is named, else the business. */
export function promotionHref(p: ActivePromotion): string {
  const prov = p.provider;
  if (prov.unit === "vehicles" || prov.archetypeKey === "vehicles") return carProviderPath(prov.id);
  const key = prov.archetypeKey ?? prov.sourceServiceKey ?? "";
  if (p.plan) {
    // Food keeps its own plan page, keyed by the legacy ids.
    if (prov.sourceServiceKey === "food" && prov.sourceProviderId && p.plan.sourcePlanId) {
      return `/services/food/${prov.sourceProviderId}/plans/${p.plan.sourcePlanId}`;
    }
    return planHref(key, p.plan.sourcePlanId ?? p.plan.id);
  }
  return providerHref(key, prov.id);
}

const SESSION_KEY = "everysub_promo_session";
function sessionId(): string | null {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

const reported = new Set<string>();
/** Fire-and-forget. Impressions once per page load per placement. */
export function trackPromotion(promotionId: string, kind: "impression" | "click") {
  const key = `${kind}:${promotionId}`;
  if (kind === "impression" && reported.has(key)) return;
  reported.add(key);
  void accountApi("/promotions/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promotionId, kind, sessionId: sessionId() }),
    keepalive: true,
  }).catch(() => undefined);
}
