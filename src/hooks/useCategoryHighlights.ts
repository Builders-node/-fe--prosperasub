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
  /** Cheapest live offer, in cents. Null when the category has nothing to sell yet. */
  fromCents: number | null;
  /** "/ month", "/ week", "/ day" — whatever this service actually charges by. */
  unit: string | null;
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
    }> => {
      // Providers carry the category; the offers hang off providers, half of
      // them by the universal id and half by the legacy one (see
      // lib/services/providerBridge). Build both lookups once.
      const { data: providerRows } = await supabaseDb
        .from("providers")
        .select("id, category_key, source_provider_id")
        .eq("status", "active");

      const byUniversal = new Map<string, string>();
      const byLegacy = new Map<string, string>();
      (providerRows ?? []).forEach((p: any) => {
        if (!p.category_key) return;
        byUniversal.set(String(p.id), p.category_key);
        if (p.source_provider_id) byLegacy.set(String(p.source_provider_id), p.category_key);
      });

      const providerIds = [...byUniversal.keys()];
      const legacyIds = [...byLegacy.keys()];

      const [cleaning, food, vehicles, beach, universal, menus, vehicleImages, media] = await Promise.all([
        supabaseDb.from("cleaning_packages")
          .select("owner_provider_id, pricing_mode, monthly_price_cents, price_per_cleaning_cents, cleanings_per_month, frequency_count, frequency_unit")
          .eq("status", "active").is("deleted_at", null),
        supabaseDb.from("food_meal_plans")
          .select("provider_id, weekly_price_cents").eq("status", "active"),
        // Vehicles say "public", not "active" — the same value the car
        // listing filters on. Asking for "active" here quietly returned
        // nothing and every car read "Coming soon" next to a full fleet.
        supabaseDb.from("rental_vehicles")
          .select("id, provider_id, owner_provider_id, daily_price_cents").eq("status", "public"),
        supabaseDb.from("beach_club_plans")
          .select("owner_provider_id, price_per_person_cents").eq("is_active", true),
        supabaseDb.from("provider_plans")
          .select("provider_id, price_cents, period").eq("status", "active"),

        // ── Photos ──
        // The banner is photo-first, so every category needs one real picture.
        // Menus and vehicle galleries are where the platform's actual
        // photography lives today; provider media is the fallback for the rest.
        legacyIds.length
          ? supabaseDb.from("food_weekly_menus").select("id, provider_id").in("provider_id", legacyIds)
          : Promise.resolve({ data: [] } as any),
        supabaseDb.from("rental_vehicle_images").select("vehicle_id, url").order("sort_order", { ascending: true }),
        providerIds.length
          ? supabaseDb.from("providers").select("id, gallery_urls, banner_url, avatar_url").in("id", providerIds)
          : Promise.resolve({ data: [] } as any),
      ]);

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

      (vehicles.data ?? []).forEach((v: any) =>
        offer(byUniversal.get(String(v.owner_provider_id)) ?? byLegacy.get(String(v.provider_id)),
              num(v.daily_price_cents), "/ day"));

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
      if (menuProvider.size) {
        const { data: meals } = await supabaseDb
          .from("food_menu_meals")
          .select("menu_id, image_url")
          .in("menu_id", [...menuProvider.keys()])
          .not("image_url", "is", null);
        (meals ?? []).forEach((meal: any) =>
          photo(byLegacy.get(menuProvider.get(String(meal.menu_id)) ?? ""), meal.image_url));
      }

      // Rental: the first photo of one of this fleet's cars.
      const vehicleCategory = new Map<string, string>();
      ((vehicles as any).data ?? []).forEach((v: any) => {
        const cat = byUniversal.get(String(v.owner_provider_id)) ?? byLegacy.get(String(v.provider_id));
        if (cat) vehicleCategory.set(String(v.id), cat);
      });
      ((vehicleImages as any).data ?? []).forEach((img: any) =>
        photo(vehicleCategory.get(String(img.vehicle_id)), img.url));

      // Everything else: whatever the business itself uploaded.
      ((media as any).data ?? []).forEach((p: any) => {
        const cat = byUniversal.get(String(p.id));
        const gallery = Array.isArray(p.gallery_urls) ? p.gallery_urls : [];
        photo(cat, p.banner_url);
        photo(cat, gallery[0]);
        photo(cat, p.avatar_url);
      });

      return { prices: out, photos };
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
        fromCents: price?.cents ?? null,
        unit: price?.unit ?? null,
      };
    })
    // A category whose archetype was switched off should not be advertised on
    // the home page while its listing is gone.
    .filter((h) => h.archetype !== null);

  return { highlights, isLoading: categoriesLoading || archetypesLoading || factsLoading };
}
