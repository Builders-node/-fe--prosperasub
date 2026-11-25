import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import { useServiceArchetypes, type ServiceArchetype } from "@/hooks/useServiceArchetypes";
import { publicListingHref } from "@/lib/services/providerBridge";
import { resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";
import { periodNoun } from "@/lib/services/planPeriod";

/**
 * Everything the home carousel needs to say about one category.
 *
 * A category tile that only names the thing ("Car Wash") makes someone tap to
 * find out the two facts they actually came for: is anybody offering it, and
 * what does it start at. Both are cheap to answer here and turn the banner
 * from decoration into a shortcut.
 *
 * Prices are the LOWEST live offer in that category, which is why the label
 * says "from". Each service quotes its own natural unit — a cleaning plan per
 * month, meals per week, a car per day — because normalising them to one
 * period would invent numbers nobody charges.
 */

export interface CategoryHighlight {
  key: string;
  label: string;
  archetype: ServiceArchetype | null;
  /** Where the tile goes: the listing, already narrowed to this category. */
  href: string;
  imageUrl: string | null;
  /** An admin chose this picture, as opposed to one borrowed from a provider. */
  imageIsChosen: boolean;
  /** Cheapest live offer, in cents. Null when the category has nothing to sell yet. */
  fromCents: number | null;
  /** "/ month", "/ week", "/ day" — whatever this service actually charges by. */
  unit: string | null;
  /** When the category was added — a recent one wears a "New" badge. */
  createdAt: string | null;
  /** The live businesses in this category (universal provider ids), for matching discounts. */
  providerIds: string[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function useCategoryHighlights() {
  const { categories, isLoading: categoriesLoading } = useServiceCategories(true);
  const { archetypes, isLoading: archetypesLoading } = useServiceArchetypes(true);

  const { data: facts, isLoading: factsLoading } = useQuery({
    queryKey: ["category-highlights-facts"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{
      prices: Record<string, { cents: number; unit: string }>;
      photos: Record<string, string>;
      providers: Record<string, string[]>;
    }> => {
      // ONE round of requests, all at once. This used to be three in a row —
      // providers first, then the offers and photos filtered by their ids,
      // then the dishes of the menus found — and each round is a full trip to
      // Supabase, so the category strip (and the home page under it) waited
      // for the slowest of three. Nothing here needs another query's answer to
      // be asked: the rows are matched to categories below, in memory.
      const [providersRes, cleaning, food, beach, universal, menus, meals] = await Promise.all([
        // Providers carry the category; the offers hang off providers, half of
        // them by the universal id and half by the legacy one (see
        // lib/services/providerBridge). Their photos ride along.
        supabaseDb.from("providers")
          .select("id, category_key, source_provider_id, gallery_urls, banner_url")
          .eq("status", "active"),
        supabaseDb.from("cleaning_packages")
          .select("owner_provider_id, pricing_mode, monthly_price_cents, price_per_cleaning_cents, cleanings_per_month, frequency_count, frequency_unit")
          // The listing's three-flag rule (see CleaningPackages): a private or
          // switched-off package is not what the shop sells, so it must not set
          // the "from" price either — it made the banner say $80 over a $89 list.
          .eq("status", "active").eq("is_active", true).eq("visibility", "public").is("deleted_at", null),
        supabaseDb.from("food_meal_plans")
          .select("provider_id, weekly_price_cents").eq("status", "active"),
        supabaseDb.from("beach_club_plans")
          .select("owner_provider_id, price_per_person_cents").eq("is_active", true),
        supabaseDb.from("provider_plans")
          // Unlisted plans do not set a category's "from" price — quoting a
          // number nobody can find is worse than quoting none.
          .select("provider_id, price_cents, period")
          .eq("status", "active").eq("visibility", "public"),

        // ── Photos ──
        // The banner is photo-first, so every category needs one real picture.
        // Menus are where the platform's actual food photography lives today;
        // provider media is the fallback for the rest.
        supabaseDb.from("food_weekly_menus").select("id, provider_id"),
        supabaseDb.from("food_menu_meals")
          .select("menu_id, image_url")
          .not("image_url", "is", null)
          .limit(1000),
      ]);
      const providerRows = providersRes.data;

      const byUniversal = new Map<string, string>();
      const byLegacy = new Map<string, string>();
      (providerRows ?? []).forEach((p: any) => {
        if (!p.category_key) return;
        byUniversal.set(String(p.id), p.category_key);
        if (p.source_provider_id) byLegacy.set(String(p.source_provider_id), p.category_key);
      });

      const out: Record<string, { cents: number; unit: string }> = {};
      const offer = (categoryKey: string | undefined, cents: number | null, unit: string) => {
        if (!categoryKey || cents === null) return;
        const current = out[categoryKey];
        if (!current || cents < current.cents) out[categoryKey] = { cents, unit };
      };

      (cleaning.data ?? []).forEach((p: any) =>
        offer(byUniversal.get(String(p.owner_provider_id)), num(resolveMonthlyPriceCents(p)), "/ month"));

      (food.data ?? []).forEach((p: any) =>
        offer(byLegacy.get(String(p.provider_id)), num(p.weekly_price_cents), "/ week"));

      (beach.data ?? []).forEach((p: any) =>
        offer(byUniversal.get(String(p.owner_provider_id)), num(p.price_per_person_cents), "/ person · month"));

      (universal.data ?? []).forEach((p: any) => {
        const noun = periodNoun(p.period);
        offer(byUniversal.get(String(p.provider_id)), num(p.price_cents), noun ? `/ ${noun}` : "");
      });

      // ── Photos, best source first ──────────────────────────────────────
      const photos: Record<string, string> = {};
      const photo = (categoryKey: string | undefined, url: unknown) => {
        const value = typeof url === "string" ? url.trim() : "";
        if (!categoryKey || !value || photos[categoryKey]) return;
        photos[categoryKey] = value;
      };

      // Food: a dish from this restaurant's own menus.
      const menuProvider = new Map<string, string>();
      ((menus as any).data ?? []).forEach((m: any) => menuProvider.set(String(m.id), String(m.provider_id)));
      ((meals as any).data ?? []).forEach((meal: any) =>
        photo(byLegacy.get(menuProvider.get(String(meal.menu_id)) ?? ""), meal.image_url));

      // Everything else: whatever the business itself uploaded. The avatar is
      // deliberately NOT a candidate — it is a logo, and a logo blown up to a
      // 140px banner is what made some slides look randomly illustrated. A
      // category with no real photo gets the designed imageless card instead.
      (providerRows ?? []).forEach((p: any) => {
        const cat = byUniversal.get(String(p.id));
        const gallery = Array.isArray(p.gallery_urls) ? p.gallery_urls : [];
        photo(cat, p.banner_url);
        photo(cat, gallery[0]);
      });

      const providers: Record<string, string[]> = {};
      byUniversal.forEach((cat, id) => { (providers[cat] ??= []).push(id); });

      return { prices: out, photos, providers };
    },
  });

  const highlights: CategoryHighlight[] = (categories ?? [])
    .map((c: any) => {
      const archetype = archetypes.find((a) => a.key === c.archetype_key) ?? null;
      const listing = publicListingHref(archetype?.source_service_key, c.archetype_key);
      const price = facts?.prices?.[c.key] ?? null;
      return {
        key: c.key,
        label: c.label,
        archetype,
        // The category is carried in the URL so the listing opens on it —
        // see useCategoryParam. Without it this is just a link to "cleaning".
        href: listing ? `${listing}?category=${encodeURIComponent(c.key)}` : "/discovery",
        // An admin's cover photo wins; otherwise borrow a real one from what
        // this category actually sells.
        imageUrl: c.image_url ?? facts?.photos?.[c.key] ?? null,
        imageIsChosen: !!c.image_url,
        fromCents: price?.cents ?? null,
        unit: price?.unit ?? null,
        createdAt: c.created_at ?? null,
        providerIds: facts?.providers?.[c.key] ?? [],
      };
    })
    // A category whose archetype was switched off should not be advertised on
    // the home page while its listing is gone.
    .filter((h) => h.archetype !== null);

  return { highlights, isLoading: categoriesLoading || archetypesLoading || factsLoading };
}
