import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  DollarSign,
  SparklesIcon,
  Users,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatRole = (role: string) =>
  role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const AdminDashboard = () => {
  const { data: stats } = useQuery({
    queryKey: ["super-admin-stats"],
    queryFn: async () => {
      const [usersRes, cleaningSubsRes, cleaningPaidRes] = await Promise.all([
        supabaseDb.from("users").select("id", { count: "exact", head: true }),
        supabaseDb.from("cleaning_subscriptions").select("id, payment_status, is_active"),
        supabaseDb.from("cleaning_subscriptions").select("total_price_cents").eq("payment_status", "paid"),
      ]);

      const activeSubs = (cleaningSubsRes.data || []).filter((s: any) => s.payment_status === "paid" && s.is_active);
      const revenue = (cleaningPaidRes.data || []).reduce((sum: number, s: any) => sum + (s.total_price_cents || 0), 0);

      return {
        users: usersRes.count || 0,
        activeClients: activeSubs.length,
        totalRevenueCents: revenue,
      };
    },
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["admin-recent-activity"],
    queryFn: async () => {
      // Get recent subscriptions
      const { data: subs } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id, user_id, payment_status, total_price_cents, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      // Get recent bookings
      const { data: bookings } = await supabaseDb
        .from("cleaning_bookings")
        .select("id, user_id, status, created_at, cleaning_available_slots(date, start_time)")
        .order("created_at", { ascending: false })
        .limit(5);

      // Look up all user names
      const allUserIds = [...new Set([
        ...(subs || []).map((s: any) => s.user_id),
        ...(bookings || []).map((b: any) => b.user_id),
      ].filter(Boolean))];

      const { data: usersData } = await supabaseDb
        .from("users")
        .select("id, name, display_name, email")
        .in("id", allUserIds);
      const usersMap = new Map((usersData ?? []).map((u: any) => [String(u.id), u]));

      const getName = (userId: string) => {
        const u = usersMap.get(userId);
        return u?.display_name || u?.name || u?.email || "Unknown";
      };

      const activities: any[] = [];

      for (const sub of subs || []) {
        activities.push({
          id: `sub-${sub.id}`,
          type: "subscription",
          icon: sub.payment_status === "paid" ? "payment" : "pending",
          text: `${getName(sub.user_id)} — Cleaning Plan Subscription`,
          detail: sub.payment_status === "paid" ? formatCents(sub.total_price_cents) : "Pending",
          date: sub.created_at,
          href: "/admin/cleaning",
        });
      }

      for (const booking of bookings || []) {
        const slot = (booking as any).cleaning_available_slots;
        const dateStr = slot?.date ? format(new Date(slot.date + "T00:00:00"), "MMM d") : "";
        activities.push({
          id: `book-${booking.id}`,
          type: "booking",
          icon: "booking",
          text: `${getName(booking.user_id)} — Cleaning Session ${dateStr}`,
          detail: booking.status === "booked" ? "Upcoming" : booking.status,
          date: booking.created_at,
          href: "/admin/cleaning",
        });
      }

      return activities
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8);
    },
  });

  const STATS = [
    { label: "Users", value: stats?.users ?? 0, icon: Users, href: "/admin/clients" },
    { label: "Active Clients", value: stats?.activeClients ?? 0, icon: SparklesIcon, href: "/admin/cleaning" },
    { label: "Revenue", value: formatCents(stats?.totalRevenueCents ?? 0), icon: DollarSign, href: "/admin/payments" },
  ];

  const iconColor = (type: string) => {
    if (type === "payment") return "bg-green-500/15 text-green-500";
    if (type === "pending") return "bg-yellow-500/15 text-yellow-500";
    return "bg-primary/15 text-primary";
  };

  const iconComponent = (type: string) => {
    if (type === "payment") return Zap;
    if (type === "pending") return DollarSign;
    return CalendarDays;
  };

  return (
    <SuperAdminLayout title="Overview">
      {/* ── Stats ── */}
      <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-3">
        {STATS.map((stat) => (
          <Link key={stat.label} to={stat.href}>
            <Card className="group relative transition-colors hover:border-primary/40">
              <CardContent className="p-space-4">
                <div className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
                  <stat.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{stat.label}</span>
                  <ArrowRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60" />
                </div>
                <p className="mt-space-2 break-words text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Recently Log ── */}
      <div className="mt-space-5">
        <Card>
          <CardHeader className="pb-space-3">
            <CardTitle>Recently Log</CardTitle>
          </CardHeader>
          <CardContent className="px-space-4 pb-space-4">
            {recentActivity.length === 0 ? (
              <p className="py-space-6 text-center text-sm text-muted-foreground">No recent activity</p>
            ) : (
              <div className="divide-y divide-border">
                {recentActivity.map((activity: any) => {
                  const Icon = iconComponent(activity.icon);
                  return (
                    <Link
                      key={activity.id}
                      to={activity.href}
                      className="-mx-space-2 flex min-w-0 flex-col gap-space-3 rounded-radius-md px-space-2 py-space-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-space-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-full ${iconColor(activity.icon)}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{activity.text}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.date), "MMM d, yyyy · h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={activity.icon === "payment" ? "default" : "secondary"} className="w-fit shrink-0 text-xs sm:ml-auto">
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
