import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import { formatUSD } from "@/lib/pricing";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import type { RentalBooking } from "@/types/carRental";

interface CustomerSummary {
  userId: string;
  totalBookings: number;
  activeBookings: number;
  completedBookings: number;
  totalSpendCents: number;
  lastBookingDate: string | null;
}

const CarRentalsCustomers = () => {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-rental-customers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("user_id, status, total_cents, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const map: Record<string, CustomerSummary> = {};
      (data as Pick<RentalBooking, "user_id" | "status" | "total_cents" | "created_at">[]).forEach((b) => {
        if (!map[b.user_id]) {
          map[b.user_id] = {
            userId: b.user_id,
            totalBookings: 0,
            activeBookings: 0,
            completedBookings: 0,
            totalSpendCents: 0,
            lastBookingDate: null,
          };
        }
        const c = map[b.user_id];
        c.totalBookings++;
        if (b.status === "active" || b.status === "confirmed") c.activeBookings++;
        if (b.status === "completed") c.completedBookings++;
        c.totalSpendCents += b.total_cents;
        if (!c.lastBookingDate || b.created_at > c.lastBookingDate) {
          c.lastBookingDate = b.created_at;
        }
      });

      return Object.values(map).sort((a, b) => b.totalSpendCents - a.totalSpendCents);
    },
  });

  // Fetch user details
  const { data: userMap = {} } = useQuery({
    queryKey: ["admin-rental-customers-users", customers.map((c) => c.userId).join(",")],
    queryFn: async () => {
      if (customers.length === 0) return {};
      const { data } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name")
        .in("id", customers.map((c) => c.userId));
      const map: Record<string, { email: string; name: string }> = {};
      (data ?? []).forEach((u: any) => { map[u.id] = { email: u.email ?? "—", name: u.display_name ?? u.name ?? "" }; });
      return map;
    },
    enabled: customers.length > 0,
  });

  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filteredCustomers = q
    ? customers.filter((c) => {
        const u = userMap[c.userId];
        return [u?.name, u?.email, c.userId].some((v) => (v ?? "").toLowerCase().includes(q));
      })
    : customers;
  const customersPager = usePagination(filteredCustomers, 20);

  return (
    <SuperAdminLayout title="Car Rental — Customers">
      <AdminListShell
        search={search} onSearch={setSearch}
        searchPlaceholder="Search customers…"
        isLoading={isLoading}
        isEmpty={customers.length === 0}
        isNoResults={customers.length > 0 && filteredCustomers.length === 0}
        count={filteredCustomers.length}
        emptyTitle="No customers yet"
        emptySubtitle="Customers appear here after their first booking."
        onClearFilters={() => setSearch("")}
      >
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {["Customer", "Total Bookings", "Active", "Completed", "Total Spend", "Last Booking"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customersPager.paged.map((c) => {
                  const user = userMap[c.userId];
                  return (
                    <tr key={c.userId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{user?.name || user?.email || c.userId.slice(0, 12) + "…"}</p>
                        {user?.name && <p className="text-xs text-muted-foreground">{user.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-foreground">{c.totalBookings}</td>
                      <td className="px-4 py-3">
                        {c.activeBookings > 0 ? (
                          <Badge className="bg-green-500/15 text-green-400">{c.activeBookings}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.completedBookings}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{formatUSD(c.totalSpendCents)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.lastBookingDate ? format(parseISO(c.lastBookingDate), "MMM d, yyyy") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination {...customersPager} onPage={customersPager.setPage} />
          </div>
      </AdminListShell>
    </SuperAdminLayout>
  );
};

export default CarRentalsCustomers;
