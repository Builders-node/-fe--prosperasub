import { useEffect, useMemo, useState } from "react";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, Car, MoreVertical, Pencil, Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { TabPills } from "@/components/admin/TabPills";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { VehicleEditDialog } from "@/features/vehicles";
import { carPath, fleetWrite } from "@/features/vehicles";
import type { RentalVehicle } from "@/features/vehicles";
import { fetchUsersByIds, customerNameFrom } from "@/lib/admin/customerNames";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { StatusPill, statusLabel } from "@/components/patterns/StatusPill";
import { VehicleTypesPanel, useVehicleTypes, RentalTermsTab } from "@/features/vehicles";
import {
  FleetCalendar, FleetPulse, NewRentalDialog, RentalBookingSheet, useFleet, FLEET_KEY, type NewRentalSeed,
} from "@/features/vehicles";
import { useTabParam } from "@/hooks/useTabParam";
import { VEHICLES_UNIT } from "@/lib/services/vehiclesUnit";
import { useConfirm } from "@/components/patterns/ConfirmDialog";
import { tr, trx, dfLocale } from "@/lib/tr";

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


const day = (iso?: string | null) => (iso ? format(new Date(`${iso}T00:00:00`), "MMM d", { locale: dfLocale }) : "—");

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
export type FleetSection = "schedule" | "bookings" | "fleet"
  /** Old names for "schedule", which merged the two. */
  | "overview" | "calendar";

/** Fleet's own parts: the cars, and the settings that shape them. */
type FleetPart = "vehicles" | "types" | "terms" | "companies";
/** Old top-level tabs that now live inside Fleet — bookmarks still land. */
const LEGACY_PART: Record<string, FleetPart> = { types: "types", terms: "terms", providers: "companies" };

