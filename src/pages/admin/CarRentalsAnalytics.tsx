import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { TrendingUp, Car, CalendarDays, BarChart3 } from "lucide-react";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";
import { nowHN } from "@/lib/timezone";
import {
  AnalyticsShell, KpiCard, StatItem, MonthlyRevenueChart, RankedBarList,
} from "@/components/admin/analytics/AnalyticsPrimitives";
import type { RentalBooking, RentalVehicle } from "@/types/carRental";

const CarRentalsAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["admin-rental-analytics-bookings"],
    queryFn: async () => {
      // Paged — these rows are reduced into revenue/count figures and
      // PostgREST truncates a plain select at 1000 rows without erroring.
      return await fetchAllRows<RentalBooking>(() => supabaseDb
        .from("rental_bookings")
        .select("*")
        .is("deleted_at", null)
        // Same gate the other three services use — only paid bookings become
        // revenue. LIVES/crypto bookings sit at payment_status='pending' until
        // an admin confirms them; those must not appear in "Total Revenue".
        .eq("payment_status", "paid")
        .in("status", ["paid", "confirmed", "active", "completed"]).order("id"));
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["admin-rental-analytics-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_vehicles")
        .select("id, name")
        .neq("status", "archived");
      if (error) throw error;
      return (data ?? []) as Pick<RentalVehicle, "id" | "name">[];
    },
  });

  // Honduras month boundaries — see CleaningAnalytics for why.
  const now = nowHN();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  const totalRevenueCents = bookings.reduce((s, b) => s + b.total_cents, 0);
  const activeCount = bookings.filter((b) => b.status === "active").length;
  const completedCount = bookings.filter((b) => b.status === "completed").length;

  const monthBookings = bookings.filter((b) => {
    const d = parseISO(b.created_at);
    return d >= thisMonthStart && d <= thisMonthEnd;
  });
  const monthRevenueCents = monthBookings.reduce((s, b) => s + b.total_cents, 0);

  const avgDuration =
    bookings.length > 0
      ? (bookings.reduce((s, b) => s + b.rental_days, 0) / bookings.length).toFixed(1)
      : "0";

  // Revenue and rental count per vehicle
  const vehicleStats: Record<string, { name: string; revenue: number; rentals: number }> = {};
  vehicles.forEach((v) => {
    vehicleStats[v.id] = { name: v.name, revenue: 0, rentals: 0 };
  });
  bookings.forEach((b) => {
    if (!vehicleStats[b.vehicle_id]) {
      vehicleStats[b.vehicle_id] = { name: b.vehicle_id.slice(0, 8), revenue: 0, rentals: 0 };
    }
    vehicleStats[b.vehicle_id].revenue += b.total_cents;
    vehicleStats[b.vehicle_id].rentals++;
  });
  const vehicleList = Object.entries(vehicleStats)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.rentals - a.rentals);

  // Monthly revenue for last 6 months
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const label = format(d, "MMM");
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    const rev = bookings
      .filter((b) => {
        const bd = parseISO(b.created_at);
        return bd >= start && bd <= end;
      })
      .reduce((s, b) => s + b.total_cents, 0);
    return { label, rev };
  });

  if (loadingBookings) {
    return (
      <AnalyticsShell embedded={embedded} title="Car Rental — Analytics">
        <PageLoader />
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell embedded={embedded} title="Car Rental — Analytics">
      <div className="space-y-space-6">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={TrendingUp} label="Total Revenue" value={formatUSD(totalRevenueCents)} accent="text-green-400" />
          <KpiCard icon={TrendingUp} label={`Revenue — ${format(now, "MMMM")}`} value={formatUSD(monthRevenueCents)} accent="text-blue-400" />
          <KpiCard icon={Car} label="Active Rentals" value={String(activeCount)} accent="text-yellow-400" />
          <KpiCard icon={CalendarDays} label="Avg Duration" value={`${avgDuration} days`} accent="text-purple-400" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monthly revenue bar chart */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <BarChart3 className="h-5 w-5 text-primary" />
              Monthly Revenue (last 6 months)
            </h2>
            <MonthlyRevenueChart months={last6} barClass="bg-primary/60" formatValue={formatUSD} />
          </div>

          {/* Fleet performance */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <Car className="h-5 w-5 text-primary" />
              Fleet Performance
            </h2>
            <RankedBarList
              rows={vehicleList.map((v) => ({
                key: v.id,
                label: v.name,
                sublabel: formatUSD(v.revenue),
                value: v.rentals,
              }))}
              formatValue={(v) => `${v} rental${v !== 1 ? "s" : ""}`}
              emptyMessage="No vehicle has been rented yet."
            />
          </div>
        </div>

        {/* Summary stats */}
        <div className="rounded-2xl bg-card p-5">
          <h2 className="mb-4 font-black text-foreground">Rental Overview</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <StatItem label="Total Rentals" value={String(bookings.length)} />
            <StatItem label="Active" value={String(activeCount)} />
            <StatItem label="Completed" value={String(completedCount)} />
            <StatItem label="This Month" value={String(monthBookings.length)} />
            <StatItem label="Avg Duration" value={`${avgDuration} days`} />
            <StatItem label="Total Revenue" value={formatUSD(totalRevenueCents)} />
          </dl>
        </div>
      </div>
    </AnalyticsShell>
  );
};

export default CarRentalsAnalytics;
