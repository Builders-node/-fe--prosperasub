import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN, todayHN, addDaysISO } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/patterns/ConfirmDialog";
import { tr } from "@/lib/tr";

/**
 * Discounts — what businesses take off their own prices (Edge routes/discounts.ts).
 *
 * The admin side is oversight, not authoring: see every discount and what it
 * did, hide one that misleads (with a note the owner reads), set the ceiling
 * and how many a business may run, and start a Prospera-wide sale that
 * businesses join — where the platform can pay a share.
 */

interface Stats { orders: number; revenueCents: number; discountCents: number; newCustomers: number }
interface Row {
  id: string; providerName: string | null; kind: "sale" | "intro" | "prepay"; title: string | null;
  value_type: "percent" | "fixed"; percent_off: number | null; amount_off_cents: number | null;
  tiers: Array<{ periods: number; percent_off: number }> | null; intro_periods: number;
  starts_at: string; ends_at: string | null; status: string; admin_hidden: boolean; admin_note: string | null;
  platform_share_pct: number; campaign_id: string | null;
  state: "live" | "scheduled" | "paused" | "ended" | "hidden"; stats: Stats;
}
interface Campaign {
  id: string; title: string; description: string | null; min_percent_off: number; platform_share_pct: number;
  starts_at: string; ends_at: string; status: string;
}
interface Payload {
  enabled: boolean;
  settings: { maxPct: number; maxLive: number };
  totals: { businessCents: number; platformCents: number } | null;
  discounts: Row[];
  campaigns: Campaign[];
}

const KIND: Record<Row["kind"], string> = { sale: "Sale", intro: tr("New customers"), prepay: tr("Pay ahead") };

function valueOf(r: Row): string {
  if (r.kind === "prepay") return (r.tiers ?? []).map((t) => `${t.periods}+ → ${t.percent_off}%`).join(", ");
  return r.value_type === "percent" ? `${r.percent_off}%` : formatUSD(r.amount_off_cents ?? 0);
}

