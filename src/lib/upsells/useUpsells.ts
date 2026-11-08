import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { supabaseDb } from "@/integrations/supabase/client";
import { planHref } from "@/lib/services/serviceUrls";

/**
 * What to suggest next — the one rule, for the cart and the bottom of a product.
 *
 *  1. Only what can be bought: a top-level plan (a variant is part of its
 *     offer), public, on sale, priced, from a business that is open.
 *  2. Never what the customer is already getting: this product, anything in
 *     the cart, anything they hold a running subscription to. A plan and its
 *     variants count as one thing, under either id it is known by.
 *  3. Another service first — someone buying meals has no cleaner yet, and
 *     that is what a suggestion is for. Then what actually sells.
 *
 * `quickAdd` means it can go in the cart with one tap. An offer (the customer
 * picks a variant) or a meal plan (they pick the meals) cannot be bought
 * without a choice, so those open their page instead of guessing it.
 *
 * Paid placements are deliberately not mixed in: those are sold with their own
 * impression and click counts, on their own rails.
 */

export interface Upsell {
  /** The id a cart line and a link carry — the legacy id where there is one. */
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  archetype: string;
  priceCents: number;
  period: string | null;
  /** The price is the cheapest of several variants. */
  from: boolean;
  photo: string | null;
  href: string;
  quickAdd: boolean;
}

const first = (v: unknown): string | null =>
  Array.isArray(v) && typeof v[0] === "string" && v[0] ? v[0] : null;

export function useUpsells({ exclude = [], excludeProviderId, limit = 3 }: {
  /** The product on screen, under whichever id the page has. */
  exclude?: Array<string | null | undefined>;
  /** Its business, where "More from" already lists the rest of it. */
  excludeProviderId?: string | null;
  limit?: number;
} = {}): Upsell[] {
  const { items } = useCart();
  const { isAuthenticated } = useAuth();
  const userUuid = useUserUuid();

  const { data: catalog } = useQuery({
    queryKey: ["upsell-catalog"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id, source_plan_id, parent_plan_id, name, price_cents, period, visibility, gallery_urls, source_service_key, provider_id, providers(id, name, archetype_key, status, gallery_urls, avatar_url)")
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // What sells. If this cannot be read the order just falls back to the
  // catalogue's — a suggestion is an extra and must never break a page.
  const { data: sales } = useQuery({
    queryKey: ["upsell-sales"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("subscriptions_unified").select("plan_id").eq("paid", true).limit(1000);
      if (error) return new Map<string, number>();
      const m = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ plan_id: string | null }>) {
        if (r.plan_id) m.set(String(r.plan_id), (m.get(String(r.plan_id)) ?? 0) + 1);
      }
      return m;
    },
  });

  const { data: running } = useQuery({
    queryKey: ["upsell-running", userUuid],
    enabled: isAuthenticated && !!userUuid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("subscriptions_unified")
        .select("plan_id").eq("user_id", userUuid!).eq("status", "active");
      if (error) return [] as string[];
      return (data ?? []).map((r: { plan_id: string | null }) => String(r.plan_id));
    },
  });

  const excludeKey = exclude.filter(Boolean).join(",");
  const cartKey = items.map((i) => i.planId).join(",");

  return useMemo(() => {
    if (!catalog) return [];

    // Any id → the top-level plan it belongs to.
    const topOf = new Map<string, string>();
    for (const p of catalog) {
      const top = String(p.parent_plan_id ?? p.id);
      topOf.set(String(p.id), top);
      if (p.source_plan_id) topOf.set(String(p.source_plan_id), top);
    }
    const family = (id: string | null | undefined) => (id ? topOf.get(String(id)) ?? String(id) : "");

    const taken = new Set<string>([
      ...exclude.map(family),
      ...items.map((i) => family(i.planId)),
      ...(running ?? []).map(family),
    ]);

    // The archetypes the customer is already buying from rank below the rest.
    const byTop = new Map(catalog.map((p) => [String(p.id), p]));
    const servicesHere = new Set(
      [...taken].map((id) => byTop.get(id)?.providers?.archetype_key).filter(Boolean),
    );

    const variantCount = new Map<string, number>();
    const sold = new Map<string, number>();
    for (const p of catalog) {
      const top = String(p.parent_plan_id ?? p.id);
      if (p.parent_plan_id) variantCount.set(top, (variantCount.get(top) ?? 0) + 1);
      const n = (sales?.get(String(p.id)) ?? 0) + (p.source_plan_id ? sales?.get(String(p.source_plan_id)) ?? 0 : 0);
      sold.set(top, (sold.get(top) ?? 0) + n);
    }

    return catalog
      .filter((p) => !p.parent_plan_id
        && p.visibility === "public"
        && Number(p.price_cents) > 0
        && ["active", "approved"].includes(String(p.providers?.status ?? ""))
        && !!p.providers?.archetype_key
        && !taken.has(String(p.id))
        && String(p.provider_id) !== String(excludeProviderId ?? ""))
      .sort((a, b) => {
        const crossA = servicesHere.has(a.providers.archetype_key) ? 1 : 0;
        const crossB = servicesHere.has(b.providers.archetype_key) ? 1 : 0;
        return crossA - crossB || (sold.get(String(b.id)) ?? 0) - (sold.get(String(a.id)) ?? 0);
      })
      .slice(0, limit)
      .map((p): Upsell => {
        const variants = variantCount.get(String(p.id)) ?? 0;
        const id = String(p.source_plan_id ?? p.id);
        return {
          id,
          name: p.name,
          providerId: String(p.provider_id),
          providerName: p.providers.name ?? "",
          archetype: p.providers.archetype_key,
          priceCents: Number(p.price_cents),
          period: p.period ?? null,
          from: variants > 0,
          photo: first(p.gallery_urls) ?? first(p.providers.gallery_urls) ?? p.providers.avatar_url ?? null,
          href: planHref(p.providers.archetype_key, id),
          quickAdd: variants === 0 && p.source_service_key !== "food",
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, sales, running, excludeKey, cartKey, excludeProviderId, limit]);
}
