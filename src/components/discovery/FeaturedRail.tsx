import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { formatUSD } from "@/lib/pricing";
import { periodNoun } from "@/lib/services/planPeriod";
import { promotionHref, trackPromotion, useActivePromotions, type ActivePromotion, type PromoPlacement } from "@/lib/promotions";
import { cn } from "@/lib/utils";

/**
 * "Featured" — the paid placements (Edge routes/promotions.ts).
 *
 * Every card says "Ad": a customer is owed knowing which places were bought
 * (and the Terms say so). Renders nothing when nothing is promoted, so a
 * quiet week leaves the page exactly as it was.
 */
export function FeaturedRail({ placement, archetypeKey, className }: {
  placement: PromoPlacement;
  archetypeKey?: string | null;
  className?: string;
}) {
  const { data: promos = [] } = useActivePromotions(placement, archetypeKey);
  if (promos.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)} aria-label="Featured">
      <h2 className="text-heading font-semibold text-foreground">Featured</h2>
      {promos.length === 1 ? (
        <PromoCard p={promos[0]} wide />
      ) : (
        <div className="-mx-space-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-space-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
          {promos.map((p) => <PromoCard key={p.id} p={p} />)}
        </div>
      )}
    </section>
  );
}

function PromoCard({ p, wide = false }: { p: ActivePromotion; wide?: boolean }) {
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

  const per = p.plan ? periodNoun(p.plan.period) : "";
  const line = p.plan
    ? `${p.plan.name} · ${formatUSD(p.plan.priceCents)}${per ? ` / ${per}` : ""}`
    : p.provider.description;

  return (
    <Link
      ref={ref}
      to={promotionHref(p)}
      onClick={() => trackPromotion(p.id, "click")}
      className={cn(
        "block shrink-0 snap-start overflow-hidden rounded-radius-md bg-card transition-colors hover:bg-muted/40 active:scale-[0.99]",
        wide ? "w-full" : "w-[264px] md:w-auto",
      )}
    >
      <div className="relative h-28 bg-muted">
        <Photo src={p.provider.bannerUrl} icon={Store} alt="" />
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-meta font-semibold text-white backdrop-blur">
          Ad
        </span>
      </div>
      <div className="flex items-center gap-3 p-3">
        <span aria-hidden className="h-9 w-9 shrink-0 overflow-hidden rounded-full">
          <Photo src={p.provider.avatarUrl} label={initialsOf(p.provider.name)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-title font-semibold text-foreground">{p.provider.name}</span>
          {line && <span className="block truncate text-meta text-muted-foreground">{line}</span>}
        </span>
      </div>
    </Link>
  );
}
