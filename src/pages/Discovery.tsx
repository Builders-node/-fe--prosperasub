import { useState } from "react";
import { Link } from "react-router-dom";
import { Users, ChevronRight, ChefHat, QrCode, Store } from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { AdBanner } from "@/components/AdBanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccessQrCode } from "@/components/account/AccessQrCode";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBusinesses } from "@/hooks/useMyBusinesses";
import { useServiceCategories, type ServiceCategoryResolved } from "@/hooks/useServiceCategories";
import { cn } from "@/lib/utils";

// "My Subs" tile isn't a category, but sits alongside category tiles.
const MY_SUBS_TILE = {
  to: "/my-subscriptions",
  title: "My Subs",
  icon: Users,
  tint: "bg-violet-50 dark:bg-violet-950/40",
  chip: "bg-violet-500",
};

/**
 * Derive a soft background from an accent Tailwind class:
 *   "bg-blue-500"  →  "bg-blue-50 dark:bg-blue-950/40"
 * Falls back to a neutral muted background if the accent doesn't match.
 */
function accentTint(accent: string): string {
  const m = /^bg-([a-z]+)-\d+$/.exec(accent);
  return m ? `bg-${m[1]}-50 dark:bg-${m[1]}-950/40` : "bg-muted";
}

/**
 * Every category goes through the unified `/category/:key` route. The page
 * decides internally whether to render a legacy listing component (Food,
 * Cleaning, Cars, Beach Club, Massage) or a generic provider+plans list.
 */
function categoryHref(key: string): string {
  return `/category/${key}`;
}

const Discovery = () => {
  const { userData } = useAuth();
  const [qrOpen, setQrOpen] = useState(false);
  const { hasAny: managesBusiness } = useMyBusinesses();
  const { categories, isLoading } = useServiceCategories(true);

  const firstName = userData?.name?.split(" ")[0] || userData?.display_name?.split(" ")[0];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <AdBanner placement="home_top" />
      <HomeHeader title="Services" />
      <DesktopHeader />

      <main className="market-content space-y-6 py-space-4 md:space-y-8 md:py-space-8">
        {/* ─── Greeting ──────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
            Prospera Village
          </p>
          <h1 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-foreground">
            {firstName ? `Hi, ${firstName}` : "What can we do for you?"}
          </h1>
        </div>

        {/* ─── Manage your business (owners/managers only) ───────────── */}
        {managesBusiness && (
          <Link
            to="/my-business"
            aria-label="My Business"
            className="group flex items-center gap-4 overflow-hidden rounded-2xl bg-amber-50 p-4 transition-transform active:scale-[0.99] dark:bg-amber-950/40"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm transition-transform group-hover:scale-110">
              <ChefHat className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight text-foreground">My Business</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Manage your businesses</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" aria-hidden />
          </Link>
        )}

        {/* ─── Categories (from DB) ─────────────────────────────────── */}
        <section>
          <SectionHeader title="Browse by category" scrollable={false} />
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="min-h-[112px] animate-pulse rounded-2xl bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {categories.map((c) => (
                <CategoryTile key={c.key} category={c} />
              ))}

              {/* My Subs — always available */}
              <Link
                to={MY_SUBS_TILE.to}
                aria-label={MY_SUBS_TILE.title}
                className={cn(
                  "group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl p-4 transition-transform active:scale-[0.98]",
                  MY_SUBS_TILE.tint,
                )}
              >
                <p className="max-w-[80%] text-[15px] font-bold leading-tight text-foreground">
                  {MY_SUBS_TILE.title}
                </p>
                <div className="mt-3 flex items-end justify-end">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-110", MY_SUBS_TILE.chip)}>
                    <MY_SUBS_TILE.icon className="h-5 w-5" />
                  </span>
                </div>
              </Link>

              {/* Access QR — logged-in users only */}
              {userData && (
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  aria-label="My Access code"
                  className="group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl bg-amber-50 p-4 text-left transition-transform active:scale-[0.98] dark:bg-amber-950/40"
                >
                  <p className="max-w-[80%] text-[15px] font-bold leading-tight text-foreground">My Access</p>
                  <div className="mt-3 flex items-end justify-end">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-black shadow-sm transition-transform group-hover:scale-110">
                      <QrCode className="h-5 w-5" />
                    </span>
                  </div>
                </button>
              )}

              {/* Become a provider */}
              <Link
                to="/become-a-provider"
                aria-label="Become a provider"
                className="group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl bg-teal-50 p-4 transition-transform active:scale-[0.98] dark:bg-teal-950/40"
              >
                <div className="max-w-[80%]">
                  <p className="text-[15px] font-bold leading-tight text-foreground">Become a provider</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Offer your service on ProsperaSub</p>
                </div>
                <div className="mt-3 flex items-end justify-end">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-white shadow-sm transition-transform group-hover:scale-110">
                    <Store className="h-5 w-5" />
                  </span>
                </div>
              </Link>
            </div>
          )}
        </section>
      </main>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="flex min-h-[88vh] flex-col sm:min-h-0 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>My Access</DialogTitle>
          </DialogHeader>
          <div className="flex flex-1 flex-col items-center justify-center py-6">
            <AccessQrCode />
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

function CategoryTile({ category }: { category: ServiceCategoryResolved }) {
  const Icon = category.Icon;
  return (
    <Link
      to={categoryHref(category.key)}
      aria-label={category.label}
      className={cn(
        "group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl p-4 transition-transform active:scale-[0.98]",
        accentTint(category.accent),
      )}
    >
      <p className="max-w-[80%] text-[15px] font-bold leading-tight text-foreground">
        {category.label}
      </p>
      <div className="mt-3 flex items-end justify-end">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-110", category.accent)}>
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
