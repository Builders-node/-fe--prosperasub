import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";
import type { RentalBooking, RentalVehicle, RentalBookingStatus } from "@/types/carRental";

type BookingWithVehicle = RentalBooking & { vehicle: RentalVehicle | null };

const STATUS_COLORS: Record<RentalBookingStatus, string> = {
  pending: "bg-yellow-500/15 text-yellow-400",
  paid: "bg-blue-500/15 text-blue-400",
  confirmed: "bg-purple-500/15 text-purple-400",
  active: "bg-green-500/15 text-green-400",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

const ALL_STATUSES: RentalBookingStatus[] = ["pending", "paid", "confirmed", "active", "completed", "cancelled"];

const CarRentalsReservations = () => {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [editBooking, setEditBooking] = useState<BookingWithVehicle | null>(null);
  const [editStatus, setEditStatus] = useState<RentalBookingStatus>("pending");
  const [editNotes, setEditNotes] = useState("");

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
      const { data: vData } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .in("id", vehicleIds);

      const vMap: Record<string, RentalVehicle> = {};
      (vData ?? []).forEach((v: RentalVehicle) => { vMap[v.id] = v; });

      return data.map((b: RentalBooking) => ({ ...b, vehicle: vMap[b.vehicle_id] ?? null })) as BookingWithVehicle[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editBooking) return;
      const { error } = await supabaseDb
        .from("rental_bookings")
        .update({ status: editStatus, admin_notes: editNotes || null })
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

  const openEdit = (b: BookingWithVehicle) => {
    setEditBooking(b);
    setEditStatus(b.status);
    setEditNotes(b.admin_notes ?? "");
  };

  const filtered = bookings.filter((b) => {
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        b.user_id.toLowerCase().includes(q) ||
        (b.vehicle?.name ?? "").toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <SuperAdminLayout title="Car Rental — Reservations">
      <div className="space-y-space-5">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-wrap gap-2">
            {["all", ...ALL_STATUSES].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  filterStatus === s
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
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
                  {["Vehicle", "Dates", "Duration", "Total", "Payment", "Status", "Created", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {b.vehicle?.name ?? b.vehicle_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {format(parseISO(b.start_date), "MMM d")} – {format(parseISO(b.end_date), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.rental_days}d
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {formatUSD(b.total_cents)}
                    </td>
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
                      <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editBooking} onOpenChange={(o) => !o && setEditBooking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Reservation</DialogTitle>
          </DialogHeader>
          {editBooking && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Vehicle</p>
                  <p className="font-semibold">{editBooking.vehicle?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold">{formatUSD(editBooking.total_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dates</p>
                  <p className="font-semibold">
                    {format(parseISO(editBooking.start_date), "MMM d")} – {format(parseISO(editBooking.end_date), "MMM d")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="font-semibold">{editBooking.rental_days} days</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as RentalBookingStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Admin notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Internal notes…"
                  rows={3}
                />
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
