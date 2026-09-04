import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, Car, Pencil, Plus } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { TabPills } from "@/components/admin/TabPills";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { VehicleEditDialog } from "@/features/vehicles";
import { carPath } from "@/features/vehicles";
import type { RentalVehicle } from "@/features/vehicles";
import { fetchUsersByIds, customerNameFrom } from "@/lib/admin/customerNames";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/patterns/StatusPill";
import { VehicleTypesPanel, useVehicleTypes } from "@/features/vehicles";
import { useTabParam } from "@/hooks/useTabParam";
import { VEHICLES_UNIT } from "@/lib/services/vehiclesUnit";

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

/** Where a booking is in its life, in the words the fleet uses. */
const STAGES = ["pending", "confirmed", "active", "completed", "cancelled"] as const;


const day = (iso?: string | null) => (iso ? format(new Date(`${iso}T00:00:00`), "MMM d") : "—");

/**
 * Bookings and fleet for car rentals.
 *
 * One screen, two audiences, which is why it takes `providerId` rather than
 * existing twice. Unscoped it is the platform's view of every rental company;
 * scoped and embedded it is the Fleet tab inside one business's own workspace.
 * The alternative was a second component editing the same cars — which is
 * exactly the duplication the rest of the admin already removed by turning
 * per-service pages into workspace tabs.
 */
export default function CarRentals({ embedded = false, providerId }: {
  /** Skip the admin chrome: something else is already providing it. */
  embedded?: boolean;
  /** Limit everything to one business, and lock the editor to it. */
  providerId?: string;
} = {}) {
  const qc = useQueryClient();
  // In the URL, like every other drill-down: a reload or a Back used to drop
  // the admin back on Bookings from whatever tab they were working in.
  const [tab, setTab] = useTabParam(
    embedded ? (["bookings", "fleet"] as const) : (["bookings", "fleet", "types", "providers"] as const),
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  // Which car the editor is open on: a row to edit, "new" to add, null closed.
  const [editing, setEditing] = useState<RentalVehicle | "new" | null>(null);

  const bookingsQ = useQuery({
    queryKey: ["admin-rental-bookings", providerId ?? "all"],
    queryFn: async () => {
      let q = supabaseDb
        .from("rental_bookings")
        .select("*, rental_vehicles(name, image_url)")
        .is("deleted_at", null);
      if (providerId) q = q.eq("provider_id", providerId);
      const { data, error } = await q.order("start_date", { ascending: false });
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
    queryKey: ["admin-rental-vehicles", providerId ?? "all"],
    enabled: tab === "fleet",
    queryFn: async () => {
      let q = supabaseDb
        .from("rental_vehicles")
        .select("*, provider:providers(id, name)");
      if (providerId) q = q.eq("provider_id", providerId);
      const { data, error } = await q.order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  /** Type labels for the fleet rows — the unit's own types. */
  const typesQ = useVehicleTypes({ activeOnly: false, enabled: tab === "fleet" });
  const typeLabel = (key: string | null | undefined) =>
    key ? typesQ.data?.find((t) => t.key === key)?.label ?? key : null;

  const companiesQ = useQuery({
    queryKey: ["transport-providers"],
    enabled: tab === "providers" && !providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, status, admin_user_id, avatar_url")
        .eq("unit", VEHICLES_UNIT)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; name: string; status: string;
        admin_user_id: string | null; avatar_url: string | null;
      }>;
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
      {/* Same drill-down shape as a Marketplace service: the unit's own nouns
          (Vehicles, Bookings) beside the shared lists, mounted embedded. */}
      <TabPills
        className="mb-4"
        tabs={(embedded
          ? ([["bookings", "Bookings"], ["fleet", "Vehicles"]] as const)
          : ([
              ["bookings", "Bookings"], ["fleet", "Vehicles"], ["types", "Types"],
              ["providers", "Providers"],
            ] as const)
        ).map(([value, label]) => ({ value, label }))}
        value={tab}
        onChange={setTab}
      />

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
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            }
            actions={
              <Link to={carPath()}>
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
                      <StatusPill status={b.status} />
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
                    <SelectTrigger className="w-[130px] shrink-0 sm:w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </AdminListShell>
        </>
      ) : tab === "fleet" ? (
        <AdminListShell
          isLoading={vehiclesQ.isLoading}
          isError={vehiclesQ.isError}
          error={vehiclesQ.error}
          onRetry={() => vehiclesQ.refetch()}
          isEmpty={!vehiclesQ.isLoading && (vehiclesQ.data ?? []).length === 0}
          count={(vehiclesQ.data ?? []).length}
          emptyTitle="No vehicles yet"
          emptySubtitle="Add the first one and it appears in the storefront."
          actions={
            <Button className="gap-2" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Add vehicle
            </Button>
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[15px] font-semibold text-foreground">{v.name}</p>
                    {typeLabel(v.category_key) && (
                      <Badge className="bg-muted text-[10px] uppercase text-muted-foreground">{typeLabel(v.category_key)}</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[v.brand, v.model, v.year].filter(Boolean).join(" · ")} · {v.seats} seats
                  </p>
                  {/* A car with no business behind it earns nobody anything —
                      say so here rather than letting it look ordinary. */}
                  <p className={cn("truncate text-[11px] font-semibold", v.provider?.name ? "text-muted-foreground" : "text-amber-500")}>
                    {v.provider?.name ?? "No business assigned"}
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
                <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" onClick={() => setEditing(v)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            ))}
          </div>
        </AdminListShell>
      ) : null}

      {/* Transport's own type editor — a "Motorbikes" row typed here becomes a
          storefront chip and an option in the vehicle editor, no code. */}
      {tab === "types" && <VehicleTypesPanel />}

      {tab === "providers" && (
        <AdminListShell
          isLoading={companiesQ.isLoading}
          isError={companiesQ.isError}
          error={companiesQ.error}
          onRetry={() => companiesQ.refetch()}
          isEmpty={!companiesQ.isLoading && (companiesQ.data ?? []).length === 0}
          count={(companiesQ.data ?? []).length}
          emptyTitle="No rental providers yet"
          emptySubtitle="Approve an application, or add one from Marketplace → All providers."
        >
          <div className="space-y-space-2">
            {(companiesQ.data ?? []).map((c) => (
              <Link
                key={c.id}
                to={`/my-provider/${c.id}`}
                className="flex items-center gap-space-3 rounded-radius-md bg-card p-space-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-radius-md bg-muted">
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                    : <Car className="h-5 w-5 text-muted-foreground/40" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-foreground">{c.name}</p>
                  {/* A business nobody owns cannot be paid, and nobody can open
                      its workspace — worth saying here rather than at payout time. */}
                  <p className={cn("truncate text-xs", c.admin_user_id ? "text-muted-foreground" : "text-amber-500")}>
                    {c.admin_user_id ? c.status : `${c.status} · no owner`}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </AdminListShell>
      )}

      <VehicleEditDialog
        vehicle={editing}
        lockedProviderId={providerId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          // Both caches hold cars: this page's list and the storefront's own.
          void qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
          void qc.invalidateQueries({ queryKey: ["rental-vehicles"] });
        }}
      />
    </div>
  );

  if (embedded) return body;

  return (
    <SuperAdminLayout title="Vehicles" subtitle="Types, providers, vehicles and bookings — the vehicles unit">
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