export default function CarRentals({ embedded = false, providerId, section }: {
  /** Skip the admin chrome: something else is already providing it. */
  embedded?: boolean;
  /** Limit everything to one business, and lock the editor to it. */
  providerId?: string;
  /**
   * One screen only, with no tab strip of its own — for the rental company's
   * workspace, whose own tabs ARE these screens. Nesting this page's tabs
   * inside that strip put two rows of tabs on top of each other.
   */
  section?: FleetSection;
} = {}) {
  const qc = useQueryClient();
  // In the URL, like every other drill-down: a reload or a Back used to drop
  // the admin back on Bookings from whatever tab they were working in.
  //
  // Three tabs: the day-to-day work (Schedule, Bookings) and the fleet with
  // its settings. There used to be seven — Overview and Calendar showed the
  // same cars twice, and Types, Insurance and Providers sat between them as
  // if they were daily work.
  const [tabParam, setTab] = useTabParam(["schedule", "bookings", "fleet"] as const);
  const [partParam, setPart] = useTabParam(
    (providerId ? ["vehicles", "terms"] : ["vehicles", "types", "terms", "companies"]) as readonly FleetPart[],
    { key: "part" },
  );
  const [params, setParams] = useSearchParams();
  const legacy = params.get("tab");
  useEffect(() => {
    if (section || !legacy || !LEGACY_PART[legacy]) return;
    const q = new URLSearchParams(params);
    q.set("tab", "fleet"); q.set("part", LEGACY_PART[legacy]);
    setParams(q, { replace: true });
  }, [legacy]); // eslint-disable-line react-hooks/exhaustive-deps
  const tab: "schedule" | "bookings" | "fleet" =
    section === "overview" || section === "calendar" ? "schedule" : section ?? tabParam;
  const part: FleetPart = section ? "vehicles" : partParam;
  /** Everything the operations screens read, in one query (features/vehicles/admin). */
  const fleetQ = useFleet(providerId);
  const fleet = fleetQ.data;
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const openBooking = fleet?.bookings.find((b) => b.id === openBookingId) ?? null;
  const [newSeed, setNewSeed] = useState<NewRentalSeed | null>(null);
  const [termsProvider, setTermsProvider] = useState<string>(providerId ?? "");
  const removeBlock = async (id: string, label: string) => {
    if (!(await confirm({ title: tr("Unblock {label}?", { label }), description: tr("Customers can book those days again."), confirmLabel: tr("Unblock"), destructive: false }))) return;
    const { error } = await adminApi(`/admin/rentals/blocks/${id}`, { method: "DELETE" });
    if (error) { toast.error(error.message); return; }
    toast.success(tr("Unblocked"));
    void qc.invalidateQueries({ queryKey: [FLEET_KEY] });
  };
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
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
    // The schedule's per-car "Edit vehicle" opens the same editor.
    enabled: tab === "fleet" || tab === "schedule",
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
  const typesQ = useVehicleTypes({ activeOnly: false, enabled: tab === "fleet" && part === "vehicles" });
  const typeLabel = (key: string | null | undefined) =>
    key ? typesQ.data?.find((t) => t.key === key)?.label ?? key : null;

  const companiesQ = useQuery({
    queryKey: ["transport-providers"],
    enabled: tab === "fleet" && (part === "companies" || part === "terms") && !providerId,
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

  const toggleVehicle = async (v: any) => {
    const next = v.status === "public" ? "private" : "public";
    // Through the API: the browser lost write access to rental_* tables
    // (migration 20261113120000), so a direct update here only ever failed.
    const { error } = await fleetWrite("rental_vehicles", "update", { id: v.id, row: { status: next } });
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
    void qc.invalidateQueries({ queryKey: [FLEET_KEY] });
    toast.success(next === "public" ? tr("Car is listed") : tr("Car is hidden"));
  };

  const body = (
    <div className="space-y-space-4">
      {confirmDialog}
      <div className="flex items-center justify-between gap-2">
        {!section && <div className="min-w-0"><TabPills
          tabs={[
            { value: "schedule", label: tr("Schedule") },
            { value: "bookings", label: tr("Bookings") },
            { value: "fleet", label: tr("Fleet") },
          ]}
          value={tab}
          onChange={setTab}
        /></div>}
        {tab !== "fleet" && (
          <>
            {/* Icon-only on a phone, so the three tabs keep their line. */}
            <Button size="icon" className="ml-auto shrink-0 sm:hidden" aria-label={tr("New booking")} onClick={() => setNewSeed({ mode: "booking" })} disabled={!fleet?.vehicles.length}>
              <Plus />
            </Button>
            <Button className="ml-auto hidden shrink-0 gap-2 sm:inline-flex" onClick={() => setNewSeed({ mode: "booking" })} disabled={!fleet?.vehicles.length}>
              <Plus className="h-4 w-4" />{" "}{tr("New booking")}</Button>
          </>
        )}
      </div>

      {tab === "schedule" && (
        fleetQ.isLoading ? <div className="h-64 animate-pulse rounded-radius-lg bg-card" />
        : fleetQ.isError ? <p className="rounded-radius-lg bg-card p-4 text-body text-negative">{trx("Couldn't load the fleet: {message}", { message: (fleetQ.error as Error)?.message })}</p>
        : (
          <>
            <FleetPulse vehicles={fleet!.vehicles} bookings={fleet!.bookings} blocks={fleet!.blocks} onOpenBooking={(b) => setOpenBookingId(b.id)} />
            <FleetCalendar vehicles={fleet!.vehicles} bookings={fleet!.bookings} blocks={fleet!.blocks}
              onOpenBooking={(b) => setOpenBookingId(b.id)}
              onOpenBlock={(k) => void removeBlock(k.id, `${k.start_date} → ${k.end_date}${k.reason ? ` (${k.reason})` : ""}`)}
              onNew={(vehicleId, date, endDate, mode) => setNewSeed({ vehicleId, date, endDate, mode: mode ?? "booking" })}
              onEditVehicle={(id) => { const v = vehiclesQ.data?.find((x) => x.id === id); if (v) setEditing(v); }}
              onToggleVehicle={(id) => { const v = vehiclesQ.data?.find((x) => x.id === id) ?? fleet!.vehicles.find((x) => x.id === id); if (v) void toggleVehicle(v); }}
            />
          </>
        )
      )}

      {/* Fleet: the cars first, then what shapes them. */}
      {tab === "fleet" && !section && (
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {([
            ["vehicles", "Vehicles"],
            ...(providerId ? [] : [["types", "Types"]]),
            ["terms", tr("Insurance & extras")],
            ...(providerId ? [] : [["companies", tr("Rental companies")]]),
          ] as Array<[FleetPart, string]>).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setPart(value)} aria-pressed={part === value}
              className={cn("h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors",
                part === value ? "bg-inset text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "fleet" && part === "terms" && (
        <div className="space-y-3">
          {!providerId && (
            <select value={termsProvider} onChange={(e) => setTermsProvider(e.target.value)} aria-label={tr("Rental company")}
              className="h-11 w-full max-w-sm rounded-radius-md bg-card px-3 text-body text-foreground">
              <option value="">{tr("Choose a rental company…")}</option>
              {(companiesQ.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {termsProvider
            ? <RentalTermsTab providerId={termsProvider} canManage />
            : <p className="rounded-radius-lg bg-card p-4 text-body text-muted-foreground">{tr("Each rental company has its own insurance, extras and delivery zones — choose one.")}</p>}
        </div>
      )}

      {tab === "bookings" ? (
        <>
          {/* Money first: what has been collected, and what is still owed. */}
          <div className="grid grid-cols-3 gap-1 md:gap-space-3">
            <Stat label={tr("Bookings")} value={String(filtered.length)} />
            <Stat label={tr("Collected")} value={formatUSD(totals.paidCents)} />
            <Stat
              label={totals.owedCount ? tr("Unpaid · {owedCount}", { owedCount: totals.owedCount }) : tr("Unpaid")}
              value={formatUSD(totals.owedCents)}
              tone={totals.owedCents > 0 ? "text-attention" : undefined}
            />
          </div>

          <AdminListShell
            search={search}
            onSearch={setSearch}
            searchPlaceholder={tr("Search customer, car, phone…")}
            filters={
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger inputSize="sm" className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr("All statuses")}</SelectItem>
                  {STAGES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            }
            actions={
              <Button variant="secondary" size="sm" className="gap-2" asChild>
                <Link to={carPath()}><ArrowUpRight className="h-4 w-4" />{" "}{tr("Storefront")}</Link>
              </Button>
            }
            isLoading={bookingsQ.isLoading}
            isError={bookingsQ.isError}
            error={bookingsQ.error}
            onRetry={() => bookingsQ.refetch()}
            isEmpty={!bookingsQ.isLoading && bookings.length === 0}
            isNoResults={bookings.length > 0 && filtered.length === 0}
            onClearFilters={() => { setSearch(""); setStatus("all"); }}
            count={filtered.length}
            emptyTitle={tr("No car bookings yet")}
            emptySubtitle={tr("Rentals booked in the car storefront land here.")}
          >
            {/* One compact row per booking; the actions live in its menu so
                nothing wraps under the card on a phone. */}
            <div className="space-y-0.5 rounded-radius-lg bg-card p-1.5">
              {filtered.map((b) => (
                <button type="button" key={b.id} onClick={() => setOpenBookingId(b.id)}
                  className="flex w-full items-start gap-3 rounded-radius-md p-2.5 text-left transition-colors hover:bg-inset">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-radius-md bg-muted sm:w-16">
                    <Photo src={b.rental_vehicles?.image_url} icon={Car} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate text-title font-semibold text-foreground">{b.customer}</p>
                      <StatusPill status={b.payment_status !== "paid" && b.status !== "cancelled" ? "unpaid" : b.status} className="shrink-0" />
                    </div>
                    <p className="truncate text-meta text-muted-foreground">{b.rental_days === 1 ? trx("{value} · {day} → {day2} · {rental_days} day", { value: b.rental_vehicles?.name ?? tr("Car"), day: day(b.start_date), day2: day(b.end_date), rental_days: b.rental_days }) : trx("{value} · {day} → {day2} · {rental_days} days", { value: b.rental_vehicles?.name ?? tr("Car"), day: day(b.start_date), day2: day(b.end_date), rental_days: b.rental_days })}
                    </p>
                    <p className="truncate text-meta text-muted-foreground">
                      {[b.email, b.customer_whatsapp, b.delivery_address].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-title font-semibold tabular-nums text-foreground">{formatUSD(b.total_cents)}</p>
                    <p className="text-meta text-muted-foreground">{b.payment_method ?? "—"}</p>
                  </div>
                </button>
              ))}
            </div>
          </AdminListShell>
        </>
      ) : tab === "fleet" && part === "vehicles" ? (
        <AdminListShell
          isLoading={vehiclesQ.isLoading}
          isError={vehiclesQ.isError}
          error={vehiclesQ.error}
          onRetry={() => vehiclesQ.refetch()}
          isEmpty={!vehiclesQ.isLoading && (vehiclesQ.data ?? []).length === 0}
          count={(vehiclesQ.data ?? []).length}
          emptyTitle={tr("No vehicles yet")}
          emptySubtitle={tr("Add the first one and it appears in the storefront.")}
          actions={
            <Button className="gap-2" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />{" "}{tr("Add vehicle")}</Button>
          }
        >
          {providerId ? (
            // One company's own cars: cards, the photo first — a fleet is
            // recognised by its cars, and a full-width row per car on a laptop
            // was a line of text with a kebab 1,500px away.
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(vehiclesQ.data ?? []).map((v) => (
                <div key={v.id} className="overflow-hidden rounded-radius-lg bg-card">
                  <button type="button" onClick={() => setEditing(v)} className="block w-full text-left">
                    <span className={cn("relative block aspect-[16/10] w-full overflow-hidden bg-muted", v.status !== "public" && "opacity-50")}>
                      <Photo src={v.image_url} icon={Car} />
                    </span>
                  </button>
                  <div className="flex items-start gap-2 p-3">
                    <button type="button" onClick={() => setEditing(v)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-title font-semibold text-foreground">{v.name}</span>
                        {v.status !== "public" && <StatusPill status="private" label={tr("Hidden")} />}
                      </span>
                      <span className="mt-0.5 block truncate text-meta text-muted-foreground">
                        {[typeLabel(v.category_key), `${v.seats} seats`].filter(Boolean).join(" · ")}
                      </span>
                      <span className="mt-1 block text-body font-semibold tabular-nums text-foreground">
                        {formatUSD(v.daily_price_cents)}<span className="font-normal text-muted-foreground">{" "}{tr("/ day")}</span>
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="shrink-0" aria-label={tr("Actions for {name}", { name: v.name })}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(v)}><Pencil className="mr-2 h-3.5 w-3.5" />{" "}{tr("Edit")}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleVehicle(v)}>
                          {v.status === "public" ? tr("Hide from the storefront") : tr("Show in the storefront")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-0.5 rounded-radius-lg bg-card p-1.5">
            {(vehiclesQ.data ?? []).map((v) => (
              <div key={v.id} className={cn("flex items-center gap-3 rounded-radius-md p-2.5 transition-colors hover:bg-inset", v.status !== "public" && "opacity-60")}>
                <button type="button" onClick={() => setEditing(v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-radius-md bg-muted sm:w-16">
                    <Photo src={v.image_url} icon={Car} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-title font-semibold text-foreground">{v.name}</span>
                    <span className="block truncate text-meta text-muted-foreground">
                      {[typeLabel(v.category_key), `${formatUSD(v.daily_price_cents)} / day`, `${v.seats} seats`].filter(Boolean).join(" · ")}
                    </span>
                    {/* A car with no business behind it earns nobody anything. */}
                    <span className={cn("block truncate text-meta", v.provider?.name ? "text-muted-foreground" : "font-semibold text-attention")}>
                      {v.provider?.name ?? tr("No business assigned")}{v.status !== "public" ? tr(" · hidden") : ""}
                    </span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="shrink-0" aria-label={tr("Actions for {name}", { name: v.name })}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(v)}><Pencil className="mr-2 h-3.5 w-3.5" />{" "}{tr("Edit")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggleVehicle(v)}>
                      {v.status === "public" ? tr("Hide from the storefront") : tr("Show in the storefront")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
          )}
        </AdminListShell>
      ) : null}

      {/* Transport's own type editor — a "Motorbikes" row typed here becomes a
          storefront chip and an option in the vehicle editor, no code. */}
      {tab === "fleet" && part === "types" && <VehicleTypesPanel />}

      {tab === "fleet" && part === "companies" && (
        <AdminListShell
          isLoading={companiesQ.isLoading}
          isError={companiesQ.isError}
          error={companiesQ.error}
          onRetry={() => companiesQ.refetch()}
          isEmpty={!companiesQ.isLoading && (companiesQ.data ?? []).length === 0}
          count={(companiesQ.data ?? []).length}
          emptyTitle={tr("No rental companies yet")}
          emptySubtitle={tr("Approve an application, or add one from Businesses → New business.")}
        >
          <div className="space-y-space-2">
            {(companiesQ.data ?? []).map((c) => (
              <Link
                key={c.id}
                to={`/my-provider/${c.id}`}
                className="flex items-center gap-space-3 rounded-radius-md bg-card p-space-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-radius-md bg-muted">
                  <Photo src={c.avatar_url} label={initialsOf(c.name)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold text-foreground">{c.name}</p>
                  {/* A business nobody owns cannot be paid, and nobody can open
                      its workspace — worth saying here rather than at payout time. */}
                  <p className={cn("truncate text-xs", c.admin_user_id ? "text-muted-foreground" : "text-attention")}>
                    {(c.status === "active" || c.status === "approved" ? "Live" : c.status === "inactive" ? "Hidden" : "Draft") + (c.admin_user_id ? "" : tr(" · no owner"))}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </AdminListShell>
      )}

      <RentalBookingSheet
        booking={openBooking}
        vehicle={fleet?.vehicles.find((v) => v.id === openBooking?.vehicle_id) ?? null}
        onClose={() => setOpenBookingId(null)}
      />
      <NewRentalDialog open={!!newSeed} seed={newSeed} vehicles={fleet?.vehicles ?? []} onClose={() => setNewSeed(null)} />

      <VehicleEditDialog
        vehicle={editing}
        lockedProviderId={providerId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          // Every cache holding cars: this page's list, the schedule, the storefront.
          void qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
          void qc.invalidateQueries({ queryKey: [FLEET_KEY] });
          void qc.invalidateQueries({ queryKey: ["rental-vehicles"] });
        }}
      />
    </div>
  );

  if (embedded) return body;

  return (
    <SuperAdminLayout title={tr("Vehicles")} subtitle={tr("Which car is free when, the bookings, and the fleet itself")}>
      {body}
    </SuperAdminLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-radius-lg bg-card p-3">
      <p className="truncate text-meta text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-title font-semibold tabular-nums text-foreground md:text-heading", tone)}>{value}</p>
    </div>
  );
}
