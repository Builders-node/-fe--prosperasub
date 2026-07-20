import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { TrendingUp, Car, CalendarDays, BarChart3 } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { formatUSD } from "@/lib/pricing";
import type { RentalBooking, RentalVehicle } from "@/types/carRental";

const CarRentalsAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const Wrap = ({ children }: { children?: any }) =>
    embedded ? <>{children}</> : <SuperAdminLayout title="Car Rental — Analytics">{children}</SuperAdminLayout>;
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["admin-rental-analytics-bookings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*")
        .is("deleted_at", null)
        // Same gate the other three services use — only paid bookings become
        // revenue. LIVES/crypto bookings sit at payment_status='pending' until
        // an admin confirms them; those must not appear in "Total Revenue".
        .eq("payment_status", "paid")
        .in("status", ["paid", "confirmed", "active", "completed"]);
      if (error) throw error;
      return (data ?? []) as RentalBooking[];
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["admin-rental-analytics-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_vehicles")
        .select("id, name, brand, model")
        .neq("status", "archived");
      if (error) throw error;
      return (data ?? []) as Pick<RentalVehicle, "id" | "name" | "brand" | "model">[];
    },
  });

  const now = new Date();
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
  const maxRev = Math.max(...last6.map((m) => m.rev), 1);

  return (
    <Wrap>
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
            <div className="flex items-end gap-3 h-36">
              {last6.map(({ label, rev }) => (
                <div key={label} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-primary/60 transition-all"
                    style={{ height: `${Math.max(4, (rev / maxRev) * 100)}%` }}
                    title={formatUSD(rev)}
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fleet performance */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <Car className="h-5 w-5 text-primary" />
              Fleet Performance
            </h2>
            {vehicleList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {vehicleList.map(({ id, name, revenue, rentals }) => (
                  <div key={id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${vehicleList.length > 0 ? (rentals / vehicleList[0].rentals) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-foreground">{rentals} rentals</p>
                      <p className="text-xs text-muted-foreground">{formatUSD(revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
    </Wrap>
  );
};

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.FC<{ className?: string }>; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-card p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[hsl(var(--app-rail))] p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-black text-foreground">{value}</dd>
    </div>
  );
}

export default CarRentalsAnalytics;
