import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Promotions — what businesses bought to be seen (Edge routes/promotions.ts).
 *
 * Featured weeks are paid up front from the business's balance (they show in
 * Finance → payouts as method "promotion"); a boost earns its extra
 * commission order by order, already inside the platform take.
 */

interface Stats { impressions: number; clicks: number; orders: number; revenueCents: number }
interface Row {
  id: string; kind: "boost" | "featured"; placement: "home" | "service" | null; providerName: string;
  starts_at: string; ends_at: string | null; price_cents: number; extra_commission_pct: number;
  status: "active" | "paused" | "ended"; created_at: string; stats?: Stats;
}
interface Settings { homeWeekCents: number; serviceWeekCents: number; boostPct: number; slotsHome: number; slotsService: number }

const live = (r: Row) => r.status === "active" && new Date(r.starts_at) <= new Date() && (!r.ends_at || new Date(r.ends_at) > new Date());

export default function Promotions() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/promotions");
      if (error) throw error;
      return data as { enabled: boolean; settings: Settings; rows: Row[] };
    },
  });
  const rows = data?.rows ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.providerName.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const since = Date.now() - 30 * 86_400_000;
  const featuredRevenue = rows.filter((r) => r.kind === "featured" && new Date(r.created_at).getTime() >= since)
    .reduce((s, r) => s + r.price_cents, 0);
  const boostRevenue = rows.filter((r) => r.kind === "boost")
    .reduce((s, r) => s + Math.round((r.stats?.revenueCents ?? 0) * r.extra_commission_pct / 100), 0);

  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await adminApi(`/admin/promotions/${id}/end`, { method: "POST" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ended"); void qc.invalidateQueries({ queryKey: ["admin-promotions"] }); },
    onError: (e: Error) => toast.error(e.message || "Could not end it"),
  });

  return (
    <SuperAdminLayout title="Promotions" subtitle="Featured weeks and boosts businesses bought to be seen">
      {data && !data.enabled && (
        <p className="mb-4 rounded-radius-md bg-card p-4 text-body text-muted-foreground">
          Promotions need the database migration (20261114120000_provider_promotions) before businesses can buy them.
        </p>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Live now" value={String(rows.filter(live).length)} />
        <Stat label="Featured · 30d" value={formatUSD(featuredRevenue)} />
        <Stat label="Boost take · 30d" value={formatUSD(boostRevenue)} />
      </div>

      {data?.settings && <SettingsCard initial={data.settings} />}

      <AdminListShell
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search a business"
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={rows.length === 0}
        isNoResults={rows.length > 0 && filtered.length === 0}
        onClearFilters={search ? () => setSearch("") : undefined}
        count={filtered.length}
        emptyTitle="Nothing promoted yet"
        emptySubtitle="Businesses buy a featured week or switch on a boost from their workspace's Promote tab."
      >
        <div className="space-y-0.5 rounded-radius-lg bg-card p-1.5">
          {filtered.map((r) => {
            const s = r.stats ?? { impressions: 0, clicks: 0, orders: 0, revenueCents: 0 };
            const isLive = live(r);
            return (
              <div key={r.id} className={cn("flex items-center gap-3 rounded-radius-md p-3", !isLive && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-title font-semibold text-foreground">
                    {r.providerName}
                    <span className="font-normal text-muted-foreground">
                      {" · "}{r.kind === "boost" ? `Boost +${r.extra_commission_pct}%` : `Featured · ${r.placement === "home" ? "Home" : "Service"}`}
                    </span>
                  </p>
                  <p className="truncate text-meta text-muted-foreground">
                    {r.kind === "featured"
                      ? `${format(new Date(r.starts_at), "MMM d")} → ${r.ends_at ? format(new Date(r.ends_at), "MMM d") : "—"} · ${formatUSD(r.price_cents)}`
                      : r.status === "active" ? "On" : r.status === "paused" ? "Off" : "Ended"}
                    {` · ${s.impressions} views · ${s.clicks} taps · ${s.orders} orders · ${formatUSD(s.revenueCents)}`}
                  </p>
                </div>
                {r.status !== "ended" && (
                  <Button size="sm" variant="secondary" loading={end.isPending && end.variables === r.id}
                    onClick={() => { if (window.confirm(`End this promotion for ${r.providerName}? A featured week is not refunded automatically.`)) end.mutate(r.id); }}>
                    End
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </AdminListShell>
    </SuperAdminLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-radius-md bg-card p-3">
      <p className="truncate text-meta text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-title font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function SettingsCard({ initial }: { initial: Settings }) {
  const qc = useQueryClient();
  const toForm = (s: Settings) => ({
    home: String(s.homeWeekCents / 100), service: String(s.serviceWeekCents / 100), boost: String(s.boostPct),
    slotsHome: String(s.slotsHome), slotsService: String(s.slotsService),
  });
  const [f, setF] = useState(toForm(initial));
  useEffect(() => setF(toForm(initial)), [initial]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi("/admin/promotions/settings", {
        method: "PUT",
        body: JSON.stringify({
          homeWeekCents: Math.round(Number(f.home) * 100), serviceWeekCents: Math.round(Number(f.service) * 100),
          boostPct: Number(f.boost), slotsHome: Number(f.slotsHome), slotsService: Number(f.slotsService),
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Prices saved"); void qc.invalidateQueries({ queryKey: ["admin-promotions"] }); },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  return (
    <section className="mb-4 space-y-3 rounded-radius-lg bg-card p-4">
      <div>
        <h2 className="text-title font-semibold text-foreground">Prices</h2>
        <p className="text-meta text-muted-foreground">A boost's rate is fixed when the business switches it on; a featured week's price when it is bought.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Input inputSize="sm" label="Home, $ / week" type="number" min={0} value={f.home} onChange={set("home")} />
        <Input inputSize="sm" label="Service, $ / week" type="number" min={0} value={f.service} onChange={set("service")} />
        <Input inputSize="sm" label="Boost, extra %" type="number" min={0} max={50} value={f.boost} onChange={set("boost")} />
        <Input inputSize="sm" label="Home slots" type="number" min={0} max={12} value={f.slotsHome} onChange={set("slotsHome")} />
        <Input inputSize="sm" label="Slots per service" type="number" min={0} max={12} value={f.slotsService} onChange={set("slotsService")} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save prices</Button>
      </div>
    </section>
  );
}
