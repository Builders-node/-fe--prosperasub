import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useFavorites } from "@/lib/favorites/useFavorites";
import { useRecentlyViewed } from "@/lib/recentlyViewed";
import { formatDateHN, todayHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { OfferCard, PlanRail, RAIL_TILE, Rail, ShelfHeader, planIndex, planPhotos, useHomePlans, type HomePlan } from "@/components/discovery/homePlans";

/**
 * The part of the home page that is about the person looking at it:
 *
 *   Your subscriptions — what is running and when it ends, so a renewal is
 *                        noticed on the home page, not on the day it lapses.
 *   Saved              — the hearts, on the way back in.
 *   Recently viewed    — this browser's last plans.
 *
 * Each shelf is drawn only when it has something on it, so a first visit sees
 * none of this and the page is exactly the shop window it was.
 */

const SOON_DAYS = 5;
const MAX_SUBS = 8;

interface Sub {
  id: string; service: string; provider_id: string | null; plan_id: string | null; plan_name: string | null;
  status: string; ends_on: string | null;
}
interface Prov { id: string; name: string; banner_url: string | null; gallery_urls: unknown }

function useMyRunningSubs() {
  const { userData, isAuthenticated } = useAuth();
  const uuid = useUserUuid();
  const ids = [uuid, userData?.id].filter((x): x is string => !!x);
  return useQuery({
    queryKey: ["home-my-subs", ...ids],
    enabled: isAuthenticated && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("subscriptions_unified")
        .select("id, service, provider_id, plan_id, plan_name, status, ends_on")
        .in("user_id", ids)
        .eq("status", "active")
        .order("ends_on", { ascending: true, nullsFirst: false })
        .limit(MAX_SUBS);
      if (error) throw error;
      const subs = (data ?? []) as Sub[];
      const provIds = [...new Set(subs.map((s) => s.provider_id).filter((x): x is string => !!x))];
      const { data: provs } = provIds.length
        ? await supabaseDb.from("providers").select("id, name, banner_url, gallery_urls").in("id", provIds)
        : { data: [] };
      const byId = new Map(((provs ?? []) as Prov[]).map((p) => [p.id, p]));
      return subs.map((s) => ({ ...s, provider: s.provider_id ? byId.get(s.provider_id) ?? null : null }));
    },
  });
}

export function ForYouSection() {
  const { isAuthenticated } = useAuth();
  const subs = useMyRunningSubs();
  const { items: favorites } = useFavorites();
  const recent = useRecentlyViewed();
  const { data: plans = [] } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);

  const pick = (ids: string[]) => {
    const seen = new Set<string>();
    const out: HomePlan[] = [];
    for (const id of ids) {
      const p = index.get(id);
      if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
    }
    return out;
  };
  const saved = pick(favorites.filter((f) => f.kind === "plan").map((f) => f.id));
  const viewed = pick(recent);

  const running = isAuthenticated ? subs.data ?? [] : [];

  return (
    <>
      {running.length > 0 && (
        <section className="space-y-3" aria-label="Your subscriptions">
          <ShelfHeader
            title="Your subscriptions"
            action={<Link to="/my-subscriptions" className="shrink-0 text-[14px] font-semibold text-primary">See all</Link>}
          />
          <Rail>
            {running.map((s) => <SubCard key={`${s.service}-${s.id}`} sub={s} plan={s.plan_id ? index.get(String(s.plan_id)) ?? null : null} />)}
          </Rail>
        </section>
      )}

      {saved.length > 0 && (
        <section className="space-y-3" aria-label="Saved">
          <ShelfHeader
            title="Saved"
            action={<Link to="/favorites" className="shrink-0 text-[14px] font-semibold text-primary">See all</Link>}
          />
          <PlanRail plans={saved.slice(0, 8)} />
        </section>
      )}

      {viewed.length > 0 && (
        <section className="space-y-3" aria-label="Recently viewed">
          <ShelfHeader title="Recently viewed" />
          <PlanRail plans={viewed.slice(0, 8)} />
        </section>
      )}
    </>
  );
}

function SubCard({ sub, plan }: { sub: Sub & { provider: Prov | null }; plan: HomePlan | null }) {
  const daysLeft = sub.ends_on ? differenceInCalendarDays(parseISO(sub.ends_on), parseISO(todayHN())) : null;
  const soon = daysLeft !== null && daysLeft <= SOON_DAYS;
  const line = daysLeft === null
    ? "Active"
    : daysLeft <= 0 ? "Ends today"
      : daysLeft === 1 ? "Ends tomorrow"
        : soon ? `Ends in ${daysLeft} days` : `Active · until ${formatDateHN(sub.ends_on!)}`;

  // The same card as any plan on this page — it IS one of those plans, just
  // one this person already pays for — with how long it runs where the price
  // would be.
  return (
    <OfferCard
      href="/my-subscriptions"
      photos={planPhotos(plan, sub.provider)}
      title={sub.plan_name ?? plan?.name ?? "Subscription"}
      subtitle={sub.provider?.name ?? plan?.provider?.name}
      footer={
        <p className={cn("text-[14px] leading-[20px]", soon ? "font-semibold text-primary" : "text-muted-foreground")}>
          {line}{soon ? " · Renew" : ""}
        </p>
      }
      className={RAIL_TILE}
    />
  );
}
