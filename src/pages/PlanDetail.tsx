import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { QueryError } from "@/components/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { RatingLine } from "@/components/patterns/PlanCard";
import { PlanOptionPicker } from "@/components/plans/PlanOptionPicker";
import { ProviderReviewsBlock, type ProviderReviewService } from "@/components/reviews/ProviderReviewsBlock";
import { useProviderRatings } from "@/hooks/useProviderRatings";
import { findVariant, selectionFor, usePlanOffers, type PlanOffer } from "@/hooks/usePlanOffers";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseDb } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/cart/checkoutRows";
import { resolveMonthlyPriceCents, formatFrequencyLabel } from "@/lib/cleaningPlanPricing";
import { formatUSD } from "@/lib/pricing";
import { SearchX } from "lucide-react";

/**
 * The plan, before the till.
 *
 * Cleaning, the beach club and every universal plan used to go from a card in
 * the listing straight into checkout: the first screen after "this looks
 * interesting" asked for a payment method. Food and rental always had a page
 * in between — what you get, what it costs, what the options are — and this is
 * that page for the other three.
 *
 * One route serves all of them (`/services/:archetypeKey/plans/:planId`)
 * because the id tells us the table: a universal plan is a `provider_plans`
 * row, a beach plan a `beach_club_plans` row, a cleaning plan a
 * `cleaning_packages` row whose id is text rather than a uuid.
 */

interface ResolvedPlan {
  /** Which table the row came from — decides where Subscribe goes. */
  source: "cleaning" | "beach" | "universal";
  id: string;
  title: string;
  description: string | null;
  features: string[];
  priceCents: number | null;
  priceUnit: string;
  providerId: string | null;
  /** A line the service wants under the title — cleaning's frequency. */
  meta: string | null;
}

const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];

const periodUnit = (period: string | null | undefined) =>
  period === "weekly" ? "/ week" : period === "yearly" ? "/ year" : "/ month";

