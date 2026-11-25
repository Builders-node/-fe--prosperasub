import { useEffect, useMemo, useRef } from "react";
import { useDisplayDiscount } from "@/lib/discounts";
import { useAddresses } from "@/lib/services/useAddresses";
import { promotionHref, trackPromotion, useActivePromotions, type ActivePromotion, type PromoPlacement } from "@/lib/promotions";
import { cn } from "@/lib/utils";
import { planHref, planSegment, wordsAddress } from "@/lib/services/serviceUrls";
import { FavoriteButton } from "@/components/patterns/FavoriteButton";
import {
  OfferCard, PriceLine, RAIL_TILE, Rail, ShelfHeader, planIndex, planPhotos, useHomePlans, type HomePlan,
} from "@/components/discovery/homePlans";

/**
 * "Featured" — the paid placements (Edge routes/promotions.ts).
 *
 * Every card says "Sponsored": a customer is owed knowing which places were
 * bought (and the Terms say so). Renders nothing when nothing is promoted, so
 * a quiet week leaves the page exactly as it was.
 */
export function FeaturedRail({ placement, archetypeKey, className }: {
  placement: PromoPlacement;
  archetypeKey?: string | null;
  className?: string;
}) {
  const { data: promos = [] } = useActivePromotions(placement, archetypeKey);
  const { data: plans = [] } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);
  const addr = useAddresses({ providerIds: promos.map((p) => p.provider.id), planIds: promos.map((p) => p.plan?.id) });
  if (promos.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)} aria-label="Featured">
      <ShelfHeader title="Featured" />
      {/* The same cards as every other shelf — a featured plan is a plan, it
          just paid to stand first — told apart only by the badge. */}
      <Rail>
        {promos.map((p) => {
          const plan = p.plan ? index.get(p.plan.id) ?? (p.plan.sourcePlanId ? index.get(p.plan.sourcePlanId) : undefined) ?? null : null;
          // The home page already holds this plan's row, words and all: link
          // by it from the first paint. Waiting for the address lookup left
          // the id in the link on a first visit, and the page then swapped it.
          const vehicles = p.provider.unit === "vehicles" || p.provider.archetypeKey === "vehicles";
          const href = plan && !vehicles && wordsAddress(plan) ? planHref(null, planSegment(plan)) : promotionHref(p, addr);
          return <PromoCard key={p.id} p={p} href={href} plan={plan} />;
        })}
      </Rail>
    </section>
  );
}

function PromoCard({ p, plan, href }: { p: ActivePromotion; plan: HomePlan | null; href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);

  // Counted as seen when half of it is on screen — not merely rendered.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { trackPromotion(p.id, "impression"); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [p.id]);

  const photos = plan ? planPhotos(plan) : [p.provider.bannerUrl].filter((u): u is string => !!u);
  const deal = useDisplayDiscount({ providerId: p.provider.id, id: plan?.id ?? p.plan?.id, priceCents: p.plan?.priceCents });
  return (
    <OfferCard
      ref={ref}
      href={href}
      onClick={() => trackPromotion(p.id, "click")}
      // The shelf is called Featured; the card says what that means. Two
      // "Featured" on one card and its heading said the word twice.
      badge="Sponsored"
      corner={p.plan ? <FavoriteButton kind="plan" id={p.plan.id} name={p.plan.name} variant="overlay" /> : undefined}
      photos={photos}
      deal={p.plan ? deal : null}
      title={p.plan?.name ?? p.provider.name}
      subtitle={p.plan ? p.provider.name : p.provider.description}
      footer={p.plan
        ? <PriceLine cents={p.plan.priceCents} period={p.plan.period} perPerson={plan?.pricing_mode === "per_person"} deal={deal} />
        : null}
      className={RAIL_TILE}
    />
  );
}
