import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, Car } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { fetchUsersByIds, customerNameFrom } from "@/lib/admin/customerNames";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { carPath } from "@/pages/vehicles/routes";

/**
 * Car rentals, run from the same admin as everything else.
 *
 * The rental storefront lives on its own origin with a thin admin of its own,
 * which meant the one business on the platform whose orders never appeared
 * where the team actually works. Rentals are booked, not subscribed, so they do
 * not fit the provider workspace — that is built around plans and
 * subscriptions, and a car has vehicles and days. They get a section that
 * speaks their own nouns instead.
 */

/** The car section of this app; the storefront these bookings come from. */
const STORE_PATH = carPath();

/** Where a booking is in its life, in the words the fleet uses. */
const STAGES = ["pending", "confirmed", "active", "completed", "cancelled"] as const;

const TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-500",
  active:    "bg-emerald-500/15 text-emerald-500",
  completed: "bg-muted text-muted-foreground",
  pending:   "bg-amber-500/15 text-amber-500",
  cancelled: "bg-red-500/15 text-red-500",
};

const day = (iso?: string | null) => (iso ? format(new Date(`${iso}T00:00:00`), "MMM d") : "—");

export default function CarRentals() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"bookings" | "fleet">("bookings");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const bookingsQ = useQuery({
    queryKey: ["admin-rental-bookings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*, rental_vehicles(name, image_url)")
        .is("deleted_at", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      // Names via the guarded helper — rental_bookings.user_id is text and can
      // hold a Google-sub id, which would 400 the whole batch on its own.
      const users = await fetchUsersByIds(rows.map((r) => r.user_id));
      return rows.map((r) => ({
        ...r,
        customer: customerNameFrom({
          user: users.get(String(r.user_id)),
          customerName: r.customer_name,
          fallback: "—",
        }),
        email: users.get(String(r.user_id))?.email ?? null,
      }));
    },
  });

  const vehiclesQ = useQuery({
    queryKey: ["admin-rental-vehicles"],
    enabled: tab === "fleet",
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_vehicles").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const bookings = bookingsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (!q) return true;
      return [b.customer, b.email, b.rental_vehicles?.name, b.customer_whatsapp, b.delivery_address]
        .some((f) => String(f ?? "").toLowerCase().includes(q));
    });
  }, [bookings, search, status]);

  /** What is owed and what has been taken — the two numbers a fleet asks for. */
  const totals = useMemo(() => {
    const paid = filtered.filter((b) => b.payment_status === "paid");
    const owed = filtered.filter((b) => b.payment_status !== "paid" && b.status !== "cancelled");
    return {
      paidCents: paid.reduce((s, b) => s + (Number(b.total_cents) || 0), 0),
      owedCents: owed.reduce((s, b) => s + (Number(b.total_cents) || 0), 0),
      owedCount: owed.length,
    };
  }, [filtered]);

  const setStage = async (id: string, next: string) => {
    setBusy(id);
    try {
      const patch: Record<string, unknown> = { status: next };
      // Confirming a rental is also saying the money is in — the same coupling
      // the storefront applies when a payment lands.
      if (next === "confirmed" || next === "active" || next === "completed") patch.payment_status = "paid";
      if (next === "cancelled") patch.payment_status = "failed";
      const { error } = await supabaseDb.from("rental_bookings").update(patch).eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["admin-rental-bookings"] });
      toast.success(`Booking marked ${next}`);
    } catch (e) {
      toast.error((e as Error).message || "Could not update the booking");
    } finally {
      setBusy(null);
    }
  };

  const toggleVehicle = async (v: any) => {
    const next = v.status === "public" ? "private" : "public";
    const { error } = await supabaseDb.from("rental_vehicles").update({ status: next }).eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
    toast.success(next === "public" ? "Car is listed" : "Car is hidden");
  };

  const body = (
    <div className="space-y-space-4">
      {/* Same pill strip as the route-based AdminPageTabs, but these two are
          one page: the fleet and its bookings are read together. */}
      <div className="mb-4 inline-flex gap-1 rounded-full bg-muted/50 p-1">
        {([["bookings", "Bookings"], ["fleet", "Fleet"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              tab === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "bookings" ? (
        <>
          {/* Money first: what has been collected, and what is still owed. */}
          <div className="grid grid-cols-2 gap-space-3 md:grid-cols-3">
            <Stat label="Bookings" value={String(filtered.length)} />
            <Stat label="Collected" value={formatUSD(totals.paidCents)} />
            <Stat
              label={totals.owedCount ? `Awaiting payment · ${totals.owedCount}` : "Awaiting payment"}
              value={formatUSD(totals.owedCents)}
              tone={totals.owedCents > 0 ? "text-amber-500" : undefined}
            />
          </div>

          <AdminListShell
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search customer, car, phone…"
            filters={
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            }
            actions={
              <Link to={STORE_PATH}>
                <Button variant="secondary" className="gap-2">
                  <ArrowUpRight className="h-4 w-4" /> Storefront
                </Button>
              </Link>
            }
            isLoading={bookingsQ.isLoading}
            isError={bookingsQ.isError}
            error={bookingsQ.error}
            onRetry={() => bookingsQ.refetch()}
            isEmpty={!bookingsQ.isLoading && bookings.length === 0}
            isNoResults={bookings.length > 0 && filtered.length === 0}
            onClearFilters={() => { setSearch(""); setStatus("all"); }}
            count={filtered.length}
            emptyTitle="No car bookings yet"
            emptySubtitle="Rentals booked in the car storefront land here."
          >
            <div className="space-y-space-2">
              {filtered.map((b) => (
                <div key={b.id} className="flex flex-col gap-space-3 rounded-radius-md bg-card p-space-3 md:flex-row md:items-center">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-[8px] bg-muted">
                    {b.rental_vehicles?.image_url
                      ? <img src={b.rental_vehicles.image_url} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center"><Car className="h-6 w-6 text-muted-foreground/40" /></div>}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-semibold text-foreground">{b.customer}</p>
                      <Badge className={cn("uppercase", TONE[b.status] ?? "bg-muted text-muted-foreground")}>{b.status}</Badge>
                      {b.payment_status !== "paid" && b.status !== "cancelled" && (
                        <Badge className="bg-amber-500/15 text-amber-500">unpaid</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.rental_vehicles?.name ?? "Car"} · {day(b.start_date)} → {day(b.end_date)} · {b.rental_days}d
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[b.email, b.customer_whatsapp, b.delivery_address].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>

                  <div className="text-right md:w-28">
                    <p className="text-[15px] font-semibold tabular-nums text-foreground">{formatUSD(b.total_cents)}</p>
                    <p className="text-xs text-muted-foreground">{b.payment_method ?? "—"}</p>
                  </div>

                  {/* One control, not five buttons: a booking has a stage, and
                      the admin moves it. */}
                  <Select value={b.status} onValueChange={(v) => setStage(b.id, v)} disabled={busy === b.id}>
                    <SelectTrigger className="w-[150px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </AdminListShell>
        </>
      ) : (
        <AdminListShell
          isLoading={vehiclesQ.isLoading}
          isError={vehiclesQ.isError}
          error={vehiclesQ.error}
          onRetry={() => vehiclesQ.refetch()}
          isEmpty={!vehiclesQ.isLoading && (vehiclesQ.data ?? []).length === 0}
          count={(vehiclesQ.data ?? []).length}
          emptyTitle="No cars in the fleet"
          emptySubtitle="Add them from the storefront's fleet admin."
          actions={
            <Link to={carPath("admin/vehicles")}>
              <Button variant="secondary" className="gap-2">
                <ArrowUpRight className="h-4 w-4" /> Edit fleet
              </Button>
            </Link>
          }
        >
          <div className="space-y-space-2">
            {(vehiclesQ.data ?? []).map((v) => (
              <div key={v.id} className="flex items-center gap-space-3 rounded-radius-md bg-card p-space-3">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-[8px] bg-muted">
                  {v.image_url
                    ? <img src={v.image_url} alt="" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center"><Car className="h-6 w-6 text-muted-foreground/40" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-foreground">{v.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[v.brand, v.model, v.year].filter(Boolean).join(" · ")} · {v.seats} seats
                  </p>
                </div>
                <p className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
                  {formatUSD(v.daily_price_cents)}<span className="text-xs font-normal text-muted-foreground">/day</span>
                </p>
                <Button
                  variant={v.status === "public" ? "ghost" : "secondary"}
                  size="sm"
                  className="shrink-0"
                  onClick={() => toggleVehicle(v)}
                >
                  {v.status === "public" ? "Listed" : "Hidden"}
                </Button>
              </div>
            ))}
          </div>
        </AdminListShell>
      )}
    </div>
  );

  return (
    <SuperAdminLayout title="Car rentals" subtitle="Bookings and fleet from the car storefront">
      {body}
    </SuperAdminLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-radius-md bg-card p-space-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[20px] font-semibold tabular-nums tracking-[-0.4px] text-foreground", tone)}>{value}</p>
    </div>
  );
}