export default function Discounts() {
  const qc = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState<"current" | "all">("current");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-discounts"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/discounts");
      if (error) throw error;
      return data as Payload;
    },
  });
  const rows = data?.discounts ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => only === "all" || r.state !== "ended")
      .filter((r) => !q || (r.providerName ?? "").toLowerCase().includes(q) || (r.title ?? "").toLowerCase().includes(q));
  }, [rows, search, only]);

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { error } = await adminApi(`/admin/discounts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(tr("Saved")); void qc.invalidateQueries({ queryKey: ["admin-discounts"] }); },
    onError: (e: Error) => toast.error(e.message || tr("Could not update it")),
  });

  const live = rows.filter((r) => r.state === "live").length;

  return (
    <SuperAdminLayout title={tr("Discounts")} subtitle={tr("Sales, new-customer prices and pay-ahead discounts businesses run")}>
      {confirmDialog}
      {data && !data.enabled && (
        <p className="mb-4 rounded-radius-md bg-card p-4 text-body text-muted-foreground">{tr("Discounts aren't switched on yet — the database update for them hasn't been applied.")}</p>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label={tr("Live now")} value={String(live)} />
        <Stat label={tr("Paid by businesses · 30d")} value={data?.totals ? formatUSD(data.totals.businessCents) : "—"} />
        <Stat label={tr("Paid by Prospera · 30d")} value={data?.totals ? formatUSD(data.totals.platformCents) : "—"} />
      </div>

      {data?.settings && <SettingsCard initial={data.settings} />}
      <CampaignsCard campaigns={data?.campaigns ?? []} />

      <div className="mb-2 flex gap-1">
        {([["current", tr("Live & scheduled")], ["all", "All"]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setOnly(v)}
            className={cn("h-8 rounded-full px-3 text-meta font-semibold", only === v ? "bg-foreground text-background" : "bg-card text-muted-foreground")}>
            {label}
          </button>
        ))}
      </div>

      <AdminListShell
        search={search}
        onSearch={setSearch}
        searchPlaceholder={tr("Search a business or a discount")}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={rows.length === 0}
        isNoResults={rows.length > 0 && filtered.length === 0}
        onClearFilters={search ? () => setSearch("") : undefined}
        count={filtered.length}
        emptyTitle={tr("No discounts yet")}
        emptySubtitle={tr("Businesses create them in their workspace's Discounts tab.")}
      >
        <div className="space-y-0.5 rounded-radius-lg bg-card p-1.5">
          {filtered.map((r) => (
            <div key={r.id} className={cn("flex flex-wrap items-center gap-3 rounded-radius-md p-3", r.state === "ended" && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-title font-semibold text-foreground">
                  {r.providerName ?? "—"}
                  <span className="font-normal text-muted-foreground">{" · "}{KIND[r.kind]} {valueOf(r)}{r.title ? ` · ${r.title}` : ""}</span>
                </p>
                <p className="truncate text-meta text-muted-foreground">
                  {r.state === "hidden" ? tr("Hidden") : r.state[0].toUpperCase() + r.state.slice(1)}
                  {" · "}{formatDateHN(r.starts_at, { month: "short", day: "numeric" })} → {r.ends_at ? formatDateHN(r.ends_at, { month: "short", day: "numeric" }) : tr("no end")}
                  {r.platform_share_pct > 0 ? tr(" · Prospera pays {platform_share_pct}%", { platform_share_pct: r.platform_share_pct }) : ""}
                  {tr(" · {orders} orders · {sales} sales · {off} off", { orders: r.stats.orders, sales: formatUSD(r.stats.revenueCents), off: formatUSD(r.stats.discountCents) })}
                </p>
                {r.admin_note && <p className="truncate text-meta text-destructive">{r.admin_note}</p>}
              </div>
              {r.state !== "ended" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={patch.isPending}
                    onClick={async () => {
                      if (r.admin_hidden) { patch.mutate({ id: r.id, body: { hidden: false, note: "" } }); return; }
                      const note = window.prompt(tr("Why is it hidden? The owner sees this."), tr("The crossed-out price doesn't match the usual price."));
                      if (note !== null) patch.mutate({ id: r.id, body: { hidden: true, note } });
                    }}>
                    {r.admin_hidden ? tr("Show") : tr("Hide")}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={patch.isPending}
                    onClick={async () => {
                      if (await confirm({ title: tr("End this discount for {value}?", { value: r.providerName ?? tr("the business") }), description: tr("It stops at once and can't be restarted."), confirmLabel: tr("End discount") })) {
                        patch.mutate({ id: r.id, body: { status: "ended" } });
                      }
                    }}>{tr("End")}</Button>
                </div>
              )}
            </div>
          ))}
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

function SettingsCard({ initial }: { initial: Payload["settings"] }) {
  const qc = useQueryClient();
  const [maxPct, setMaxPct] = useState(String(initial.maxPct));
  const [maxLive, setMaxLive] = useState(String(initial.maxLive));
  useEffect(() => { setMaxPct(String(initial.maxPct)); setMaxLive(String(initial.maxLive)); }, [initial]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi("/admin/discounts/settings", {
        method: "PUT", body: JSON.stringify({ maxPct: Number(maxPct), maxLive: Number(maxLive) }),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(tr("Limits saved")); void qc.invalidateQueries({ queryKey: ["admin-discounts"] }); },
    onError: (e: Error) => toast.error(e.message || tr("Could not save")),
  });
  return (
    <section className="mb-4 space-y-3 rounded-radius-lg bg-card p-4">
      <div>
        <h2 className="text-title font-semibold text-foreground">{tr("Limits")}</h2>
        <p className="text-meta text-muted-foreground">{tr("Apply to new discounts and to every checkout: no order is discounted past the ceiling.")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input inputSize="sm" label={tr("Largest discount, %")} type="number" min={1} max={90} value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
        <Input inputSize="sm" label={tr("Discounts per business at once")} type="number" min={1} max={20} value={maxLive} onChange={(e) => setMaxLive(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{tr("Save limits")}</Button>
      </div>
    </section>
  );
}

/** A Prospera-wide sale: businesses opt in from their Discounts tab; the platform can pay a share. */
function CampaignsCard({ campaigns }: { campaigns: Campaign[] }) {
  const qc = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const today = todayHN();
  const [f, setF] = useState({ title: "", description: "", startsOn: today, endsOn: addDaysISO(today, 3), minPercentOff: "10", platformSharePct: "0" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi("/admin/discount-campaigns", {
        method: "POST",
        body: JSON.stringify({ ...f, minPercentOff: Number(f.minPercentOff), platformSharePct: Number(f.platformSharePct) }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Campaign created — businesses see it in their Discounts tab"));
      setF((v) => ({ ...v, title: "", description: "" }));
      void qc.invalidateQueries({ queryKey: ["admin-discounts"] });
    },
    onError: (e: Error) => toast.error(e.message || tr("Could not create it")),
  });
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await adminApi(`/admin/discount-campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(tr("Campaign ended")); void qc.invalidateQueries({ queryKey: ["admin-discounts"] }); },
    onError: (e: Error) => toast.error(e.message || tr("Could not end it")),
  });
  const open = campaigns.filter((k) => k.status === "active" && Date.parse(k.ends_at) > Date.now());

  return (
    <section className="mb-4 space-y-3 rounded-radius-lg bg-card p-4">
      {confirmDialog}
      <div>
        <h2 className="text-title font-semibold text-foreground">{tr("Prospera-wide sales")}</h2>
        <p className="text-meta text-muted-foreground">{tr("Businesses join with one tap. If Prospera pays a share, that part of every discount comes out of the commission, not the business's earnings.")}</p>
      </div>
      {open.map((k) => (
        <div key={k.id} className="flex items-center gap-3 rounded-radius-md bg-inset p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-foreground">{k.title}</p>
            <p className="truncate text-meta text-muted-foreground">
              {formatDateHN(k.starts_at, { month: "short", day: "numeric" })} → {formatDateHN(k.ends_at, { month: "short", day: "numeric" })}
              {tr(" · from {min}% · Prospera pays {share}%", { min: k.min_percent_off, share: k.platform_share_pct })}
            </p>
          </div>
          <Button size="sm" variant="secondary" loading={end.isPending && end.variables === k.id}
            onClick={async () => {
              if (await confirm({ title: tr("End {title}?", { title: k.title }), description: tr("Every business's sale in it ends too."), confirmLabel: tr("End campaign") })) end.mutate(k.id);
            }}>{tr("End")}</Button>
        </div>
      ))}
      <div className="grid gap-3 md:grid-cols-2">
        <Input inputSize="sm" label={tr("Title")} value={f.title} onChange={set("title")} placeholder={tr("Black Friday")} maxLength={80} />
        <Input inputSize="sm" label={tr("What businesses read (optional)")} value={f.description} onChange={set("description")} maxLength={400} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Input inputSize="sm" label={tr("Starts")} type="date" min={today} value={f.startsOn} onChange={set("startsOn")} />
        <Input inputSize="sm" label={tr("Ends")} type="date" min={f.startsOn} value={f.endsOn} onChange={set("endsOn")} />
        <Input inputSize="sm" label={tr("At least, % off")} type="number" min={1} max={90} value={f.minPercentOff} onChange={set("minPercentOff")} />
        <Input inputSize="sm" label={tr("Prospera pays, %")} type="number" min={0} max={100} value={f.platformSharePct} onChange={set("platformSharePct")} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={f.title.trim().length < 2 || !f.endsOn || f.endsOn < f.startsOn} loading={create.isPending} onClick={() => create.mutate()}>{tr("Start campaign")}</Button>
      </div>
    </section>
  );
}
