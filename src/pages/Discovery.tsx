import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, ChevronRight, ChefHat, QrCode, Store } from "lucide-react";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { AdBanner } from "@/components/patterns/AdBanner";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { AccessQrCode } from "@/components/account/AccessQrCode";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBusinesses } from "@/hooks/useMyBusinesses";
import { useServiceArchetypes, type ServiceArchetype } from "@/hooks/useServiceArchetypes";
import { FAMILY_STOREFRONTS, familyStorefront } from "@/lib/services/families";
import { useVehicleTypes } from "@/features/vehicles";
import { resolveCategoryIcon } from "@/lib/services/categoryIcons";
import { CarFront as CarFrontIcon } from "lucide-react";
import { publicListingHref } from "@/lib/services/providerBridge";
import { CategoryCarousel } from "@/components/discovery/CategoryCarousel";
import { useTabParam } from "@/hooks/useTabParam";
import { BusinessCenterIcon, QrCodeIcon } from "@/components/icons/FigmaIcons";
import { useResidenceMatters } from "@/contexts/LocationContext";
import { useI18n } from "@/i18n";
import { prefetchRoute } from "@/lib/routeChunks";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/patterns/Skeleton";

// "My Subs" tile isn't a category, but sits alongside category tiles.
const MY_SUBS_TILE = {
  to: "/my-subscriptions",
  title: "My Subs",
  icon: Users,
};

// Single-accent design: all archetype tiles share the same canonical `bg-card`
// container so services read as a unified grid rather than a rainbow of tints.
const ARCHETYPE_TILE_BG = "bg-card";

/** The words on the family tabs. Anything unnamed falls back to its key. */
const FAMILY_LABELS: Record<string, string> = {
  experiences: "Experiences",
  transport: "Transport",
};

