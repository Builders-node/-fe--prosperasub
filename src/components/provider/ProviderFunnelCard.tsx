import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { accountApi } from "@/integrations/supabase/client";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { Skeleton } from "@/components/patterns/Skeleton";
import { cn } from "@/lib/utils";
import { tr, trx } from "@/lib/tr";

/**
 * Where a business loses its customers — the funnel from "saw your page" to
 * "paid" (Edge routes/funnel.ts, recorded by lib/funnel.ts).
 *
 * A business with nothing sold could not tell whether nobody came, everybody
 * left at the price, or they gave up at payment. Each bar is distinct visitors
 * (browser sessions) in the period; Paid is counted from the real orders. The
 * note under the bars names the step that loses the most, in words, because a
 * row of numbers is not an answer.
 */

interface Stage { key: string; label: string; count: number }
interface PlanRow { id: string; name: string; views: number; checkouts: number; paid: number }
interface Funnel { enabled: boolean; days: number; stages: Stage[]; plans: PlanRow[] }

const PERIODS = [7, 30, 90] as const;

/** One word each for a phone, where five steps share a 375px row. */
const TINY: Record<string, string> = {
  provider_view: "Page",
  plan_view: "Plan",
  checkout_start: "Order",
  payment_chosen: "Paying",
  paid: "Paid",
};

/** Short names for a wider screen. */
const SHORT: Record<string, string> = {
  provider_view: tr("Saw page"),
  plan_view: tr("Opened plan"),
  checkout_start: "Checkout",
  payment_chosen: tr("Chose payment"),
  paid: "Paid",
};

export function ProviderFunnelCard({ providerId }: { providerId: string }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [byPlanOpen, setByPlanOpen] = useState(false);
  const q = useQuery({
    queryKey: ["provider-funnel", providerId, days],
    staleTime: 60_000,
    queryFn: async (): Promise<Funnel> => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/funnel?days=${days}`);
      if (error) throw error;
      return data as Funnel;
    },
  });

  // Before the migration the endpoint says "not enabled" — nothing to show.
  if (q.data && !q.data.enabled) return null;

  const stages = q.data?.stages ?? [];
  const top = Math.max(1, ...stages.map((s) => s.count));
  const leak = biggestLeak(stages);

  return (
    <WorkspaceSection
      title={tr("Sales funnel")}
      subtitle={tr("Where visitors stop on the way to paying")}
      action={
        <div className="flex rounded-full bg-inset p-0.5">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "h-8 rounded-full px-3 text-[13px] font-semibold transition-colors",
                days === d ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-[92px]" />
      ) : q.isError ? (
        <p className="text-[14px] text-muted-foreground">{tr("Couldn't load the funnel right now.")}</p>
      ) : (
        <div className="space-y-3">
          {/* One strip, left to right: how many reached each step and what
              share of the step before got there. Was five full-width bars and
              a table — the whole first screen of Overview. */}
          <ol className="grid grid-cols-5 gap-1">
            {stages.map((s, i) => {
              const prev = i > 0 ? stages[i - 1].count : null;
              const pct = prev ? Math.min(999, Math.round((s.count / prev) * 100)) : null;
              return (
                <li key={s.key} className="min-w-0 rounded-radius-md bg-inset px-1.5 py-2.5 sm:px-2">
                  <p className={cn("text-[22px] font-semibold leading-none tabular-nums",
                    s.key === "paid" ? "text-positive" : "text-foreground")}>{s.count}</p>
                  <p className="mt-1.5 truncate text-[11px] leading-[16px] text-muted-foreground sm:text-[12px]" title={s.label}>
                    <span className="sm:hidden">{TINY[s.key] ?? s.label}</span>
                    <span className="hidden sm:inline">{SHORT[s.key] ?? s.label}</span>
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/60">
                    <div className={cn("h-full rounded-full", s.key === "paid" ? "bg-positive" : "bg-primary")}
                      style={{ width: `${Math.max(s.count ? 6 : 0, (s.count / top) * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-[14px] tabular-nums text-muted-foreground">
                    {pct === null ? "\u00a0" : (
                      <>{pct}%<span className="hidden sm:inline">{" "}{tr("of prev.")}</span></>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>

          {leak && <p className="text-[13px] leading-[18px] text-muted-foreground">{leak}</p>}

          {(q.data?.plans.length ?? 0) > 0 && (
            <div>
              <button type="button" onClick={() => setByPlanOpen((o) => !o)}
                className="flex items-center gap-1 text-[13px] font-semibold text-foreground"
                aria-expanded={byPlanOpen}>{trx("By plan · {length}", { length: q.data!.plans.length })}<ChevronDown className={cn("h-4 w-4 transition-transform", byPlanOpen && "rotate-180")} />
              </button>
              {byPlanOpen && (
                <div className="mt-1">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-1 text-[12px] text-muted-foreground">
                    <span>{tr("Plan")}</span><span className="text-right">{tr("Opened")}</span><span className="text-right">{tr("Checkout")}</span><span className="text-right">{tr("Paid")}</span>
                  </div>
                  {q.data!.plans.map((p) => (
                    <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-1 text-[13px] tabular-nums">
                      <span className="truncate text-foreground">{p.name}</span>
                      <span className="text-right text-foreground">{p.views}</span>
                      <span className="text-right text-foreground">{p.checkouts}</span>
                      <span className="text-right font-semibold text-foreground">{p.paid}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </WorkspaceSection>
  );
}

/** The step that loses the most people, said in a sentence — or null when there is too little to say. */
function biggestLeak(stages: Stage[]): string | null {
  if (stages.length < 2 || (stages[0]?.count ?? 0) < 5) {
    return stages.length && (stages[0]?.count ?? 0) === 0
      ? tr("Nobody has opened your page in this period yet. Share its link or QR code (below) to get the first visitors.")
      : null;
  }
  let worst: { from: Stage; to: Stage; lost: number } | null = null;
  for (let i = 1; i < stages.length; i++) {
    const from = stages[i - 1], to = stages[i];
    if (!from.count) continue;
    const lost = 1 - to.count / from.count;
    if (!worst || lost > worst.lost) worst = { from, to, lost };
  }
  if (!worst || worst.lost < 0.3) return null;
  const pct = Math.round(worst.lost * 100);
  const hint: Record<string, string> = {
    plan_view: tr("People see your page but don't open a plan — better photos and a clear first plan help."),
    checkout_start: tr("People open a plan but don't start checkout — check the price, the description and the photos."),
    payment_chosen: tr("People start checkout but stop before paying — the form or the choice of dates may be in the way."),
    paid: tr("People choose how to pay but don't finish — payment is where you lose them."),
  };
  return tr("{pct}% stop between “{label}” and “{label2}”. {value}", { pct, label: worst.from.label, label2: worst.to.label, value: hint[worst.to.key] ?? "" }).trim();
}
