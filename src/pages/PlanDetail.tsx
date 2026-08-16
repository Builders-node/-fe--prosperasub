import { describeEntitlement, readEntitlements } from "@/lib/plans/entitlements";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { useQuery } from "@tanstack/react-query";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { PageLoader } from "@/components/ui/spinner";
import { QueryError } from "@/components/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { PlanOptionPicker } from "@/components/plans/PlanOptionPicker";
import { MealSelectionPicker, defaultMealsForCount, type MealKey } from "@/components/food/MealSelectionPicker";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import {
  CheckIcon, KeyboardArrowLeftIcon, KeyboardArrowRightIcon, NotificationsIcon,
} from "@/components/icons/FigmaIcons";
import { ProviderReviewsBlock, type ProviderReviewService } from "@/components/reviews/ProviderReviewsBlock";
import { findVariant, periodUnit, selectionFor, usePlanOffers, type PlanOffer } from "@/hooks/usePlanOffers";
import { ADD_TO_CART, SUBSCRIBE, fromLabel, normalizeUnit, payLabel } from "@/lib/checkout/ctaLabel";
import { useArchetypeLabel } from "@/hooks/useServiceArchetypes";
import { publicListingHref } from "@/lib/services/providerBridge";
import { planHref, providerHref } from "@/lib/services/serviceUrls";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseDb } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/cart/checkoutRows";
import { fetchPlanMirrorExtras } from "@/lib/plans/planGallery";
import { resolveMonthlyPriceCents, formatFrequencyLabel } from "@/lib/cleaningPlanPricing";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { SearchX } from "lucide-react";

/**
 * The plan, before the till.
 *
 * Cleaning, the beach club and every universal plan used to go from a card in
 * the listing straight into checkout: the first screen after "this looks
 * interesting" asked for a payment method. Food always had a page
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
  source: "cleaning" | "beach" | "food" | "universal";
  id: string;
  title: string;
  description: string | null;
  features: string[];
  priceCents: number | null;
  priceUnit: string;
  providerId: string | null;
  /** A line the service wants under the title — cleaning's frequency. */
  meta: string | null;
  /** What the plan grants — from the universal row, or a legacy plan's mirror. */
  entitlements?: unknown;
  /** Food buys through its own screen, which is keyed by the legacy provider. */
  legacyProviderId?: string | null;
  /** The plan's own photographs; the provider's are the fallback. */
  gallery?: string[];
}

/**
 * The mirror's half of a legacy plan. Arriving by the mirror's own id hands
 * both over directly; arriving by the canonical legacy id — which every link
 * now carries — means asking for them.
 */
async function mirrorExtras(
  service: string, subjectId: string, gallery: string[], entitlements: unknown,
): Promise<{ gallery: string[]; entitlements: unknown }> {
  if (gallery.length || (Array.isArray(entitlements) && entitlements.length)) {
    return { gallery, entitlements };
  }
  return fetchPlanMirrorExtras(service, subjectId);
}

const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];