const Discovery = () => {
  const { userData } = useAuth();
  const [qrOpen, setQrOpen] = useState(false);
  const { hasAny: managesBusiness } = useMyBusinesses();
  const { archetypes: allArchetypes, isLoading: archetypesLoading } = useServiceArchetypes(true);

  // Home filters nothing itself, but it is where people set their location
  // before they go looking for a service — so the header selector belongs
  // here even though this page never reads the value.
  useResidenceMatters();

  // Every active archetype now resolves to a listing — legacy ones to their
  // bespoke page, the rest to the generic ServicePage — so nothing is filtered
  // out. The old filter existed because an archetype off the hard-coded route
  // map led nowhere; that map no longer decides what exists.
  const { t } = useI18n();

  /**
   * The top of the browse hierarchy: family → service → category. The tabs
   * answer the visitor's FIRST question — "what kinds of thing are here at
   * all" — before a single tile is read. Families come from the archetype
   * rows (`service_archetypes.family`), so a third family is a row edit;
   * with one family the control hides and the page is exactly what it was.
   */
  const families = useMemo(() => {
    const seen: string[] = [];
    for (const a of allArchetypes) if (!seen.includes(a.family)) seen.push(a.family);
    // A unit that owns its storefront is not an archetype at all — transport
    // has none by design — so its tab comes from the manifest.
    for (const f of Object.keys(FAMILY_STOREFRONTS)) if (!seen.includes(f)) seen.push(f);
    return seen;
  }, [allArchetypes]);
  const [family, setFamily] = useTabParam(families, { key: "family" });
  const showFamilies = families.length > 1;
  const archetypes = showFamilies
    ? allArchetypes.filter((a) => a.family === family)
    : allArchetypes;

  /** Set when the open tab is a unit with its own section (transport). */
  const storefront = showFamilies ? familyStorefront(family) : null;
  // Its own types, not service-categories: transport has no service layer.
  const { data: vehicleTypes = [] } = useVehicleTypes({ enabled: !!storefront });

  // What's actually inside each service. A tile saying "Apartment Cleaning ·
  // Car Wash" tells a customer more in four words than the archetype's prose
  // blurb did in two truncated lines.
  const { categories } = useServiceCategories(true);
  const categoriesByArchetype = useMemo(() => {
    const m = new Map<string, TileCategory[]>();
    for (const c of categories) {
      if (!c.archetype_key) continue;
      if (!m.has(c.archetype_key)) m.set(c.archetype_key, []);
      m.get(c.archetype_key)!.push({ label: c.label, imageUrl: c.image_url ?? null });
    }
    return m;
  }, [categories]);

  const firstName = userData?.name?.split(" ")[0] || userData?.display_name?.split(" ")[0];

  /**
   * One shortcut row, exactly as the design draws it: a #f6f6f6 card with a
   * white 8px-radius icon tile, a 16px semibold title and an optional 12px
   * caption. Used for My Access, My Business and Become a provider so the
   * three read as one list rather than three ideas.
   */
  const ShortcutRow = ({
    icon: Icon, title, caption, onClick, to,
  }: {
    icon: (props: { className?: string }) => JSX.Element;
    title: string;
    caption?: string;
    onClick?: () => void;
    to?: string;
  }) => {
    const inner = (
      <>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-card">
          <Icon className="h-6 w-6 text-foreground" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <span className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">{title}</span>
          {caption && (
            <span className="truncate text-[12px] tracking-[-0.24px] text-muted-foreground">{caption}</span>
          )}
        </span>
      </>
    );
    const className = "flex w-full items-center gap-3 rounded-radius-md bg-background p-4 transition-colors active:scale-[0.99] hover:bg-muted";
    return to
      ? <Link to={to} className={className}>{inner}</Link>
      : <button type="button" onClick={onClick} className={className}>{inner}</button>;
  };

  return (
    <BrowseLayout
      // Mobile only: on md+ the same strip is already mounted site-wide above
      // every route (SiteAdBanner in App) — two copies on one screen otherwise.
      top={<div className="md:hidden"><AdBanner placement="home_top" /></div>}
      header={<HomeHeader variant="brand" />}
    >

      {/*
        The design splits the screen in two: a white panel that carries the
        promo rail and the shortcuts, rounded 24px at the bottom, then the grey
        page with the service grid. The panel is what makes the top of the
        screen read as one block instead of three stacked cards.
      */}
      <section className="bg-card pb-4 shadow-figma rounded-b-radius-lg md:rounded-b-none">
        <div className="app-container space-y-4 pt-4">
          {showFamilies && (
            <div className="flex rounded-radius-md bg-inset p-0.5">
              {families.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFamily(f)}
                  className={`flex-1 rounded-radius-md px-4 py-2 text-center text-[16px] font-semibold leading-[22px] transition-colors ${
                    family === f ? "bg-card text-foreground" : "text-foreground/70 hover:text-foreground"
                  }`}
                >
                  {FAMILY_LABELS[f] ?? f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          )}
          <CategoryCarousel family={showFamilies ? family : undefined} />

          {userData && (
            <ShortcutRow
              icon={QrCodeIcon}
              title="My Access"
              caption="Show this to personnel"
              onClick={() => setQrOpen(true)}
            />
          )}

          {/* The home screen is for buying, so it only carries the door into a
              business you already run. Signing up to be a provider lives in
              the account menu — it is a once-ever action, not a shortcut. */}
          {managesBusiness && (
            <ShortcutRow icon={BusinessCenterIcon} title={t("discovery.myBusiness")} to="/my-business" />
          )}
        </div>
      </section>

      <main className="app-container space-y-4 py-4 md:space-y-8 md:py-space-8">
        {storefront ? (
          /*
            A unit that owns its storefront gets its own doors, not a copy of
            the marketplace's grid. Transport has no services to choose
            between — it has vehicle TYPES, and a fleet behind them.
          */
          <section className="space-y-3">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">
              {storefront.title}
            </h2>
            {vehicleTypes.length > 0 && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {vehicleTypes.map((t) => {
                  const Icon = resolveCategoryIcon(t.icon);
                  return (
                    <Link
                      key={t.key}
                      to={`${storefront.href}?category=${encodeURIComponent(t.key)}`}
                      className="flex h-[120px] flex-col justify-between rounded-radius-md bg-card p-4 shadow-figma transition-colors active:scale-[0.98] hover:bg-muted/40"
                    >
                      <Icon className="h-6 w-6 text-foreground" />
                      <p className="line-clamp-2 text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                        {t.label}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
            <ShortcutRow
              icon={({ className }) => <CarFrontIcon className={className} />}
              title={storefront.allLabel}
              caption={storefront.caption}
              to={storefront.href}
            />
          </section>
        ) : (
          /* ─── Services ─────────────────────────────────────────────── */
          <section className="space-y-3">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">
              {t("discovery.services")}
            </h2>
            {archetypesLoading ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[120px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {archetypes.map((a) => (
                  <ArchetypeTile key={a.key} archetype={a} categories={categoriesByArchetype.get(a.key) ?? []} />
                ))}
              </div>
            )}
          </section>
        )}

      </main>

      <ResponsiveDialog open={qrOpen} onOpenChange={setQrOpen} title="My Access">
        <div className="flex flex-col items-center justify-center py-6">
          <AccessQrCode />
        </div>
      </ResponsiveDialog>

    </BrowseLayout>
  );
};

/** Keeps a many-category service from stretching every tile in its row. */
const MAX_TILE_CATEGORIES = 2;
/**
 * At most two cover photos per tile. Three would each be too narrow to read
 * as anything, and the tile is a signpost, not a gallery.
 */
const MAX_TILE_IMAGES = 2;

export interface TileCategory { label: string; imageUrl: string | null }

function ArchetypeTile({
  archetype, categories = [],
}: {
  archetype: ServiceArchetype;
  /** Active categories inside this service, in admin sort order. */
  categories?: TileCategory[];
}) {
  const href = publicListingHref(archetype.source_service_key, archetype.key) ?? "/discovery";
  return (
    // 120px tall, white, 16px radius, 16px padding, title pinned top and the
    // category list pinned bottom — the design's own card, and the reason the
    // grid reads as four equal things rather than four different heights.
    <Link
      to={href}
      aria-label={archetype.label}
      onPointerDown={() => prefetchRoute(href)}
      onMouseEnter={() => prefetchRoute(href)}
      className="flex h-[120px] flex-col justify-between rounded-radius-md bg-card p-4 shadow-figma transition-colors active:scale-[0.98] hover:bg-muted/40"
    >
      <p className="line-clamp-2 text-[16px] font-semibold tracking-[-0.32px] text-foreground">
        {archetype.label}
      </p>

      {categories.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {categories.slice(0, MAX_TILE_CATEGORIES).map((c) => (
            <li key={c.label} className="truncate text-[12px] tracking-[-0.24px] text-muted-foreground">
              {c.label}
            </li>
          ))}
        </ul>
      ) : archetype.description ? (
        <p className="line-clamp-2 text-[12px] tracking-[-0.24px] text-muted-foreground">
          {archetype.description}
        </p>
      ) : null}
    </Link>
  );
}

function SectionHeader({ title, scrollable = true }: { title: string; scrollable?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="min-w-0 truncate text-[20px] font-semibold tracking-[-0.4px] text-foreground">{title}</h2>
      {scrollable && <ChevronRight className="h-5 w-5 text-muted-foreground/40 md:hidden" aria-hidden />}
    </div>
  );
}

export default Discovery;
