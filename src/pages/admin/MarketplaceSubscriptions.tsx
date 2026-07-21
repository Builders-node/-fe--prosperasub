import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronsUpDown, ChevronUp, ChevronDown, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { cn } from "@/lib/utils";

type SortKey = "name" | "date" | "service";

interface Provider { id: string; name: string; archetype_key: string | null; }
interface Plan { id: string; name: string; }
interface UserRow { id: string; name: string | null; display_name: string | null; email: string | null; }

/**
 * Union row that flattens `provider_subscriptions` and `provider_bookings`
 * into the same shape. Subs use start_date/end_date (dates), bookings use
 * start_at/end_at (timestamps). We normalize to ISO-day strings for display
 * and carry a `kind` marker so admins can tell them apart at a glance.
 */
interface SaleRow {
  id: string;
  kind: "subscription" | "booking";
  provider_id: string;
  plan_id: string | null;
  user_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  price_cents: number | null;
  payment_reference: string | null;
  source_service_key: string | null;
  created_at: string;
}

/**
 * A single derived "Stage" that combines status + payment_status into one
 * lifecycle label admins actually think about:
 *   - awaiting payment: no money in yet
 *   - active:           paid + running
 *   - paused | expired | cancelled: terminal or on-hold states
 *   - refunded:         money returned
 */
function subscriptionStage(s: SaleRow): { label: string; className: string } {
  if (s.payment_status === "refunded") return { label: "Refunded",         className: "bg-purple-500/15 text-purple-400" };
  if (s.status === "cancelled")        return { label: "Cancelled",        className: "bg-red-500/15 text-red-400" };
  if (s.status === "expired")          return { label: "Expired",          className: "bg-red-500/15 text-red-400" };
  if (s.status === "paused")           return { label: "Paused",           className: "bg-yellow-500/15 text-yellow-400" };
  if (s.payment_status !== "paid")     return { label: "Awaiting payment", className: "bg-amber-500/15 text-amber-400" };
  return { label: "Active", className: "bg-green-500/15 text-green-400" };
}

/**
 * Universal admin list of every recurring purchase on the platform. Reads
 * `provider_subscriptions` and joins providers/plans by id.
 */