const PlanDetail = () => {
  const { archetypeKey = "", planId = "" } = useParams<{ archetypeKey: string; planId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack("/discovery");
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  const planQ = useQuery({
    queryKey: ["plan-detail", archetypeKey, planId],
    enabled: !!planId,
    queryFn: async (): Promise<ResolvedPlan | null> => {
      // A cleaning package id is text, so it must never be handed to a uuid
      // column — PostgREST answers that with a 400, not an empty result.
      // Which row this page should speak for.
      //
      // A legacy plan exists twice: in its own table, and mirrored into
      // `provider_plans` so cross-service queries can see it. The mirror is
      // thinner — the beach membership's six amenities and its per-person price
      // live only on the original — so which id a link happened to carry
      // decided which of two different pages the customer got for the same
      // product. A mirror now hands over to what it mirrors.
      let subjectId = planId;
      // Photographs live on the mirror for every service. Arriving by the
      // mirror's own id hands them over directly; arriving by the canonical
      // legacy id — which is what every link now carries — means asking for
      // them by `source_plan_id`.
      let mirrorGallery: string[] = [];
      let mirrorEntitlements: unknown = null;

      if (isUuid(planId)) {
        const { data: universal, error } = await supabaseDb
          .from("provider_plans")
          .select("id, provider_id, name, description, price_cents, period, features, gallery_urls, entitlements, source_service_key, source_plan_id")
          .eq("id", planId)
          .maybeSingle();
        if (error) throw error;
        if (universal?.source_service_key && universal.source_plan_id) {
          subjectId = String(universal.source_plan_id);
          // The photographs are the one thing the mirror owns: legacy tables
          // have no image column, so a plan's pictures are saved here for every
          // service. Carry them over rather than losing them in the hand-off.
          mirrorGallery = asStringList(universal.gallery_urls);
          mirrorEntitlements = universal.entitlements;
        } else if (universal) {
          return {
            source: "universal",
            id: String(universal.id),
            title: universal.name,
            description: universal.description ?? null,
            features: asStringList(universal.features),
            gallery: asStringList(universal.gallery_urls),
            entitlements: universal.entitlements,
            priceCents: universal.price_cents ?? null,
            priceUnit: periodUnit(universal.period),
            providerId: universal.provider_id ? String(universal.provider_id) : null,
            meta: null,
          };
        }

        const { data: food, error: foodError } = await supabaseDb
          .from("food_meal_plans")
          .select("id, name, description, weekly_price_cents, meals_per_day, provider_id, highlights")
          .eq("id", subjectId)
          .maybeSingle();
        if (foodError) throw foodError;
        if (food) {
          // provider_id here is food_providers.id. Ratings, reviews and the
          // offer lookup all key off the UNIVERSAL providers row, so bridge.
          const { data: bridged } = await supabaseDb
            .from("providers")
            .select("id")
            .eq("source_service_key", "food")
            .eq("source_provider_id", food.provider_id)
            .maybeSingle();
          return {
            source: "food",
            ...(await mirrorExtras("food", subjectId, mirrorGallery, mirrorEntitlements)),
            id: String(food.id),
            title: food.name,
            description: food.description ?? null,
            // `highlights` is food's "what's included". The column has always
            // existed and this page always sent an empty list, so a restaurant
            // could fill it in and no customer ever saw it.
            features: asStringList((food as any).highlights),
            priceCents: food.weekly_price_cents ?? null,
            priceUnit: "/ week",
            providerId: bridged?.id ? String(bridged.id) : null,
            legacyProviderId: food.provider_id ? String(food.provider_id) : null,
            meta: food.meals_per_day ? `${food.meals_per_day} meal${food.meals_per_day === 1 ? "" : "s"} a day` : null,
          };
        }

        const { data: beach, error: beachError } = await supabaseDb
          .from("beach_club_plans")
          .select("id, name, tagline, price_per_person_cents, amenities, owner_provider_id")
          .eq("id", subjectId)
          .maybeSingle();
        if (beachError) throw beachError;
        if (beach) {
          return {
            source: "beach",
            ...(await mirrorExtras("beach", subjectId, mirrorGallery, mirrorEntitlements)),
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
        .eq("id", subjectId)
        .maybeSingle();
      if (cleaningError) throw cleaningError;
      if (cleaning) {
        return {
          source: "cleaning",
          ...(await mirrorExtras("cleaning", subjectId, mirrorGallery, mirrorEntitlements)),
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
        .select("id, name, description, avatar_url, gallery_urls, category_key, archetype_key")
        .eq("id", plan!.providerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

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


  const { addItem: addToCart } = useCart();

  const [selection, setSelection] = useState<Record<string, string>>({});

  /**
   * Has the hero scrolled past? The sticky bar is transparent over the photo
   * and opaque over the page, because white icons on a white card cannot be
   * seen. 220px is just before the 280px photo clears the 56px bar.
   */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 220);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Opening a plan that is one combination of an offer should show that
  // combination selected, not an empty picker.
  useEffect(() => {
    if (!offer) { setSelection({}); return; }
    const current = offer.variants.find((v) =>
      (plan?.source === "universal" ? v.id : v.sourcePlanId) === plan?.id);
    setSelection(current ? selectionFor(current) : selectionFor(offer.variants[0] ?? { optionKeys: {} } as never));
  }, [offer, plan]);

  const chosen = offer ? findVariant(offer, selection) : null;

  /**
   * Which meals of the day, for food.
   *
   * This used to live on the checkout screen, one scroll below a second copy
   * of everything already on this page. The count comes from the combination
   * the customer just picked — three meals a day means three chips lit.
   */
  const mealsPerDay = plan?.source === "food"
    ? Number(chosen?.optionKeys?.meals_per_day ?? selection.meals_per_day ?? 1) || 1
    : 0;
  const [meals, setMeals] = useState<MealKey[]>([]);
  useEffect(() => {
    if (mealsPerDay > 0) setMeals(defaultMealsForCount(mealsPerDay));
  }, [mealsPerDay]);

  /** What the customer is actually buying right now. */
  const priceCents = chosen?.priceCents ?? plan?.priceCents ?? null;
  /**
   * And on what terms. A variant may be billed differently from its offer —
   * that is the whole point of a billing-period axis — so the unit beside the
   * price has to come from the chosen combination.
   */
  const priceUnit = (chosen?.period && periodUnit(chosen.period)) || plan?.priceUnit || "";
  const buyableId = chosen
    ? (plan?.source === "universal" ? chosen.id : chosen.sourcePlanId ?? plan?.id ?? "")
    : plan?.id ?? "";

  // One checkout, one URL shape. Every service used to have its own — and its
  // own screen behind it — which is the thing this replaces.
  const checkoutHref = !plan ? "" : `/checkout/${buyableId}`;

  const buyFood = () => {
    if (!plan) return;
    addToCart({
      service: "food",
      providerId: plan.legacyProviderId ?? "",
      providerName: providerName ?? "Restaurant",
      planId: buyableId,
      planName: chosen?.name ?? plan.title,
      unitPriceCents: priceCents ?? 0,
      periods: 1,
      mealsPerDay: mealsPerDay || 1,
      meals,
    } as never, 1);
    toast.success("Added to your cart");
    navigate("/cart");
  };

  const subscribe = () => {
    if (plan?.source === "food") { buyFood(); return; }
    if (!checkoutHref) return;
    if (isAuthenticated) navigate(checkoutHref);
    else openAuthModal("login", checkoutHref);
  };

  /**
   * The URL segment is not the archetype key — the beach club lives at
   * /services/beach-club while its archetype is `entertainment`, so titling
   * the page from the URL printed "beach-club" at the customer. The provider
   * row knows which archetype it belongs to; ask it.
   */
  const providerArchetype = (providerQ.data as any)?.archetype_key as string | undefined;
  const serviceLabel = useArchetypeLabel(providerArchetype ?? archetypeKey, archetypeKey);

  const categoryKey = (providerQ.data as any)?.category_key as string | undefined;
  const categoryQ = useQuery({
    queryKey: ["plan-detail-category", categoryKey],
    enabled: !!categoryKey,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories").select("key, label").eq("key", categoryKey!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  /**
   * A plan shows its own photographs when it has any. Borrowing the
   * provider's gallery made every plan a business sold look like every other
   * one — the same pool photo above three different memberships.
   */
  const gallery = useMemo(() => {
    if (plan?.gallery?.length) return plan.gallery;
    const p: any = providerQ.data;
    if (!p) return [] as string[];
    const list = asStringList(p.gallery_urls);
    return list.length ? list : (p.avatar_url ? [p.avatar_url] : []);
  }, [plan, providerQ.data]);

  /**
   * One plan, one address.
   *
   * A legacy plan carries two ids — its own and its mirror's — and the service
   * has two spellings, so the same membership could be reached at four URLs.
   * Whichever one the visitor arrives on, they end up at the canonical one:
   * the original id under the public service slug. Replace, not push, so Back
   * still leaves the page rather than bouncing between spellings.
   */
  const canonicalKey =
    plan?.source === "beach" ? "entertainment"
    : plan?.source === "cleaning" ? "cleaning"
    : plan?.source === "food" ? "food"
    : (providerQ.data?.archetype_key ?? archetypeKey);
  const canonical = plan ? planHref(canonicalKey, plan.id) : null;
  if (canonical && canonical !== location.pathname) {
    return <Navigate to={`${canonical}${location.search}`} replace />;
  }

  /**
   * What this plan grants, in its own words. An access line says "unlimited
   * access" rather than pretending to a count, and a line with no period of
   * its own inherits the plan's.
   */
  const entitlementLines = useMemo(() => {
    const raw = planQ.data?.entitlements;
    const list = readEntitlements({ entitlements: raw });
    return list
      .map((e) => describeEntitlement(e, chosen?.period ?? null))
      .filter((l) => l && !/^Unlimited access$/i.test(l));
  }, [planQ.data, chosen]);

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
    plan.source === "food" ? "food" :
    archetypeKey === "cleaning" ? "cleaning" :
    archetypeKey === "food" ? "food" :
    archetypeKey === "beach-club" || archetypeKey === "entertainment" ? "beach" : null;
  const cover = gallery[0];



  /**
   * Provider › Service › Category, as the design draws it — three ways back
   * out of a plan into the thing that contains it. Each crumb is dropped when
   * there is nothing behind it to click, rather than rendered dead.
   */
  const listing = publicListingHref(
    plan.source === "cleaning" ? "cleaning" : plan.source === "beach" ? "beach"
      : plan.source === "food" ? "food" : null,
    archetypeKey,
  );
  const category = categoryQ.data as { key: string; label: string } | null | undefined;
  const seenCrumbs = new Set<string>();
  const breadcrumbs = ([
    providerName && plan.providerId
      ? { label: providerName, href: providerHref(archetypeKey, plan.providerId) }
      : null,
    listing ? { label: serviceLabel, href: listing } : null,
    category && listing
      ? { label: category.label, href: `${listing}?category=${encodeURIComponent(category.key)}` }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>)
    .filter((c) => {
      const key = c.label.trim().toLowerCase();
      if (seenCrumbs.has(key)) return false;
      seenCrumbs.add(key);
      return true;
    });
  // An offer's own price is the cheapest combination; once options are picked
  // the figure below is exact, so "From" only belongs on the unpicked case.
  const showFrom = !!offer && !chosen;

  /**
   * What this button says — one of three things, and nothing else.
   *
   * Food goes to the basket, so it says so and carries no price: the amount is
   * settled at the cart, not here. Everything else pays, and shows what it is
   * about to charge per period. With no price to show — an unpriced plan, or an
   * offer nobody has configured yet — the button falls back to the word for the
   * act itself.
   */
  const unit = normalizeUnit(priceUnit);
  const ctaLabel =
    plan?.source === "food" ? ADD_TO_CART
    : typeof priceCents === "number" && priceCents > 0 && !showFrom ? payLabel(priceCents, unit)
    : SUBSCRIBE;
  const fromRange = showFrom ? fromLabel(priceCents, unit) : null;

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-12">
      <DesktopHeader />

      {/*
        The bar sticks, the photograph does not. Sticky-then-negative-margin
        is what lets the photo start at the very top of the screen and slide
        away underneath the controls, which is what the design shows and what
        a customer expects from a hero.

        The bar carries no background over the photo — the scrim below does
        that job — and takes one once the photo has scrolled past, because
        white icons on a white card are invisible.
      */}
      <header
        className={cn(
          "sticky top-0 z-40 transition-colors md:hidden",
          cover && !scrolled ? "text-white" : "bg-card text-foreground",
          cover && "-mb-14",
        )}
      >
        <div className="relative flex h-14 items-center justify-between p-2">
          <button
            type="button"
            aria-label="Back"
            onClick={goBack}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/10"
          >
            <KeyboardArrowLeftIcon className="h-6 w-6" />
          </button>
          <span className="pointer-events-none absolute left-1/2 w-[60%] -translate-x-1/2 truncate text-center text-[16px] font-semibold tracking-[-0.32px]">
            {serviceLabel}
          </span>
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => (isAuthenticated ? navigate("/notifications") : openAuthModal("login", "/notifications"))}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/10"
          >
            <NotificationsIcon className="h-6 w-6" />
          </button>
        </div>
      </header>

      {cover && (
        <div className="relative h-[280px] w-full overflow-hidden rounded-b-radius-lg bg-muted shadow-figma md:hidden">
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* Without the scrim the back arrow disappears into a bright sky. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent" />
        </div>
      )}

      {/* Desktop keeps the ordinary title bar; the hero is a phone shape. */}
      <div className="hidden md:block">
        <HomeHeader title={title} showBackButton onBack={goBack} bare />
      </div>

      {/*
        Full-bleed on a phone: the design gives the cards no side gutter, so
        the 24px corners meet the screen edge and the 4px gaps are the only
        separation. The page container comes back on a desktop, where a
        1280px-wide card would be unreadable.
      */}
      <main className="flex flex-col gap-1 pt-1 md:mx-auto md:max-w-[1280px] md:gap-4 md:px-6 md:py-space-8">
        <section className="space-y-3 rounded-radius-lg bg-card p-4 shadow-figma">
          {breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="-mx-4 flex items-start gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {breadcrumbs.map((crumb) => (
                <Link
                  key={crumb.label}
                  to={crumb.href}
                  className="flex shrink-0 items-start gap-0.5 rounded-radius-md bg-inset py-1 pl-2 pr-1 text-[12px] font-medium leading-4 tracking-[-0.24px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="max-w-[45vw] truncate">{crumb.label}</span>
                  <KeyboardArrowRightIcon className="h-4 w-4 shrink-0" />
                </Link>
              ))}
            </nav>
          )}

          <div className="space-y-2">
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.48px] text-foreground">{title}</h1>
            {description && (
              <p className="text-[16px] leading-[22px] tracking-[-0.32px] text-muted-foreground">{description}</p>
            )}
            {plan.meta && (
              <p className="text-[12px] leading-4 tracking-[-0.24px] text-muted-foreground">{plan.meta}</p>
            )}
          </div>

          {offer && offer.groups.length > 0 && (
            <PlanOptionPicker offer={offer} selection={selection} onSelect={setSelection} />
          )}

          {plan.source === "food" && mealsPerDay > 0 && (
            <div className="rounded-radius-md bg-inset px-4 py-3">
              <MealSelectionPicker value={meals} onChange={setMeals} mealsPerDay={mealsPerDay} />
            </div>
          )}

          {offer && !chosen && (
            <p className="text-[12px] tracking-[-0.24px] text-destructive">
              That combination isn't offered — pick another.
            </p>
          )}
        </section>

        {(plan.features.length > 0 || entitlementLines.length > 0) && (
          <section className="space-y-3 rounded-radius-lg bg-card p-4 shadow-figma">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">What's included</h2>
            <ul className="space-y-2">
              {/* What the plan GRANTS comes first and in the plan's own words —
                  "4 cleanings a month", "4 hours a month" — because a package
                  of two things was previously describable only in the feature
                  list, by hand, where nothing enforced it. */}
              {entitlementLines.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckIcon className="h-[22px] w-[22px] shrink-0 text-primary" />
                  <span className="flex-1 text-[16px] font-semibold leading-[22px] tracking-[-0.32px] text-foreground">{line}</span>
                </li>
              ))}
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckIcon className="h-[22px] w-[22px] shrink-0 text-primary" />
                  <span className="flex-1 text-[16px] leading-[22px] tracking-[-0.32px] text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </section>
        )}


        {plan.providerId && reviewService && (
          // The block is a bare <section>, so the card padding belongs here —
          // full-bleed left its heading against the screen edge.
          <div className="rounded-radius-lg bg-card p-4 shadow-figma">
            <ProviderReviewsBlock providerId={plan.providerId} service={reviewService} />
          </div>
        )}
      </main>

      {/*
        The design ends the screen here — no tab bar. A plan page is a decision,
        and the way out is the back arrow or a breadcrumb, both of which are on
        screen. The price rides inside the button rather than beside it: the two
        were one decision pretending to be two.
      */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 rounded-t-radius-lg bg-card md:static md:mt-6 md:rounded-none"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="px-4 py-2 md:mx-auto md:max-w-[1280px] md:px-6">
          {/* An offer whose variants disagree about price has no single price
              to put in the button, so the range goes above it and the button
              says the one thing it always says. */}
          {showFrom && fromRange && (
            <p className="mb-1.5 text-center text-[13px] text-muted-foreground">{fromRange}</p>
          )}
          <button
            type="button"
            onClick={subscribe}
            disabled={(!!offer && !chosen) || (mealsPerDay > 0 && meals.length !== Math.min(mealsPerDay, 3))}
            className="w-full rounded-radius-md bg-primary px-4 py-3 text-[16px] font-semibold leading-6 tracking-[-0.32px] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {/* Three actions, three labels. This button used to word itself
                four ways — "Add to cart · $90.00 / week", "From $79.00 / month",
                "Pay $80.00 / month", "Subscribe" — for what is, from the
                customer's side, the same tap. */}
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** The page frame, for the states that have no plan to show. */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const goBack = useGoBack("/discovery");
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <DesktopHeader />
      <HomeHeader title={title} showBackButton onBack={goBack} bare />
      <main className="market-content py-space-8">{children}</main>
      <BottomNav />
    </div>
  );
}

export default PlanDetail;
