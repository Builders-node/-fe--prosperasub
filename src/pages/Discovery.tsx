import { useState } from "react";
import { Link } from "react-router-dom";
import { Users, ChevronRight, ChefHat, QrCode, Store } from "lucide-react";
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

  // Only show archetypes that resolve to a real listing URL. An archetype
  // without a matching public route is unreachable — filter it out so we
  // never render a tile that leads nowhere.
  const archetypes = allArchetypes.filter((a) => publicListingHref(a.source_service_key));
  const { t } = useI18n();

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
              {archetypes.map((a) => <ArchetypeTile key={a.key} archetype={a} />)}
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

function ArchetypeTile({ archetype }: { archetype: ServiceArchetype }) {
  const Icon = archetype.Icon;
  return (
    <Link
      to={publicListingHref(archetype.source_service_key) ?? "/discovery"}
      aria-label={archetype.label}
      className={cn(
        "group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl p-4 transition-colors active:scale-[0.98] hover:bg-muted/40",
        ARCHETYPE_TILE_BG,
      )}
    >
      <div className="max-w-[85%]">
        <p className="text-[15px] font-bold leading-tight text-foreground">{archetype.label}</p>
        {archetype.description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{archetype.description}</p>
        )}
      </div>
      <div className="mt-3 flex items-end justify-end">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </span>
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
