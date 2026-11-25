import { useMemo } from "react";
import { useSeo } from "@/hooks/useSeo";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, CarFront, Heart, LayoutGrid } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { Photo } from "@/components/patterns/Photo";
import { FavoriteButton } from "@/components/patterns/FavoriteButton";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useTabParam } from "@/hooks/useTabParam";
import { supabaseDb } from "@/integrations/supabase/client";
import { useFavorites, type FavoriteItem, type FavoriteKind } from "@/lib/favorites/useFavorites";
import { formatUSD } from "@/lib/pricing";
import { normPeriod, periodNoun } from "@/lib/services/planPeriod";
import { businessHref, planHref, planSegment } from "@/lib/services/serviceUrls";
import { carPath, vehiclePath } from "@/features/vehicles";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

/**
 * `/favorites` — what the customer saved to come back to.
 *
 * One list, newest first, filtered by kind (plans, businesses, vehicles). Each
 * row is the thing as it is NOW, read fresh: today's name, photo and price,
 * and — if the business stopped selling it — said plainly and greyed out, with
 * the heart still there to clear it. A saved thing never silently vanishes.
 *
 * A guest's hearts live in this browser; the page says so and offers to sign
 * in, which moves them onto the account (FavoritesSync).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === "string" && v[0] ? v[0] : null);

interface Row {
  kind: FavoriteKind;
  /** The id the heart toggles with. */
  id: string;
  title: string;
  subtitle: string | null;
  price: string | null;
  photo: string | null;
  href: string | null;
  available: boolean;
}

type Filter = "all" | FavoriteKind;
const FILTERS: Array<{ key: Filter; label: string; icon: typeof Heart }> = [
  { key: "all", label: tr("All"), icon: Heart },
  { key: "plan", label: tr("Plans"), icon: LayoutGrid },
  { key: "provider", label: tr("Businesses"), icon: Building2 },
  { key: "vehicle", label: tr("Vehicles"), icon: CarFront },
];

