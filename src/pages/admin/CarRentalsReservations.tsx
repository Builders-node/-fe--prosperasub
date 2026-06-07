import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Plus, Search, Trash2 } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatUSD } from "@/lib/pricing";
import { calcRentalPrice } from "@/types/carRental";
import { toast } from "sonner";
import type { RentalBooking, RentalVehicle, RentalBookingStatus } from "@/types/carRental";

type BookingWithVehicle = RentalBooking & { vehicle: RentalVehicle | null };

const STATUS_COLORS: Record<RentalBookingStatus, string> = {
  pending:   "bg-yellow-500/15 text-yellow-400",
  paid:      "bg-blue-500/15 text-blue-400",
  confirmed: "bg-purple-500/15 text-purple-400",
  active:    "bg-green-500/15 text-green-400",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

const ALL_STATUSES: RentalBookingStatus[] = ["pending", "paid", "confirmed", "active", "completed", "cancelled"];

const EMPTY_NEW = {
  vehicle_id: "",
  user_id: "",
  customer_name: "",
  start_date: "",
  end_date: "",
  start_time: "09:00",
  end_time: "09:00",
  status: "confirmed" as RentalBookingStatus,
  payment_status: "paid" as "pending" | "paid" | "failed",
  delivery_address: "",
  delivery_notes: "",
  admin_notes: "",
};

const CarRentalsReservations = () => {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  // Edit existing booking
  const [editBooking, setEditBooking] = useState<BookingWithVehicle | null>(null);
  const [editStatus, setEditStatus] = useState<RentalBookingStatus>("pending");
  const [editPayment, setEditPayment] = useState<"pending" | "paid" | "failed">("pending");
  const [editNotes, setEditNotes] = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<BookingWithVehicle | null>(null);

  // New reservation
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW });
  const [userSearch, setUserSearch] = useState("");

  /* ── Data ──────────────────────────────────────────────── */
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-rental-bookings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) return [] as BookingWithVehicle[];

      const vehicleIds = [...new Set(data.map((b: RentalBooking) => b.vehicle_id))];
      const { data: vData } = await supabaseDb.from("rental_vehicles").select("*").in("id", vehicleIds);
      const vMap: Record<string, RentalVehicle> = {};
      (vData ?? []).forEach((v: RentalVehicle) => { vMap[v.id] = v; });
      return data.map((b: RentalBooking) => ({ ...b, vehicle: vMap[b.vehicle_id] ?? null })) as BookingWithVehicle[];
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["admin-rental-vehicles-picker"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_vehicles")
        .select("id,name,brand,model,year,daily_price_cents,weekly_price_cents,biweekly_price_cents,monthly_price_cents,monthly_discount_pct,status")
        .neq("status", "archived")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentalVehicle[];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users-picker", userSearch],
    enabled: showNew && userSearch.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("users")
        .select("id,name,display_name,email")
        .or(`name.ilike.%${userSearch}%,email.ilike.%${userSearch}%,display_name.ilike.%${userSearch}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── Computed price for new reservation ─────────────────── */
  const newPrice = useMemo(() => {
    const v = vehicles.find((x) => x.id === newForm.vehicle_id);
    if (!v || !newForm.start_date || !newForm.end_date) return null;
    const days = differenceInCalendarDays(parseISO(newForm.end_date), parseISO(newForm.start_date));
    if (days < 1) return null;
    return calcRentalPrice(v, days);
  }, [newForm.vehicle_id, newForm.start_date, newForm.end_date, vehicles]);

  /* ── Mutations ───────────────────────────────────────────── */
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editBooking) return;
      const { error } = await supabaseDb
        .from("rental_bookings")
        .update({ status: editStatus, payment_status: editPayment, admin_notes: editNotes || null })
        .eq("id", editBooking.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-bookings"] });
      toast.success("Booking updated");
      setEditBooking(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newPrice) throw new Error("Select a vehicle and valid dates first");
      const v = vehicles.find((x) => x.id === newForm.vehicle_id)!;
      const payload = {
        vehicle_id: newForm.vehicle_id,
        user_id: newForm.user_id || `admin-manual-${Date.now()}`,
        start_date: newForm.start_date,
        end_date: newForm.end_date,
        start_time: newForm.start_time,
        end_time: newForm.end_time,
        rental_days: newPrice.rentalDays,
        daily_price_cents: v.daily_price_cents,
        subtotal_cents: newPrice.subtotalCents,
        discount_pct: newPrice.discountPct,
        discount_cents: newPrice.discountCents,
        total_cents: newPrice.totalCents,
        status: newForm.status,
        payment_status: newForm.payment_status,
        delivery_address: newForm.delivery_address || null,
        delivery_notes: newForm.delivery_notes || null,
        admin_notes: newForm.admin_notes
          ? `[Admin created] ${newForm.customer_name ? `Customer: ${newForm.customer_name}. ` : ""}${newForm.admin_notes}`
          : newForm.customer_name
          ? `[Admin created] Customer: ${newForm.customer_name}`
          : "[Admin created]",
      };
      const { error } = await supabaseDb.from("rental_bookings").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-bookings"] });
      toast.success("Reservation created");
      setShowNew(false);
      setNewForm({ ...EMPTY_NEW });
      setUserSearch("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb
        .from("rental_bookings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-car-rentals-analytics"] });
      toast.success("Reservation deleted successfully");
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete reservation");
    },
  });

  /* ── Handlers ────────────────────────────────────────────── */
  const openEdit = (b: BookingWithVehicle) => {
    setEditBooking(b);
    setEditStatus(b.status);
    setEditPayment(b.payment_status as "pending" | "paid" | "failed");
    setEditNotes(b.admin_notes ?? "");
  };

  const openNew = () => {
    setNewForm({ ...EMPTY_NEW });
    setUserSearch("");
    setShowNew(true);
  };

  const selectedVehicle = vehicles.find((v) => v.id === newForm.vehicle_id);

  const filtered = bookings.filter((b) => {
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        b.user_id.toLowerCase().includes(q) ||
        (b.vehicle?.name ?? "").toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        (b.admin_notes ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <SuperAdminLayout title="Car Rental — Reservations">
      <div className="space-y-space-5">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {["all", ...ALL_STATUSES].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  filterStatus === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[180px]">
            <Input
              placeholder="Search by vehicle, customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> New Reservation
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No reservations found.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {["Vehicle", "Customer", "Dates", "Days", "Total", "Payment", "Status", "Created", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b) => {
                  const customerNote = (b.admin_notes ?? "").match(/Customer: ([^.]+)/)?.[1];
                  const isManual = (b.admin_notes ?? "").startsWith("[Admin created]");
                  return (
                    <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {b.vehicle?.name ?? b.vehicle_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {customerNote ?? (isManual ? "—" : b.user_id.slice(0, 10) + "…")}
                        {isManual && <span className="ml-1 text-[10px] text-primary/60 font-semibold">manual</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(parseISO(b.start_date), "MMM d")} – {format(parseISO(b.end_date), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{b.rental_days}d</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{formatUSD(b.total_cents)}</td>
                      <td className="px-4 py-3">
                        <Badge className={b.payment_status === "paid" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}>
                          {b.payment_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[b.status]}>{b.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(parseISO(b.created_at), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Delete reservation"
                            onClick={() => setDeleteTarget(b)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Reservation Dialog ────────────────────────── */}
      <Dialog open={showNew} onOpenChange={(o) => !o && setShowNew(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Reservation</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">

            {/* Vehicle */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Vehicle *</Label>
              <Select value={newForm.vehicle_id} onValueChange={(v) => setNewForm((f) => ({ ...f, vehicle_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vehicle…" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} — {formatUSD(v.daily_price_cents)}/day
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Customer name</Label>
              <Input
                placeholder="Full name (stored in admin notes)"
                value={newForm.customer_name}
                onChange={(e) => setNewForm((f) => ({ ...f, customer_name: e.target.value }))}
              />
            </div>

            {/* User lookup */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Link to user account (optional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              {users.length > 0 && (
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {users.map((u: any) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setNewForm((f) => ({ ...f, user_id: u.id, customer_name: f.customer_name || u.display_name || u.name || u.email }));
                        setUserSearch(u.email ?? u.name ?? u.id);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-muted/40 ${newForm.user_id === u.id ? "bg-primary/10" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{u.display_name || u.name || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      {newForm.user_id === u.id && <span className="ml-auto text-xs text-primary font-semibold">Selected</span>}
                    </button>
                  ))}
                </div>
              )}
              {newForm.user_id && (
                <p className="text-xs text-primary">✓ Linked to user ID: {newForm.user_id.slice(0, 16)}…</p>
              )}
            </div>

            {/* Dates */}
            <div className="space-y-1.5">
              <Label>Start date *</Label>
              <Input
                type="date"
                value={newForm.start_date}
                onChange={(e) => setNewForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End date *</Label>
              <Input
                type="date"
                value={newForm.end_date}
                min={newForm.start_date}
                onChange={(e) => setNewForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Pickup time</Label>
              <Input
                type="time"
                value={newForm.start_time}
                onChange={(e) => setNewForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Return time</Label>
              <Input
                type="time"
                value={newForm.end_time}
                onChange={(e) => setNewForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>

            {/* Price summary */}
            {newPrice && selectedVehicle && (
              <div className="sm:col-span-2 rounded-xl bg-muted/40 border border-border p-4 text-sm space-y-2">
                <p className="font-semibold text-foreground">Price summary</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
                  <span>Duration</span>
                  <span className="text-foreground font-medium">{newPrice.rentalDays} day{newPrice.rentalDays !== 1 ? "s" : ""}</span>
                  <span>Daily rate</span>
                  <span className="text-foreground">{formatUSD(selectedVehicle.daily_price_cents)}</span>
                  <span>Subtotal</span>
                  <span className="text-foreground">{formatUSD(newPrice.subtotalCents)}</span>
                  {newPrice.discountCents > 0 && <>
                    <span>Discount ({newPrice.discountPct}%)</span>
                    <span className="text-green-400">−{formatUSD(newPrice.discountCents)}</span>
                  </>}
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-bold text-foreground text-base">{formatUSD(newPrice.totalCents)}</span>
                </div>
              </div>
            )}

            {/* Status & payment */}
            <div className="space-y-1.5">
              <Label>Reservation status</Label>
              <Select value={newForm.status} onValueChange={(v) => setNewForm((f) => ({ ...f, status: v as RentalBookingStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment status</Label>
              <Select value={newForm.payment_status} onValueChange={(v) => setNewForm((f) => ({ ...f, payment_status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Delivery */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Delivery address</Label>
              <Input
                placeholder="Leave empty if pickup"
                value={newForm.delivery_address}
                onChange={(e) => setNewForm((f) => ({ ...f, delivery_address: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Admin notes</Label>
              <Textarea
                value={newForm.admin_notes}
                onChange={(e) => setNewForm((f) => ({ ...f, admin_notes: e.target.value }))}
                placeholder="Any internal notes…"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newForm.vehicle_id || !newForm.start_date || !newForm.end_date || !newPrice}
            >
              {createMutation.isPending ? "Creating…" : `Create${newPrice ? ` · ${formatUSD(newPrice.totalCents)}` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ──────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="block font-medium text-foreground mb-1">
                    {deleteTarget.vehicle?.name ?? "Unknown vehicle"} ·{" "}
                    {format(parseISO(deleteTarget.start_date), "MMM d")}–
                    {format(parseISO(deleteTarget.end_date), "MMM d, yyyy")}
                  </span>
                </>
              )}
              This action cannot be undone. The vehicle and customer will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Dialog ───────────────────────────────────── */}
      <Dialog open={!!editBooking} onOpenChange={(o) => !o && setEditBooking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Reservation</DialogTitle>
          </DialogHeader>
          {editBooking && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Vehicle</p><p className="font-semibold">{editBooking.vehicle?.name ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{formatUSD(editBooking.total_cents)}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">Dates</p>
                  <p className="font-semibold">{format(parseISO(editBooking.start_date), "MMM d")} – {format(parseISO(editBooking.end_date), "MMM d")}</p>
                </div>
                <div><p className="text-xs text-muted-foreground">Duration</p><p className="font-semibold">{editBooking.rental_days} days</p></div>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as RentalBookingStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Payment status</Label>
                <Select value={editPayment} onValueChange={(v) => setEditPayment(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Admin notes</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal notes…" rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditBooking(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
};

export default CarRentalsReservations;
