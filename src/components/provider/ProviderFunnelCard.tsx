import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountApi } from "@/integrations/supabase/client";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { Skeleton } from "@/components/patterns/Skeleton";
import { cn } from "@/lib/utils";

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

export function ProviderFunnelCard({ providerId }: { providerId: string }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
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
      title="Sales funnel"
      subtitle="How many people reach each step, and where they stop"
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
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : q.isError ? (
        <p className="text-[14px] text-muted-foreground">Couldn't load the funnel right now.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {stages.map((s, i) => {
              const prev = i > 0 ? stages[i - 1].count : null;
              const pct = prev ? Math.round((s.count / prev) * 100) : null;
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="font-semibold text-foreground">{s.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{s.count}</span>
                      {pct !== null && ` · ${pct}% of the step before`}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-inset">
                    <div
                      className={cn("h-full rounded-full", s.key === "paid" ? "bg-positive" : "bg-primary")}
                      style={{ width: `${Math.max(s.count ? 3 : 0, (s.count / top) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {leak && (
            <p className="rounded-radius-md bg-inset p-3 text-[14px] leading-[20px] text-foreground">{leak}</p>
          )}

          {(q.data?.plans.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-[14px] font-semibold text-foreground">By plan</p>
              <div className="divide-y divide-transparent">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-1 text-[12px] text-muted-foreground">
                  <span>Plan</span><span className="text-right">Opened</span><span className="text-right">Checkout</span><span className="text-right">Paid</span>
                </div>
                {q.data!.plans.map((p) => (
                  <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-1.5 text-[14px] tabular-nums">
                    <span className="truncate text-foreground">{p.name}</span>
                    <span className="text-right text-foreground">{p.views}</span>
                    <span className="text-right text-foreground">{p.checkouts}</span>
                    <span className="text-right font-semibold text-foreground">{p.paid}</span>
                  </div>
                ))}
              </div>
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
      ? "Nobody has opened your page in this period yet. Share its link or QR code (below) to get the first visitors."
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
    plan_view: "People see your page but don't open a plan — better photos and a clear first plan help.",
    checkout_start: "People open a plan but don't start checkout — check the price, the description and the photos.",
    payment_chosen: "People start checkout but stop before paying — the form or the choice of dates may be in the way.",
    paid: "People choose how to pay but don't finish — payment is where you lose them.",
  };
  return `${pct}% stop between “${worst.from.label}” and “${worst.to.label}”. ${hint[worst.to.key] ?? ""}`.trim();
}