async function resolveRows(items: FavoriteItem[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  const ids = (k: FavoriteKind) => items.filter((i) => i.kind === k).map((i) => i.id);

  // Plans — by universal id, or (a guest's) legacy id.
  const planIds = ids("plan");
  if (planIds.length) {
    const uuids = planIds.filter((i) => UUID.test(i));
    const quoted = planIds.map((i) => `"${i}"`).join(",");
    const { data } = await supabaseDb
      .from("provider_plans")
      // `*` for the address in words (slug, public_no) — see planSegment.
      .select("*, providers(id, name, archetype_key, source_provider_id, status, gallery_urls, avatar_url)")
      .or(uuids.length ? `id.in.(${uuids.join(",")}),source_plan_id.in.(${quoted})` : `source_plan_id.in.(${quoted})`);
    for (const p of (data ?? []) as any[]) {
      const prov = p.providers ?? {};
      const archetype = String(prov.archetype_key ?? "");
      const href = archetype ? planHref(archetype, planSegment(p)) : null;
      const noun = normPeriod(p.period) === "one_time" ? "" : periodNoun(p.period);
      const row: Row = {
        kind: "plan",
        id: String(p.id),
        title: p.name ?? tr("Plan"),
        subtitle: prov.name ?? null,
        price: typeof p.price_cents === "number" && p.price_cents > 0 ? `${formatUSD(p.price_cents)}${noun ? ` / ${noun}` : ""}` : null,
        photo: first(p.gallery_urls) ?? first(prov.gallery_urls) ?? prov.avatar_url ?? null,
        href,
        available: p.status === "active" && ["active", "approved"].includes(String(prov.status ?? "active")),
      };
      out.set(`plan:${p.id}`, row);
      if (p.source_plan_id) out.set(`plan:${p.source_plan_id}`, row);
    }
  }

  const providerIds = ids("provider").filter((i) => UUID.test(i));
  if (providerIds.length) {
    const { data } = await supabaseDb
      .from("providers")
      .select("id, name, description, avatar_url, banner_url, gallery_urls, archetype_key, status, slug, unit")
      .in("id", providerIds);
    for (const p of (data ?? []) as any[]) {
      const archetype = String(p.archetype_key ?? "");
      out.set(`provider:${p.id}`, {
        kind: "provider",
        id: String(p.id),
        title: p.name ?? tr("Business"),
        subtitle: p.description ? String(p.description).split("\n")[0] : null,
        price: null,
        photo: p.avatar_url ?? first(p.gallery_urls) ?? p.banner_url ?? null,
        href: archetype || p.unit ? businessHref(String(p.slug || p.id)) : null,
        available: ["active", "approved"].includes(String(p.status ?? "active")),
      });
    }
  }

  const vehicleIds = ids("vehicle").filter((i) => UUID.test(i));
  if (vehicleIds.length) {
    const { data } = await supabaseDb
      .from("rental_vehicles")
      .select("*") // `*` for the address in words (slug, public_no)
      .in("id", vehicleIds);
    for (const v of (data ?? []) as any[]) {
      out.set(`vehicle:${v.id}`, {
        kind: "vehicle",
        id: String(v.id),
        title: v.name ?? tr("Vehicle"),
        subtitle: null,
        price: typeof v.daily_price_cents === "number" ? `${formatUSD(v.daily_price_cents)} / day` : null,
        photo: v.image_url ?? first(v.gallery_urls),
        href: vehiclePath(v),
        available: v.status === "public",
      });
    }
  }
  return out;
}

const ICON: Record<FavoriteKind, typeof Heart> = { plan: LayoutGrid, provider: Building2, vehicle: CarFront };

export default function Favorites() {
  useSeo({ title: tr("Favorites") });
  return (
    <UserLayout title={tr("Favorites")} allowGuest>
      <div className="app-container space-y-4 py-space-4 md:py-space-6">
        <h1 className="hidden text-3xl font-semibold tracking-tight md:block md:text-5xl">{tr("Favorites")}</h1>
        <FavoritesPanel />
      </div>
    </UserLayout>
  );
}

/**
 * The saved list itself — the /favorites page, and the Favorites panel of
 * the profile on a laptop (pages/user/Profile.tsx), which opens it in place.
 */
export function FavoritesPanel() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { items, isLoading } = useFavorites();
  const [filter, setFilter] = useTabParam<Filter>(["all", "plan", "provider", "vehicle"], { key: "show" });

  const idsKey = items.map((i) => `${i.kind}:${i.id}`).join(",");
  const rowsQ = useQuery({
    queryKey: ["favorite-rows", idsKey],
    enabled: items.length > 0,
    staleTime: 60_000,
    queryFn: () => resolveRows(items),
  });

  const counts = useMemo(() => ({
    all: items.length,
    plan: items.filter((i) => i.kind === "plan").length,
    provider: items.filter((i) => i.kind === "provider").length,
    vehicle: items.filter((i) => i.kind === "vehicle").length,
  }), [items]);
  const shown = items.filter((i) => filter === "all" || i.kind === filter);

  return (
      <div className="space-y-4">
        {!isAuthenticated && items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-radius-lg bg-card p-4">
            <p className="text-body text-muted-foreground">{tr("Saved on this device. Sign in to keep them on your phone and laptop alike.")}</p>
            <Button size="sm" onClick={() => openAuthModal("login", "/favorites")}>{tr("Log in")}</Button>
          </div>
        )}

        {isLoading ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <YdEmptyState
            icon={Heart}
            title={tr("Nothing saved yet")}
            subtitle={tr("Tap the heart on a plan, a business or a car and it waits for you here.")}
            action={<Button onClick={() => navigate("/discovery")}>{tr("Browse services")}</Button>}
          />
        ) : (
          <>
            {/* Only the kinds there are. */}
            {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).length > 2 && (
              <div className="flex flex-wrap gap-2">
                {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "flex h-10 items-center gap-1.5 rounded-full px-4 text-body font-semibold transition-colors",
                      filter === f.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                    <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                  </button>
                ))}
              </div>
            )}

            {rowsQ.isLoading ? (
              <PageLoader />
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {shown.map((f) => {
                  const row = rowsQ.data?.get(`${f.kind}:${f.id}`);
                  const Icon = ICON[f.kind];
                  const open = row?.available && row.href ? () => navigate(row.href!) : undefined;
                  return (
                    <article
                      key={`${f.kind}:${f.id}`}
                      role={open ? "link" : undefined}
                      tabIndex={open ? 0 : undefined}
                      onClick={open}
                      onKeyDown={open ? (e) => { if (e.key === "Enter") open(); } : undefined}
                      className={cn(
                        "flex min-w-0 items-center gap-3 rounded-radius-md bg-card p-2 pr-3 shadow-figma transition-colors",
                        open && "cursor-pointer hover:bg-muted/40",
                      )}
                    >
                      <div className={cn("relative size-16 shrink-0 overflow-hidden rounded-[8px] bg-inset", !row?.available && "opacity-50")}>
                        <Photo src={row?.photo} icon={Icon} className="absolute inset-0" iconClassName="h-6 w-6 min-h-6 min-w-6" />
                      </div>
                      <div className={cn("min-w-0 flex-1", !row?.available && "opacity-60")}>
                        <p className="truncate text-body font-semibold text-foreground">{row?.title ?? tr("No longer listed")}</p>
                        <p className="truncate text-meta text-muted-foreground">
                          {!row
                            ? tr("The business removed it")
                            : !row.available
                              ? tr("No longer available")
                              : row.subtitle ?? (f.kind === "provider" ? tr("Business") : "")}
                        </p>
                      </div>
                      {row?.available && row.price && (
                        <span className="shrink-0 text-body font-semibold tabular-nums text-foreground">{row.price}</span>
                      )}
                      <FavoriteButton kind={f.kind} id={f.id} name={row?.title} />
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
  );
}
