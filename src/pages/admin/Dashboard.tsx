import { Link } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  CreditCard,
  Plus,
  Settings,
  SparklesIcon,
  Store,
  Utensils,
  Users,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const formatSats = (sats: number) => {
  if (sats >= 1000000) return `${(sats / 1000000).toFixed(2)}M`;
  if (sats >= 1000) return `${(sats / 1000).toFixed(1)}k`;
  return sats.toString();
};

const formatRole = (role: string) => role.replace(/_/g, " ").toLowerCase();

const formatJoinedDate = (value?: string | null) => {
  if (!value) return "Joined date unavailable";
  return `Joined ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))}`;
};

const AdminDashboard = () => {
  const { data: stats } = useQuery({
    queryKey: ["super-admin-stats"],
    queryFn: async () => {
      const [
        usersRes,
        restaurantsRes,
        plansRes,
        activeSubsRes,
        pendingSubsRes,
        revenueRes,
        cleaningSubsRes,
        cleaningBookingsRes,
        cleaningSlotsRes,
      ] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id, is_active", { count: "exact" }),
        supabase.from("subscription_plans").select("id, is_active", { count: "exact" }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("is_active", true).eq("payment_status", "paid"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("payment_status", "pending"),
        supabase.from("subscriptions").select("total_price_sats").eq("payment_status", "paid"),
        supabase.from("cleaning_subscriptions").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("cleaning_bookings").select("id", { count: "exact", head: true }).eq("status", "booked"),
        supabase.from("cleaning_available_slots").select("id", { count: "exact", head: true }),
      ]);

      const restaurants = restaurantsRes.data || [];
      const plans = plansRes.data || [];
      const revenue = (revenueRes.data || []).reduce((sum, subscription) => sum + (subscription.total_price_sats || 0), 0);

      return {
        users: usersRes.count || 0,
        restaurants: restaurantsRes.count || 0,
        activeRestaurants: restaurants.filter((restaurant) => restaurant.is_active).length,
        plans: plansRes.count || 0,
        activePlans: plans.filter((plan) => plan.is_active).length,
        activeSubscriptions: activeSubsRes.count || 0,
        pendingPayments: pendingSubsRes.count || 0,
        totalRevenueSats: revenue,
        cleaningActiveSubscriptions: cleaningSubsRes.count || 0,
        cleaningUpcomingBookings: cleaningBookingsRes.count || 0,
        cleaningAvailableSlots: cleaningSlotsRes.count || 0,
      };
    },
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, name, display_name, auth_provider, avatar_url, roles, created_at, last_login_at");

      if (error) throw error;
      return data || [];
    },
  });

  const inactiveRestaurants = (stats?.restaurants ?? 0) - (stats?.activeRestaurants ?? 0);
  const inactivePlans = (stats?.plans ?? 0) - (stats?.activePlans ?? 0);
  const needsAttention = [
    {
      label: "Pending payments",
      value: stats?.pendingPayments ?? 0,
      detail: "Review unconfirmed subscription payments.",
      href: "/admin/payments",
      icon: CreditCard,
      tone: "warning",
    },
    {
      label: "Inactive restaurants",
      value: inactiveRestaurants,
      detail: "Finish setup or reactivate restaurant partners.",
      href: "/admin/restaurants",
      icon: Store,
      tone: "muted",
    },
    {
      label: "Cleaning bookings",
      value: stats?.cleaningUpcomingBookings ?? 0,
      detail: "Upcoming service bookings to monitor.",
      href: "/admin/cleaning",
      icon: SparklesIcon,
      tone: "muted",
    },
  ];

  return (
    <SuperAdminLayout title="Operations Overview" subtitle="Platform health, queues, and high-priority admin actions">
      <section className="grid grid-cols-1 gap-space-4 sm:grid-cols-2 xl:grid-cols-12">
        {[
          { label: "Revenue", value: `${formatSats(stats?.totalRevenueSats ?? 0)} sats`, icon: Zap, highlight: true, className: "xl:col-span-4" },
          { label: "Active subs", value: stats?.activeSubscriptions ?? 0, icon: CreditCard, className: "xl:col-span-2" },
          { label: "Pending payments", value: stats?.pendingPayments ?? 0, icon: AlertCircle, className: "xl:col-span-2" },
          { label: "Restaurants", value: `${stats?.activeRestaurants ?? 0}/${stats?.restaurants ?? 0}`, icon: Store, className: "xl:col-span-2" },
          { label: "Cleaning bookings", value: stats?.cleaningUpcomingBookings ?? 0, icon: CalendarDays, className: "xl:col-span-2" },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className={`min-h-36 ${metric.highlight ? "bg-primary/10" : ""} ${metric.className}`}>
              <CardHeader className="pb-space-3">
                <CardTitle className="flex items-center gap-space-2 text-label text-muted-foreground">
                  <Icon className={`h-4 w-4 ${metric.highlight ? "text-primary" : ""}`} />
                  {metric.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={metric.highlight ? "text-panel-title text-primary" : "text-panel-title"}>{metric.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="mt-space-5 grid grid-cols-1 gap-space-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Queues and operational checks that should be handled first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-3">
            {needsAttention.map((item) => {
              const Icon = item.icon;
              const active = item.value > 0;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className="grid min-h-20 grid-cols-[1fr_auto] items-center gap-space-4 rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4 transition-colors hover:bg-primary/10"
                >
                  <div className="flex items-start gap-space-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-background">
                      <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="font-bold">{item.label}</p>
                      <p className="mt-space-1 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                  <Badge variant={active ? "default" : "secondary"}>{item.value}</Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common admin tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-3">
            <Button asChild className="w-full justify-start">
              <Link to="/admin/restaurants">
                <Plus className="h-4 w-4" />
                Add / manage restaurant
              </Link>
            </Button>
            <Button asChild variant="secondary" className="w-full justify-start">
              <Link to="/admin/payments">
                <Zap className="h-4 w-4" />
                Generate test payment
              </Link>
            </Button>
            <Button asChild variant="secondary" className="w-full justify-start">
              <Link to="/restaurant">
                <Utensils className="h-4 w-4" />
                Enter restaurant mode
              </Link>
            </Button>
            <Button asChild variant="tertiary" className="w-full justify-start">
              <Link to="/admin/settings">
                <Settings className="h-4 w-4" />
                Platform rules
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mt-space-5 grid grid-cols-1 gap-space-5 xl:grid-cols-12">
        <Card className="xl:col-span-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <Users className="h-5 w-5 text-primary" />
              Users
            </CardTitle>
            <CardDescription>Registered accounts and admin access levels.</CardDescription>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4 text-sm text-muted-foreground">
                Loading users...
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4 text-sm text-muted-foreground">
                No users found.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-space-3 lg:grid-cols-2">
                {users.map((user: any) => {
                  const label = user.display_name || user.name || user.email || "User";
                  const roles = user.roles?.length ? user.roles : ["USER"];
                  return (
                    <div
                      key={user.id}
                      className="grid grid-cols-[auto_1fr] items-center gap-space-3 rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-radius-full bg-primary text-lg font-bold text-primary-foreground">
                        {label.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-space-2">
                          <p className="truncate font-bold">{label}</p>
                          {roles.map((role: string) => (
                            <Badge key={role} variant={role === "SUPER_ADMIN" ? "default" : "secondary"} className="capitalize">
                              {formatRole(role)}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-space-1 truncate text-sm text-muted-foreground">{user.email || "No email connected"}</p>
                        <p className="mt-space-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {user.auth_provider || "EMAIL"} · {formatJoinedDate(user.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-space-5 grid grid-cols-1 gap-space-5 lg:grid-cols-3">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <Store className="h-5 w-5 text-primary" />
              Food
            </CardTitle>
            <CardDescription>Restaurant partners and subscription meal plans.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-3 text-sm">
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Active restaurants</span>
              <strong>{stats?.activeRestaurants ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Active meal plans</span>
              <strong>{stats?.activePlans ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Inactive plans</span>
              <strong>{inactivePlans}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Payments
            </CardTitle>
            <CardDescription>Lightning payment flow and subscription revenue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-3 text-sm">
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Paid subscriptions</span>
              <strong>{stats?.activeSubscriptions ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Pending payments</span>
              <strong>{stats?.pendingPayments ?? 0}</strong>
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/admin/payments">Open Payments</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <SparklesIcon className="h-5 w-5 text-primary" />
              Cleaning
            </CardTitle>
            <CardDescription>Cleaning subscriptions, bookings, and availability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-3 text-sm">
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Active cleaning subs</span>
              <strong>{stats?.cleaningActiveSubscriptions ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Upcoming bookings</span>
              <strong>{stats?.cleaningUpcomingBookings ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
              <span>Open slots</span>
              <strong>{stats?.cleaningAvailableSlots ?? 0}</strong>
            </div>
          </CardContent>
        </Card>
      </section>
    </SuperAdminLayout>
  );
};

export default AdminDashboard;
