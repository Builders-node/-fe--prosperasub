import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";

interface Summary { totals: Array<{ type: string; total: number }>; grandTotal: number }
interface Revenue { totalCents: number; byMethod: Array<{ method: string; cents: number }> }

/**
 * First product surface that consumes the new DDD Analytics domain: live,
 * event-sourced counts + revenue from the platform's domain-event bus. Additive
 * and read-only — reads `/analytics/*` (projections rebuilt from `domain_events`).
 */
export function DomainEventBusPanel() {
  const { data: summary } = useQuery({
    queryKey: ["ddd-analytics-summary"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await adminApi("/analytics/summary");
      if (error) throw error;
      return data as Summary;
    },
  });
  const { data: revenue } = useQuery({
    queryKey: ["ddd-analytics-revenue"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await adminApi("/analytics/revenue");
      if (error) throw error;
      return data as Revenue;
    },
  });

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground">Domain event bus</h3>
        <span className="ml-auto text-xs text-muted-foreground">event-sourced · DDD backbone</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Live counts from the platform's domain events (Billing, Membership, Booking, Order, …).
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Events by type</span>
            <span className="text-sm tabular-nums text-muted-foreground">{summary?.grandTotal ?? 0} total</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <tbody>
                {(summary?.totals ?? []).slice(0, 12).map((r) => (
                  <tr key={r.type} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">{r.type}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.total}</td>
                  </tr>
                ))}
                {(!summary || summary.totals.length === 0) && (
                  <tr><td className="px-3 py-3 text-sm text-muted-foreground">No events yet — they appear as payments/bookings happen.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Revenue by method (projection)</span>
            <span className="text-sm font-bold tabular-nums text-primary">{formatUSD(revenue?.totalCents ?? 0)}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <tbody>
                {(revenue?.byMethod ?? []).map((r) => (
                  <tr key={r.method} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-1.5 capitalize text-foreground">{r.method}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatUSD(r.cents)}</td>
                  </tr>
                ))}
                {(!revenue || revenue.byMethod.length === 0) && (
                  <tr><td className="px-3 py-3 text-sm text-muted-foreground">No captured revenue in the projection yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
