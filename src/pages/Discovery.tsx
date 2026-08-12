import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, ChevronRight, ChefHat, QrCode, Store } from "lucide-react";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { AdBanner } from "@/components/AdBanner";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { AccessQrCode } from "@/components/account/AccessQrCode";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBusinesses } from "@/hooks/useMyBusinesses";
import { useServiceArchetypes, type ServiceArchetype } from "@/hooks/useServiceArchetypes";
import { publicListingHref } from "@/lib/services/providerBridge";
import { useResidenceMatters } from "@/contexts/LocationContext";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

// "My Subs" tile isn't a category, but sits alongside category tiles.
const MY_SUBS_TILE = {
  to: "/my-subscriptions",
  title: "My Subs",
  icon: Users,
};

// Single-accent design: all archetype tiles share the same canonical `bg-card`
// container so services read as a unified grid rather than a rainbow of tints.
const ARCHETYPE_TILE_BG = "bg-card";

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
  const archetypes = allArchetypes;
  const { t } = useI18n();

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

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <AdBanner placement="home_top" />
      <HomeHeader />
      <DesktopHeader />

      <main className="market-content space-y-6 py-space-4 md:space-y-8 md:py-space-8">
        {/* ─── Greeting ──────────────────────────────────────────────── */}
        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
          {firstName ? t("discovery.greeting").replace("{name}", firstName) : t("discovery.prompt")}
        </h1>

        {/* ─── Access hero — critical daily-use action, hoisted above every
              other shortcut. Prominent tile with a large QR plaque, subtitle
              explaining WHERE to use it, and a full-width primary CTA feel so
              you never have to hunt for it. Signed-in users only. ─────────── */}
        {userData && (
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            aria-label="Show my access QR code"
            className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl bg-primary/10 p-3 text-left transition-colors active:scale-[0.99] hover:bg-primary/15"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-105">
              <QrCode className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-black tracking-tight text-foreground">My Access</span>
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-500">
                  Active
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                Show your entry QR at cleaning, food, courts and beach.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        {/* ─── Personal row: everything else (subs, business, become a
              provider). My Access got hoisted out because it's daily-use
              and needs to jump out visually. ───────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Link
            to={MY_SUBS_TILE.to}
            aria-label={t("discovery.mySubs")}
            className="group flex items-center gap-3 rounded-2xl bg-card p-3 transition-colors active:scale-[0.98] hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-110">
              <MY_SUBS_TILE.icon className="h-5 w-5" />
            </span>
            <p className="min-w-0 text-[14px] font-bold leading-tight text-foreground">{t("discovery.mySubs")}</p>
          </Link>

          {managesBusiness && (
            <Link
              to="/my-business"
              aria-label={t("discovery.myBusiness")}
              className="group flex items-center gap-3 rounded-2xl bg-card p-3 transition-colors active:scale-[0.98] hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-110">
                <ChefHat className="h-5 w-5" />
              </span>
              <p className="min-w-0 text-[14px] font-bold leading-tight text-foreground">{t("discovery.myBusiness")}</p>
            </Link>
          )}

          <Link
            to="/become-a-provider"
            aria-label={t("discovery.becomeProvider")}
            className="group flex items-center gap-3 rounded-2xl bg-card p-3 transition-colors active:scale-[0.98] hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-110">
              <Store className="h-5 w-5" />
            </span>
            <p className="min-w-0 text-[14px] font-bold leading-tight text-foreground">{t("discovery.becomeProvider")}</p>
          </Link>
        </div>

        {/* ─── Services (business archetypes) — the single browse surface ── */}
        <section>
          <SectionHeader title={t("discovery.services")} scrollable={false} />
          {archetypesLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="min-h-[112px] animate-pulse rounded-2xl bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {archetypes.map((a) => (
                <ArchetypeTile key={a.key} archetype={a} categories={categoriesByArchetype.get(a.key) ?? []} />
              ))}
            </div>
          )}
        </section>
      </main>

      <ResponsiveDialog open={qrOpen} onOpenChange={setQrOpen} title="My Access">
        <div className="flex flex-col items-center justify-center py-6">
          <AccessQrCode />
        </div>
      </ResponsiveDialog>

      <BottomNav />
    </div>
  );
};

/** Keeps a many-category service from stretching every tile in its row. */
const MAX_TILE_CATEGORIES = 3;
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
  const Icon = archetype.Icon;
  const images = categories.map((c) => c.imageUrl).filter(Boolean).slice(0, MAX_TILE_IMAGES) as string[];
  return (
    <Link
      to={publicListingHref(archetype.source_service_key, archetype.key) ?? "/discovery"}
      aria-label={archetype.label}
      className={cn(
        "group relative flex min-h-[112px] flex-col overflow-hidden rounded-2xl transition-colors active:scale-[0.98] hover:bg-muted/40",
        ARCHETYPE_TILE_BG,
      )}
    >
      <div className="max-w-[85%] p-4 pb-3">
        <p className="text-[15px] font-bold leading-tight text-foreground">{archetype.label}</p>
        {categories.length > 0 ? (
          // One per line rather than a dot-separated run: at a glance the
          // customer counts what's inside instead of parsing a sentence.
          // Capped so a service with many categories can't stretch the whole
          // row — grid tiles share the tallest one's height.
          <ul className="mt-1 space-y-0.5">
            {categories.slice(0, MAX_TILE_CATEGORIES).map((c) => (
              <li key={c.label} className="truncate text-[11px] leading-snug text-muted-foreground">{c.label}</li>
            ))}
            {categories.length > MAX_TILE_CATEGORIES && (
              <li className="text-[11px] leading-snug text-muted-foreground/70">
                +{categories.length - MAX_TILE_CATEGORIES} more
              </li>
            )}
          </ul>
        ) : archetype.description ? (
          // Fall back to the blurb only when a service has no categories yet —
          // better than an empty tile.
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{archetype.description}</p>
        ) : null}
      </div>

      {/* Cover strip. One photo fills the width; two split it evenly, which is
          what makes "Apartment Cleaning + Car Wash" legible as two things
          without reading the labels. `mt-auto` pins it to the bottom so tiles
          with and without photos still line up in the grid. */}
      <div className="relative mt-auto">
        {images.length > 0 && (
          // Fixed height, not an aspect ratio: at 4/3 a half-width pane is half
          // as tall as a full-width one, so a two-photo tile ended up with a
          // short strip and a gap above it while the grid stretched every tile
          // to the tallest.
          <div className={cn("grid h-32 gap-0.5 md:h-36", images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {images.map((url, i) => (
              <div key={`${url}-${i}`} className="overflow-hidden bg-muted">
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
        <span
          className={cn(
            "absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl text-primary transition-transform group-hover:scale-110",
            // Over a photo the icon needs its own opaque chip; on a bare tile
            // the usual tint is enough.
            images.length > 0 ? "bg-background/90 backdrop-blur-sm" : "bg-primary/15",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        {images.length === 0 && <div className="h-16" />}
      </div>
    </Link>
  );
}


function SectionHeader({ title, scrollable = true }: { title: string; scrollable?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground">{title}</h2>
      {scrollable && <ChevronRight className="h-5 w-5 text-muted-foreground/40 md:hidden" aria-hidden />}
    </div>
  );
}

export default Discovery;
