import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronsUpDown, ChevronUp, ChevronDown, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
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
import {
  fetchMarketplaceSales, buildSalePatch, SALE_SOURCES, type SaleRow,
} from "@/lib/admin/marketplaceSales";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { cn } from "@/lib/utils";

type SortKey = "name" | "date" | "service";

interface Provider { id: string; name: string; archetype_key: string | null; }
interface UserRow { id: string; name: string | null; display_name: string | null; email: string | null; }

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
 * Every sale on the platform, read from each service's own table via
 * `lib/admin/marketplaceSales.ts`.
 *
 * It used to read the universal `provider_subscriptions` / `provider_bookings`
 * mirrors, which a one-off backfill filled in July 2026 and nothing has written
 * to since — so the page showed 20 of 39 sales, six of the visible ones had a
 * stale status, and edits landed on the mirror instead of the row the customer
 * actually has.
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
    qc.invalidateQueries({ queryKey: ["marketplace-sales"] });
    // The per-service surfaces read the same rows we just wrote.
    qc.invalidateQueries({ queryKey: ["provider-food-subs"] });
    qc.invalidateQueries({ queryKey: ["provider-cleaning-subs"] });
    qc.invalidateQueries({ queryKey: ["unified-bookings"] });
    qc.invalidateQueries({ queryKey: ["provider-analytics"] });
  };

  /** The row's real table — the one the customer and the crons read. */
  const backing = (s: SaleRow) => SALE_SOURCES[s.source_service_key];

  const updateMutation = useMutation({
    mutationFn: async ({ row, patch }: { row: SaleRow; patch: Record<string, any> }) => {
      const b = backing(row);
      const { error } = await supabaseDb.from(b.table).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", backing(row).table, row.id, patch);
    },
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditRow(null); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: SaleRow) => {
      const b = backing(row);
      const { error } = await supabaseDb.from(b.table).delete().eq("id", row.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", backing(row).table, row.id, {});
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

  // No provider_plans lookup: plan_id is now the LEGACY id (food_meal_plans,
  // cleaning_packages, …) and would never match a row in that mirror table, so
  // every Plan cell would read "—". The adapter resolves the name at source.

  /**
   * One query across every service's own table.
   *
   * This used to read `provider_subscriptions` + `provider_bookings` — mirror
   * tables filled by a one-off backfill in July and never written to since. The
   * page was therefore a snapshot of that day: it showed 9 of 19 food rows, and
   * six of the nine had a stale status (cancelled and expired customers still
   * read "Active"). See lib/admin/marketplaceSales.ts.
   */
  const {
    data: rows = [], isLoading, isError, error: subsErrObj, refetch: refetchSubs,
  } = useQuery({
    queryKey: ["marketplace-sales"],
    queryFn: fetchMarketplaceSales,
  });


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
  /**
   * Beach walk-ins and off-platform food orders carry a name on the row and no
   * account at all. Falling straight to "—" hid who the sale was for.
   */
  const customerLabel = (s: SaleRow): string => {
    const u = s.user_id ? userById.get(s.user_id) : undefined;
    return u?.display_name || u?.name || s.customer_name || u?.email
      || (s.user_id ? s.user_id.slice(0, 8) : "—");
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
        const user = s.user_id ? userById.get(s.user_id) : undefined;
        if (!(
          (prov?.name ?? "").toLowerCase().includes(q) ||
          (s.plan_name ?? "").toLowerCase().includes(q) ||
          customerLabel(s).toLowerCase().includes(q) ||
          (user?.email ?? "").toLowerCase().includes(q) ||
          (s.payment_reference ?? "").toLowerCase().includes(q)
        )) return false;
      }
      return true;
    });
  }, [rows, service, status, payment, kind, search, providerById, userById]);

  const sorted = useMemo(() => {
    const svcLabel = (key?: string | null) => archetypes.find((a) => a.key === key)?.label ?? "";
    const dir = sortDir === "asc" ? 1 : -1;
    return [...visible].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = customerLabel(a).localeCompare(customerLabel(b));
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

  // One row per sale, so this list only ever grows. Paged client-side: the
  // adapter already has every row in hand for the counts and the filters, so
  // there's nothing to re-fetch — it resets to page 1 whenever a filter changes
  // the result count.
  const pager = usePagination(sorted, 25);

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
          isLoading={isLoading} isError={isError} error={subsErrObj}
          onRetry={() => { refetchSubs(); }}
          isEmpty={rows.length === 0}
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
                {pager.paged.map((s) => {
                  const prov = providerById.get(s.provider_id);
                  const arche = prov ? archetypes.find((a) => a.key === prov.archetype_key) : undefined;
                  const AIcon = arche?.Icon ?? Building2;
                  const stage = subscriptionStage(s);
                  return (
                    <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {s.user_id ? (
                          <Link
                            to={`/admin/users?userId=${encodeURIComponent(s.user_id)}`}
                            className="hover:text-primary hover:underline"
                          >
                            {customerLabel(s)}
                          </Link>
                        ) : (
                          customerLabel(s)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.plan_name ?? <em className="italic text-muted-foreground/70">no plan</em>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {prov ? (
                          <Link
                            to={`/admin/marketplace/providers?id=${encodeURIComponent(prov.id)}`}
                            className="hover:text-primary hover:underline"
                          >
                            {prov.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
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
          <TablePagination {...pager} onPage={pager.setPage} />
        </AdminListShell>
      </div>

      {/* Edit sheet — mutates the underlying provider_subscriptions / provider_bookings row directly. */}
      <Sheet open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editRow?.kind === "booking" ? "Edit booking" : "Edit subscription"}</SheetTitle>
            <SheetDescription>
              {editRow ? `${customerLabel(editRow)} · ${providerById.get(editRow.provider_id)?.name ?? "—"}` : ""}
            </SheetDescription>
          </SheetHeader>
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
    // Generic fields; buildSalePatch maps them onto the row's own column names
    // — cleaning's status lives in `subscription_status`, food's price is the
    // weekly rate. Writing a plain `status` to a cleaning row changed nothing.
    const edit: Parameters<typeof buildSalePatch>[1] = {
      status: statusV,
      payment_status: paymentV,
      payment_method: methodV || null,
    };
    // Only send a date the admin actually changed. Every service stores these
    // as plain dates, so there's no timestamp half left to preserve.
    if (start !== (row.start_date ?? "")) edit.start_date = start || null;
    if (end   !== (row.end_date   ?? "")) edit.end_date   = end   || null;
    const cents = Math.round(parseFloat(priceDollars || "0") * 100);
    if (!Number.isNaN(cents) && cents !== row.price_cents) edit.price_cents = cents;
    onSave(buildSalePatch(row, edit));
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
