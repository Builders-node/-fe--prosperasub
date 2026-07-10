import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Car,
  DollarSign,
  Loader2,
  SparklesIcon,
  UtensilsCrossed,
  Users,
  Waves,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmtDate = (d?: string | null) => (d ? format(new Date(`${String(d).slice(0, 10)}T00:00:00`), "MMM d") : "");

type ServiceKey = "cleaning" | "food" | "beach" | "cars";

const SERVICE_META: Record<ServiceKey, { label: string; icon: typeof SparklesIcon; color: string; href: string }> = {
  cleaning: { label: "Cleaning", icon: SparklesIcon, color: "text-primary", href: "/admin/analytics?service=cleaning" },
  food: { label: "Food", icon: UtensilsCrossed, color: "text-primary", href: "/admin/analytics?service=food" },
  beach: { label: "Beach Club", icon: Waves, color: "text-primary", href: "/admin/analytics?service=beach" },
  cars: { label: "Car Rental", icon: Car, color: "text-primary", href: "/admin/analytics?service=cars" },
};

const AdminDashboard = () => {
  const { data: stats } = useQuery({
    queryKey: ["super-admin-stats-all"],
    queryFn: async () => {
      const [usersRes, cleaning, beach, rental, food] = await Promise.all([
        supabaseDb.from("users").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabaseDb.from("cleaning_subscriptions").select("payment_status, subscription_status, is_active, total_price_cents, monthly_price_cents").is("deleted_at", null),
        supabaseDb.from("beach_club_subscriptions").select("payment_status, status, total_cents"),
        supabaseDb.from("rental_bookings").select("payment_status, status, total_cents").is("deleted_at", null),
        supabaseDb.from("food_subscriptions").select("status, weekly_price_cents, commitment_weeks, periods_paid"),
      ]);

      const byService: Record<ServiceKey, { active: number; revenueCents: number }> = {
        cleaning: { active: 0, revenueCents: 0 },
        food: { active: 0, revenueCents: 0 },
        beach: { active: 0, revenueCents: 0 },
        cars: { active: 0, revenueCents: 0 },
      };
      let pending = 0;

      (cleaning.data ?? []).forEach((r: any) => {
        if (r.payment_status === "paid") byService.cleaning.revenueCents += r.total_price_cents || r.monthly_price_cents || 0;
        if (r.payment_status === "paid" && r.is_active && r.subscription_status === "active") byService.cleaning.active++;
        if (r.payment_status !== "paid" && !["cancelled", "expired"].includes(r.subscription_status)) pending++;
      });
      (food.data ?? []).forEach((r: any) => {
        const s = String(r.status ?? "").toLowerCase();
        if (["active", "paused", "expired"].includes(s)) byService.food.revenueCents += (r.weekly_price_cents || 0) * (r.commitment_weeks || 1) * (r.periods_paid || 1);
        if (s === "active") byService.food.active++;
        if (s === "pending") pending++;
      });
      (beach.data ?? []).forEach((r: any) => {
        if (r.payment_status === "paid") byService.beach.revenueCents += r.total_cents || 0;
        if (r.payment_status === "paid" && String(r.status).toLowerCase() === "active") byService.beach.active++;
        if (r.payment_status !== "paid" && r.status !== "cancelled") pending++;
      });
      (rental.data ?? []).forEach((r: any) => {
        if (r.payment_status === "paid") byService.cars.revenueCents += r.total_cents || 0;
        if (r.payment_status === "paid" && ["confirmed", "active", "in_progress"].includes(String(r.status).toLowerCase())) byService.cars.active++;
        if (r.payment_status !== "paid" && r.status !== "cancelled") pending++;
      });

      const revenueCents = Object.values(byService).reduce((s, v) => s + v.revenueCents, 0);
      const activeSubs = Object.values(byService).reduce((s, v) => s + v.active, 0);

      return { users: usersRes.count || 0, revenueCents, activeSubs, pending, byService };
    },
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["admin-recent-activity-all"],
    queryFn: async () => {
      const [cleaningSubs, cleaningBookings, foodSubs, beachSubs, rentalBookings] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions").select("id, user_id, payment_status, total_price_cents, monthly_price_cents, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("cleaning_bookings").select("id, user_id, status, created_at, cleaning_available_slots(date)").order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("food_subscriptions").select("id, user_id, status, customer_name, weekly_price_cents, commitment_weeks, created_at").order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("beach_club_subscriptions").select("id, user_id, status, payment_status, customer_name, total_cents, created_at").order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("rental_bookings").select("id, user_id, status, payment_status, total_cents, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
      ]);

      const userIds = [...new Set([
        ...(cleaningSubs.data ?? []).map((r: any) => r.user_id),
        ...(cleaningBookings.data ?? []).map((r: any) => r.user_id),
        ...(foodSubs.data ?? []).map((r: any) => r.user_id),
        ...(beachSubs.data ?? []).map((r: any) => r.user_id),
        ...(rentalBookings.data ?? []).map((r: any) => r.user_id),
      ].filter(Boolean))];
      const { data: usersData } = userIds.length
        ? await supabaseDb.from("users").select("id, name, display_name, email").in("id", userIds)
        : { data: [] as any[] };
      const usersMap = new Map((usersData ?? []).map((u: any) => [String(u.id), u]));
      const nameOf = (uid: string, fallback?: string | null) => {
        const u = usersMap.get(String(uid));
        return u?.display_name || u?.name || u?.email || fallback || "Unknown";
      };

      type Activity = { id: string; service: ServiceKey; tone: "paid" | "pending" | "neutral"; text: string; detail: string; date: string; href: string };
      const out: Activity[] = [];

      (cleaningSubs.data ?? []).forEach((s: any) => out.push({
        id: `csub-${s.id}`, service: "cleaning", tone: s.payment_status === "paid" ? "paid" : "pending",
        text: `${nameOf(s.user_id)} — Cleaning subscription`,
        detail: s.payment_status === "paid" ? formatCents(s.total_price_cents || s.monthly_price_cents || 0) : "Pending",
        date: s.created_at, href: "/admin/marketplace/subscriptions",
      }));
      (cleaningBookings.data ?? []).forEach((b: any) => out.push({
        id: `cbook-${b.id}`, service: "cleaning", tone: "neutral",
        text: `${nameOf(b.user_id)} — Cleaning session ${fmtDate(b.cleaning_available_slots?.date)}`,
        detail: b.status === "booked" ? "Upcoming" : b.status, date: b.created_at, href: "/admin/marketplace/providers",
      }));
      (foodSubs.data ?? []).forEach((s: any) => out.push({
        id: `fsub-${s.id}`, service: "food", tone: s.status === "active" ? "paid" : s.status === "pending" ? "pending" : "neutral",
        text: `${nameOf(s.user_id, s.customer_name)} — Food subscription`,
        detail: ["active", "paused", "expired"].includes(String(s.status)) ? formatCents((s.weekly_price_cents || 0) * (s.commitment_weeks || 1)) : String(s.status),
        date: s.created_at, href: "/admin/marketplace/subscriptions",
      }));
      (beachSubs.data ?? []).forEach((s: any) => out.push({
        id: `bsub-${s.id}`, service: "beach", tone: s.payment_status === "paid" ? "paid" : "pending",
        text: `${nameOf(s.user_id, s.customer_name)} — Beach Club membership`,
        detail: s.payment_status === "paid" ? formatCents(s.total_cents || 0) : "Pending",
        date: s.created_at, href: "/admin/beach-club/subscriptions",
      }));
      (rentalBookings.data ?? []).forEach((b: any) => out.push({
        id: `rbook-${b.id}`, service: "cars", tone: b.payment_status === "paid" ? "paid" : "pending",
        text: `${nameOf(b.user_id)} — Car rental`,
        detail: b.payment_status === "paid" ? formatCents(b.total_cents || 0) : "Pending",
        date: b.created_at, href: "/admin/car-rentals/reservations",
      }));

      return out
        .filter((a) => a.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);
    },
  });

  const STATS = [
    { label: "Users", value: String(stats?.users ?? 0), icon: Users, href: "/admin/users" },
    { label: "Active subscriptions", value: String(stats?.activeSubs ?? 0), icon: SparklesIcon, href: "/admin/marketplace/subscriptions" },
    { label: "Pending payments", value: String(stats?.pending ?? 0), icon: Loader2, href: "/admin/marketplace/subscriptions" },
    { label: "Revenue", value: formatCents(stats?.revenueCents ?? 0), icon: DollarSign, href: "/admin/payments", accent: true },
  ];

  const toneClass = (tone: string) =>
    tone === "paid" ? "bg-green-500/15 text-green-500" : tone === "pending" ? "bg-yellow-500/15 text-yellow-500" : "bg-primary/15 text-primary";

  return (
    <SuperAdminLayout title="Overview" subtitle="What happened across the platform today">
      {/* ── KPI stats ── */}
      <div className="grid grid-cols-2 gap-space-3 xl:grid-cols-4">
        {STATS.map((stat) => (
          <Link key={stat.label} to={stat.href}>
            <Card className={`group relative h-full transition-colors hover:border-primary/40 ${stat.accent ? "bg-primary/10" : ""}`}>
              <CardContent className="p-space-4">
                <div className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
                  <stat.icon className={`h-4 w-4 shrink-0 ${stat.accent ? "text-primary" : ""}`} />
                  <span className="min-w-0 truncate">{stat.label}</span>
                  <ArrowRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60" />
                </div>
                <p className={`mt-space-2 break-words text-2xl font-extrabold tracking-tight md:text-3xl ${stat.accent ? "text-primary" : "text-foreground"}`}>
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Per-service breakdown ── */}
      <div className="mt-space-3 grid grid-cols-2 gap-space-3 lg:grid-cols-4">
        {(Object.keys(SERVICE_META) as ServiceKey[]).map((key) => {
          const meta = SERVICE_META[key];
          const s = stats?.byService[key];
          const Icon = meta.icon;
          return (
            <Link key={key} to={meta.href}>
              <Card className="group h-full transition-colors hover:border-primary/40">
                <CardContent className="p-space-4">
                  <div className="flex items-center gap-space-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-radius-md bg-muted">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </span>
                    <span className="text-sm font-bold text-foreground">{meta.label}</span>
                  </div>
                  <div className="mt-space-3 flex items-end justify-between">
                    <div>
                      <p className="text-lg font-extrabold tabular-nums text-foreground">{formatCents(s?.revenueCents ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">revenue</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold tabular-nums text-foreground">{s?.active ?? 0}</p>
                      <p className="text-xs text-muted-foreground">active</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* ── Needs attention (pending across all services) ── */}
      {(() => {
        const pendingItems = recentActivity.filter((a: any) => a.tone === "pending");
        if (pendingItems.length === 0) return null;
        return (
          <div className="mt-space-5">
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardHeader className="pb-space-3">
                <CardTitle className="flex items-center gap-space-2">
                  <Loader2 className="h-4 w-4 text-yellow-500" />
                  Needs attention
                  <Badge variant="outline" className="ml-1 text-[10px]">{pendingItems.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-space-4 pb-space-4">
                <div className="space-y-space-2">
                  {pendingItems.map((a: any) => {
                    const meta = SERVICE_META[a.service as ServiceKey];
                    return (
                      <Link key={a.id} to={a.href}
                        className="flex items-center gap-space-3 rounded-radius-lg border border-border/60 bg-card px-space-3 py-space-2 transition-colors hover:border-primary/40">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-full bg-yellow-500/15 text-yellow-500">
                          <DollarSign className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-space-2">
                            <Badge variant="outline" className={`shrink-0 text-[10px] ${meta?.color ?? ""}`}>{meta?.label ?? a.service}</Badge>
                            <p className="truncate text-sm font-semibold text-foreground">{a.text}</p>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ── Recent activity (all services) ── */}
      <div className="mt-space-5">
        <Card>
          <CardHeader className="pb-space-3">
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="px-space-4 pb-space-4">
            {recentActivity.length === 0 ? (
              <p className="py-space-6 text-center text-sm text-muted-foreground">No recent activity</p>
            ) : (
              <div className="divide-y divide-border">
                {recentActivity.map((activity: any) => {
                  const meta = SERVICE_META[activity.service as ServiceKey];
                  const Icon = activity.tone === "paid" ? Zap : activity.tone === "pending" ? DollarSign : CalendarDays;
                  return (
                    <Link
                      key={activity.id}
                      to={activity.href}
                      className="-mx-space-2 flex min-w-0 flex-col gap-space-3 rounded-radius-md px-space-2 py-space-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-space-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-full ${toneClass(activity.tone)}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`shrink-0 text-[10px] ${meta?.color ?? ""}`}>{meta?.label ?? activity.service}</Badge>
                            <p className="truncate text-sm font-semibold text-foreground">{activity.text}</p>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {format(new Date(activity.date), "MMM d, yyyy · h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={activity.tone === "paid" ? "default" : "secondary"} className="w-fit shrink-0 text-xs sm:ml-auto">
                        {activity.detail}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
};

export default AdminDashboard;