const PlanDetail = () => {
  const { archetypeKey = "", planId = "" } = useParams<{ archetypeKey: string; planId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  const planQ = useQuery({
    queryKey: ["plan-detail", archetypeKey, planId],
    enabled: !!planId,
    queryFn: async (): Promise<ResolvedPlan | null> => {
      // A cleaning package id is text, so it must never be handed to a uuid
      // column — PostgREST answers that with a 400, not an empty result.
      if (isUuid(planId)) {
        const { data: universal, error } = await supabaseDb
          .from("provider_plans")
          .select("id, provider_id, name, description, price_cents, period, features")
          .eq("id", planId)
          .maybeSingle();
        if (error) throw error;
        if (universal) {
          return {
            source: "universal",
            id: String(universal.id),
            title: universal.name,
            description: universal.description ?? null,
            features: asStringList(universal.features),
            priceCents: universal.price_cents ?? null,
            priceUnit: periodUnit(universal.period),
            providerId: universal.provider_id ? String(universal.provider_id) : null,
            meta: null,
          };
        }

        const { data: beach, error: beachError } = await supabaseDb
          .from("beach_club_plans")
          .select("id, name, tagline, price_per_person_cents, amenities, owner_provider_id")
          .eq("id", planId)
          .maybeSingle();
        if (beachError) throw beachError;
        if (beach) {
          return {
            source: "beach",
            id: String(beach.id),
            title: beach.name,
            description: beach.tagline ?? null,
            features: asStringList(beach.amenities),
            priceCents: beach.price_per_person_cents ?? null,
            priceUnit: "/ person · month",
            providerId: beach.owner_provider_id ? String(beach.owner_provider_id) : null,
            meta: null,
          };
        }
      }

      const { data: cleaning, error: cleaningError } = await supabaseDb
        .from("cleaning_packages")
        .select("id, name, description, short_description, features, monthly_price_cents, price_per_cleaning_cents, cleanings_per_month, frequency_unit, frequency_count, custom_frequency_label, owner_provider_id")
        .eq("id", planId)
        .maybeSingle();
      if (cleaningError) throw cleaningError;
      if (cleaning) {
        return {
          source: "cleaning",
          id: String(cleaning.id),
          title: cleaning.name,
          description: cleaning.description ?? cleaning.short_description ?? null,
          features: asStringList(cleaning.features),
          priceCents: resolveMonthlyPriceCents(cleaning as any) ?? null,
          priceUnit: "/ month",
          providerId: cleaning.owner_provider_id ? String(cleaning.owner_provider_id) : null,
          // Computed here, off the row itself: the frequency columns do not
          // survive into the normalised shape, and reading them off it gave
          // "0x per month".
          meta: formatFrequencyLabel(cleaning as any),
        };
      }

      return null;
    },
  });

  const plan = planQ.data ?? null;

  const providerQ = useQuery({
    queryKey: ["plan-detail-provider", plan?.providerId],
    enabled: !!plan?.providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, description, avatar_url, gallery_urls")
        .eq("id", plan!.providerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ratings = useProviderRatings(plan?.providerId ? [plan.providerId] : []);
  const rating = plan?.providerId ? ratings[plan.providerId] : null;

  // Options come from the offer this plan belongs to — the same bridge the
  // listing card uses, so the chips here match the "from $x" there.
  // All three sources carry the UNIVERSAL provider id (cleaning_packages and
  // beach_club_plans both key owner_provider_id off `providers`), so nothing
  // needs bridging — passing `legacyService` here looked up legacy ids that do
  // not exist and silently returned no offers, which is why the option chips
  // never appeared.
  const { offers, offerBySourcePlanId } = usePlanOffers(
    plan?.providerId ? [plan.providerId] : [],
  );

  const offer: PlanOffer | null = useMemo(() => {
    if (!plan) return null;
    if (plan.source === "universal") return offers.find((o) => o.id === plan.id) ?? null;
    return offerBySourcePlanId.get(plan.id) ?? null;
  }, [plan, offers, offerBySourcePlanId]);

  const [selection, setSelection] = useState<Record<string, string>>({});

  // Opening a plan that is one combination of an offer should show that
  // combination selected, not an empty picker.
  useEffect(() => {
    if (!offer) { setSelection({}); return; }
    const current = offer.variants.find((v) =>
      (plan?.source === "universal" ? v.id : v.sourcePlanId) === plan?.id);
    setSelection(current ? selectionFor(current) : selectionFor(offer.variants[0] ?? { optionKeys: {} } as never));
  }, [offer, plan]);

  const chosen = offer ? findVariant(offer, selection) : null;

  /** What the customer is actually buying right now. */
  const priceCents = chosen?.priceCents ?? plan?.priceCents ?? null;
  const buyableId = chosen
    ? (plan?.source === "universal" ? chosen.id : chosen.sourcePlanId ?? plan?.id ?? "")
    : plan?.id ?? "";

  const checkoutHref = !plan ? "" :
    plan.source === "cleaning" ? `/services/cleaning/checkout/${buyableId}` :
    plan.source === "beach"    ? `/services/beach-club/checkout/${buyableId}` :
    `/services/${archetypeKey}/checkout/plan/${buyableId}`;

  const subscribe = () => {
    if (!checkoutHref) return;
    if (!isAuthenticated) openAuthModal("login", checkoutHref);
    else navigate(checkoutHref);
  };

  const gallery = useMemo(() => {
    const p: any = providerQ.data;
    if (!p) return [] as string[];
    const list = asStringList(p.gallery_urls);
    return list.length ? list : (p.avatar_url ? [p.avatar_url] : []);
  }, [providerQ.data]);

  if (planQ.isLoading) return <PageLoader />;

  if (planQ.isError) {
    return (
      <Shell title="Plan">
        <QueryError
          title="Couldn't load this plan"
          error={planQ.error instanceof Error ? planQ.error.message : undefined}
          onRetry={() => planQ.refetch()}
          retrying={planQ.isFetching}
        />
      </Shell>
    );
  }

  if (!plan) {
    return (
      <Shell title="Not found">
        <YdEmptyState
          icon={SearchX}
          title="No such plan"
          subtitle="It may have been taken off the platform. Browse what's on offer."
        />
      </Shell>
    );
  }

  const providerName = (providerQ.data as any)?.name as string | undefined;
  // Studio / 1BR / 2BR are one thing sold three ways: the page is the offer,
  // and the size is a chip. Landing on a variant must not rename the page.
  const title = offer?.name ?? plan.title;
  const description = offer?.description ?? plan.description;
  // The reviews block only knows the four legacy services; a universal plan
  // under one of those archetypes still reviews against it.
  const reviewService: ProviderReviewService | null =
    plan.source === "cleaning" ? "cleaning" :
    plan.source === "beach" ? "beach" :
    archetypeKey === "cleaning" ? "cleaning" :
    archetypeKey === "rental" ? "rental" :
    archetypeKey === "food" ? "food" :
    archetypeKey === "beach-club" || archetypeKey === "entertainment" ? "beach" : null;
  const cover = gallery[0];
  // An offer's own price is the cheapest combination; once options are picked
  // the figure below is exact, so "From" only belongs on the unpicked case.
  const showFrom = !!offer && !chosen;

  return (
    <div className="min-h-screen bg-background pb-40 md:pb-12">
      <DesktopHeader />
      <HomeHeader title={title} showBackButton onBack={() => navigate(-1)} bare />

      <main className="market-content space-y-4 py-space-4 md:py-space-8">
        {cover && (
          <div className="overflow-hidden rounded-radius-md bg-card">
            <img src={cover} alt="" className="h-52 w-full object-cover md:h-72" />
          </div>
        )}

        <section className="rounded-radius-md bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">{title}</h1>
              {providerName && (
                <p className="mt-0.5 text-[12px] tracking-[-0.24px] text-muted-foreground">{providerName}</p>
              )}
            </div>
            <RatingLine rating={rating} className="mt-1 shrink-0" />
          </div>

          {description && (
            <p className="mt-3 text-[16px] leading-[1.4] tracking-[-0.32px] text-muted-foreground">
              {description}
            </p>
          )}

          {plan.meta && (
            <p className="mt-2 text-[12px] tracking-[-0.24px] text-muted-foreground">{plan.meta}</p>
          )}
        </section>

        {offer && offer.groups.length > 0 && (
          <section className="rounded-radius-md bg-card p-4">
            <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.32px] text-foreground">Choose your options</h2>
            <PlanOptionPicker offer={offer} selection={selection} onSelect={setSelection} />
            {!chosen && (
              <p className="mt-3 text-[12px] tracking-[-0.24px] text-muted-foreground">
                That combination isn't offered — pick another.
              </p>
            )}
          </section>
        )}

        {plan.features.length > 0 && (
          <section className="rounded-radius-md bg-card p-4">
            <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.32px] text-foreground">What's included</h2>
            <ul className="space-y-2">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[16px] tracking-[-0.32px] text-foreground">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan.providerId && reviewService && (
          <ProviderReviewsBlock providerId={plan.providerId} service={reviewService} />
        )}
      </main>

      {/* The price and the way to buy stay on screen while the page scrolls —
          the one thing a customer is here to decide. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card md:static md:mt-6 md:border-0"
        style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="market-content flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            {typeof priceCents === "number" && priceCents > 0 ? (
              <p className="flex items-end gap-1 whitespace-nowrap">
                {showFrom && <span className="pb-px text-[12px] tracking-[-0.24px] text-muted-foreground">From</span>}
                <span className="text-[20px] font-semibold tabular-nums tracking-[-0.4px] text-foreground">
                  {formatUSD(priceCents)}
                </span>
                <span className="pb-px text-[12px] tracking-[-0.24px] text-muted-foreground">{plan.priceUnit}</span>
              </p>
            ) : (
              <p className="text-[16px] font-semibold text-muted-foreground">Price on request</p>
            )}
          </div>
          <Button className="shrink-0 px-8" onClick={subscribe} disabled={!!offer && !chosen}>
            Subscribe
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

/** The page frame, for the states that have no plan to show. */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <DesktopHeader />
      <HomeHeader title={title} showBackButton onBack={() => navigate(-1)} bare />
      <main className="market-content py-space-8">{children}</main>
      <BottomNav />
    </div>
  );
}

export default PlanDetail;