const MarketplaceSubscriptions = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { archetypes } = useServiceArchetypes(false);
  const [service, setService] = useState("all");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [kind, setKind] = useState<"all" | "subscription" | "booking">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editRow, setEditRow] = useState<SaleRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<SaleRow | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["marketplace-subscriptions"] });
    qc.invalidateQueries({ queryKey: ["marketplace-bookings"] });
  };

  /** Table + column name for the underlying row of a SaleRow. */
  const backing = (s: SaleRow) => s.kind === "subscription"
    ? { table: "provider_subscriptions", startCol: "start_date", endCol: "end_date",   priceCol: "price_cents"       }
    : { table: "provider_bookings",      startCol: "start_at",   endCol: "end_at",     priceCol: "total_price_cents" };

  const updateMutation = useMutation({
    mutationFn: async ({ row, patch }: { row: SaleRow; patch: Record<string, any> }) => {
      const b = backing(row);
      const { error } = await supabaseDb.from(b.table).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", row.kind === "subscription" ? "provider_subscription" : "provider_booking", row.id, patch);
    },
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditRow(null); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: SaleRow) => {
      const b = backing(row);
      const { error } = await supabaseDb.from(b.table).delete().eq("id", row.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", row.kind === "subscription" ? "provider_subscription" : "provider_booking", row.id, {});
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); setDeleteRow(null); },
    onError: (e: any) => toast.error(e?.message || "Could not delete"),
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const { data: providers = [] } = useQuery({
    queryKey: ["marketplace-providers-slim"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers")
        .select("id, name, archetype_key").order("name");
      if (error) throw error;
      return (data ?? []) as Provider[];
    },
  });
  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  const { data: plans = [] } = useQuery({
    queryKey: ["marketplace-plans-slim"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("provider_plans").select("id, name");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const isoDay = (v?: string | null): string | null => v ? v.slice(0, 10) : null;

  const { data: subs = [], isLoading: subsLoading } = useQuery({
    queryKey: ["marketplace-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("provider_subscriptions")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map<SaleRow>((r) => ({
        id: r.id,
        kind: "subscription",
        provider_id: r.provider_id,
        plan_id: r.plan_id ?? null,
        user_id: r.user_id ?? null,
        start_date: isoDay(r.start_date),
        end_date: isoDay(r.end_date),
        status: r.status,
        payment_status: r.payment_status,
        payment_method: r.payment_method ?? null,
        price_cents: r.price_cents ?? null,
        payment_reference: r.payment_reference ?? null,
        source_service_key: r.source_service_key ?? null,
        created_at: r.created_at,
      }));
    },
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["marketplace-bookings"],
    queryFn: async () => {
      // Rental (and any other archetype using the booking model) lives here.
      // We surface it in the same view so admin sees the whole revenue stream.
      const { data, error } = await supabaseDb.from("provider_bookings")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map<SaleRow>((r) => ({
        id: r.id,
        kind: "booking",
        provider_id: r.provider_id,
        plan_id: r.plan_id ?? null,
        user_id: r.user_id ?? null,
        start_date: isoDay(r.start_at),
        end_date: isoDay(r.end_at),
        status: r.status,
        payment_status: r.payment_status ?? "paid",
        payment_method: r.payment_method ?? null,
        price_cents: r.total_price_cents ?? r.price_cents ?? null,
        payment_reference: r.payment_reference ?? null,
        source_service_key: r.source_service_key ?? null,
        created_at: r.created_at,
      }));
    },
  });

  const isLoading = subsLoading || bookingsLoading;
  const rows = useMemo(() => [...subs, ...bookings], [subs, bookings]);

  const userIds = useMemo(() => Array.from(new Set(rows.map((s) => s.user_id).filter((x): x is string => !!x))), [rows]);
  const { data: users = [] } = useQuery({
    queryKey: ["marketplace-subs-users", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("users").select("id, name, display_name, email").in("id", userIds);
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const userLabel = (id: string | null): string => {
    if (!id) return "—";
    const u = userById.get(id);
    return u?.display_name || u?.name || u?.email || id.slice(0, 8);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      const prov = providerById.get(s.provider_id);
      if (service !== "all" && prov?.archetype_key !== service) return false;
      if (status   !== "all" && s.status         !== status)     return false;
      if (payment  !== "all" && s.payment_status !== payment)    return false;
      if (kind     !== "all" && s.kind           !== kind)       return false;
      if (q) {
        const plan = s.plan_id ? planById.get(s.plan_id) : undefined;
        const user = s.user_id ? userById.get(s.user_id) : undefined;
        if (!(
          (prov?.name ?? "").toLowerCase().includes(q) ||
          (plan?.name ?? "").toLowerCase().includes(q) ||
          userLabel(s.user_id).toLowerCase().includes(q) ||
          (user?.email ?? "").toLowerCase().includes(q) ||
          (s.payment_reference ?? "").toLowerCase().includes(q)
        )) return false;
      }
      return true;
    });
  }, [rows, service, status, payment, kind, search, providerById, planById, userById]);

  const sorted = useMemo(() => {
    const svcLabel = (key?: string | null) => archetypes.find((a) => a.key === key)?.label ?? "";
    const dir = sortDir === "asc" ? 1 : -1;
    return [...visible].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = userLabel(a.user_id).localeCompare(userLabel(b.user_id));
      } else if (sortBy === "service") {
        const prov = (s: SaleRow) => providerById.get(s.provider_id)?.archetype_key ?? null;
        cmp = svcLabel(prov(a)).localeCompare(svcLabel(prov(b)));
      } else {
        // date — prefer start_date, fall back to created_at
        const key = (s: SaleRow) => s.start_date || s.created_at || "";
        cmp = key(a).localeCompare(key(b));
      }
      // stable tiebreak on created_at so equal keys keep a deterministic order
      if (cmp === 0) cmp = (a.created_at || "").localeCompare(b.created_at || "");
      return cmp * dir;
    });
  }, [visible, sortBy, sortDir, archetypes, providerById, userById]);

  return (
    <SuperAdminLayout title="Subscriptions" subtitle="Every recurring subscription and one-off booking across all services">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <FilterBlock label="Service">
            <Select value={service} onValueChange={setService}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {archetypes.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBlock>
          <FilterBlock label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </FilterBlock>
          <FilterBlock label="Payment">
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </FilterBlock>
          <FilterBlock label="Type">
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="booking">Booking</SelectItem>
              </SelectContent>
            </Select>
          </FilterBlock>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search by provider, plan, user, payment ref…"
          isLoading={isLoading} isEmpty={rows.length === 0}
          isNoResults={rows.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No sales yet" emptySubtitle="Subscriptions and bookings will appear here."
          onClearFilters={() => { setSearch(""); setService("all"); setStatus("all"); setPayment("all"); setKind("all"); }}
        >
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <SortHeader label="Customer" sortKey="name" active={sortBy} dir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-bold text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 font-bold text-muted-foreground">Provider</th>
                  <SortHeader label="Service" sortKey="service" active={sortBy} dir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-bold text-muted-foreground">Type</th>
                  <SortHeader label="Period" sortKey="date" active={sortBy} dir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-bold text-muted-foreground">Stage</th>
                  <th className="px-4 py-3 text-right font-bold text-muted-foreground">Amount</th>
                  <th className="w-10 px-2 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const prov = providerById.get(s.provider_id);
                  const plan = s.plan_id ? planById.get(s.plan_id) : undefined;
                  const arche = prov ? archetypes.find((a) => a.key === prov.archetype_key) : undefined;
                  const AIcon = arche?.Icon ?? Building2;
                  const stage = subscriptionStage(s);
                  return (
                    <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{userLabel(s.user_id)}</td>
                      <td className="px-4 py-3">
                        {plan?.name ?? <em className="italic text-muted-foreground/70">no plan</em>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{prov?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", arche?.accent ?? "bg-muted")}>
                            <AIcon className="h-3 w-3 text-white" />
                          </span>
                          <span className="text-muted-foreground">{arche?.label ?? "—"}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          s.kind === "booking" ? "bg-amber-500/15 text-amber-400" : "bg-sky-500/15 text-sky-400",
                        )}>{s.kind === "booking" ? "Booking" : "Sub"}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {s.start_date ? `${s.start_date}${s.end_date ? " → " + s.end_date : ""}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={`rounded-full text-xs ${stage.className}`}>{stage.label}</Badge>
                          {s.payment_method && (
                            <Badge variant="outline" className="rounded-full text-[10px] uppercase">{s.payment_method}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-foreground whitespace-nowrap">
                        {typeof s.price_cents === "number" ? `$${(s.price_cents / 100).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="Row actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditRow(s)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDeleteRow(s)} className="text-red-400 focus:text-red-400">
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminListShell>
      </div>

      {/* Edit sheet — mutates the underlying provider_subscriptions / provider_bookings row directly. */}
      <Sheet open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editRow?.kind === "booking" ? "Edit booking" : "Edit subscription"}</SheetTitle>
            <SheetDescription>
              {editRow ? `${userLabel(editRow.user_id)} · ${providerById.get(editRow.provider_id)?.name ?? "—"}` : ""}
            </SheetDescription>
          </SheetHeader>
          {/* Read-only-mirror warning: universal provider_subscriptions /
              provider_bookings are populated from legacy tables (source_service_key
              + source_*_id). Writes here don't back-sync — the legacy row (which
              the reconcile cron, revenue math, and customer's My Subs all read)
              stays whatever it was. Route admins to the correct edit surface. */}
          <div className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500">
            <p className="font-semibold text-foreground">Edits here don't sync to the source table</p>
            <p className="mt-0.5">
              This row mirrors a {editRow?.kind === "booking" ? "car rental" : "cleaning/food/beach"} record.
              To change payment status or lifecycle, open the service-specific admin page
              (Cleaning subs / Food workspace / Beach admin / Bookings calendar).
            </p>
          </div>
          {editRow && (
            <EditForm
              key={editRow.id}
              row={editRow}
              onSave={(patch) => updateMutation.mutate({ row: editRow, patch })}
              saving={updateMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation — hard-deletes the row. */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleteRow?.kind ?? "row"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the row from the database. If you just want to end access,
              set the status to <strong>cancelled</strong> via Edit instead — it keeps history intact
              for the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRow && deleteMutation.mutate(deleteRow)}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
};

function EditForm({
  row, onSave, saving,
}: {
  row: SaleRow;
  onSave: (patch: Record<string, any>) => void;
  saving: boolean;
}) {
  const isBooking = row.kind === "booking";
  const [statusV, setStatusV] = useState(row.status);
  const [paymentV, setPaymentV] = useState(row.payment_status);
  const [methodV, setMethodV] = useState(row.payment_method ?? "");
  const [start, setStart] = useState(row.start_date ?? "");
  const [end, setEnd] = useState(row.end_date ?? "");
  const [priceDollars, setPriceDollars] = useState(
    typeof row.price_cents === "number" ? (row.price_cents / 100).toFixed(2) : "",
  );

  useEffect(() => {
    setStatusV(row.status);
    setPaymentV(row.payment_status);
    setMethodV(row.payment_method ?? "");
    setStart(row.start_date ?? "");
    setEnd(row.end_date ?? "");
    setPriceDollars(typeof row.price_cents === "number" ? (row.price_cents / 100).toFixed(2) : "");
  }, [row.id]);

  const submit = () => {
    const patch: Record<string, any> = {
      status: statusV,
      payment_status: paymentV,
      payment_method: methodV || null,
    };
    // Bookings use start_at/end_at timestamps; subs use start_date/end_date.
    // Only touch date columns when the value actually changed to avoid rewriting
    // the timestamp-side of the row on a plain date-only edit.
    if (isBooking) {
      if (start && start !== row.start_date) patch.start_at = new Date(`${start}T00:00:00`).toISOString();
      if (end   && end   !== row.end_date)   patch.end_at   = new Date(`${end}T23:59:59`).toISOString();
    } else {
      if (start !== (row.start_date ?? "")) patch.start_date = start || null;
      if (end   !== (row.end_date   ?? "")) patch.end_date   = end   || null;
    }
    const cents = Math.round(parseFloat(priceDollars || "0") * 100);
    if (!Number.isNaN(cents)) {
      patch[isBooking ? "total_price_cents" : "price_cents"] = cents;
    }
    onSave(patch);
  };

  return (
    <div className="mt-6 space-y-4">
      <div>
        <Label>Status</Label>
        <Select value={statusV} onValueChange={setStatusV}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Payment status</Label>
        <Select value={paymentV} onValueChange={setPaymentV}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Payment method</Label>
        <Select value={methodV || "none"} onValueChange={(v) => setMethodV(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="lightning">Lightning</SelectItem>
            <SelectItem value="onchain">On-chain BTC</SelectItem>
            <SelectItem value="crypto">LIVES</SelectItem>
            <SelectItem value="paypal">PayPal</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <Label>End</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Amount ($)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
        />
      </div>
      <SheetFooter className="mt-4">
        <Button onClick={submit} disabled={saving} loading={saving} loadingText="Saving…">Save</Button>
      </SheetFooter>
    </div>
  );
}

function SortHeader({
  label, sortKey, active, dir, onSort,
}: {
  label: string; sortKey: SortKey; active: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className="px-4 py-3 font-bold text-muted-foreground">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          isActive && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !isActive && "text-muted-foreground/50")} />
      </button>
    </th>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[160px]">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default MarketplaceSubscriptions;
