import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CreditCard,
  Settings,
  SparklesIcon,
  Store,
  UtensilsCrossed,
  Users,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// ─── Formatters ──────────────────────────────────────────────────────────────

const formatSats = (sats: number) => {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(2)}M sats`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}k sats`;
  return `${sats} sats`;
};

const formatRole = (role: string) =>
  role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (value?: string | null) => {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    timeZone: "America/Tegucigalpa",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
};

// ─── Stat tile ───────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <Card className={`group relative transition-colors ${href ? "hover:border-primary/50" : ""} ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
      <CardHeader className="pb-space-2">
        <CardTitle className="flex items-center gap-space-2 text-label font-semibold text-muted-foreground">
          <Icon className={`h-4 w-4 ${accent ? "text-primary" : ""}`} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-panel-title font-extrabold tracking-tight ${accent ? "text-primary" : "text-foreground"}`}>
          {value}
        </p>
        {sub && <p className="mt-space-1 text-caption text-muted-foreground">{sub}</p>}
        {href && (
          <ArrowRight className="absolute right-space-4 top-space-4 h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link to={href}>{inner}</Link> : inner;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-space-3 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["super-admin-stats"],
    queryFn: async () => {
      const [
        usersRes,
        restaurantsRes,
        cleaningSubsRes,
        cleaningBookingsRes,
        cleaningPaidRes,
      ] = await Promise.all([
        supabaseDb.from("users").select("id", { count: "exact", head: true }),
        supabaseDb.from("restaurants").select("id, is_active"),
        supabaseDb.from("cleaning_subscriptions").select("id, payment_status"),
        supabaseDb.from("cleaning_bookings").select("id").eq("status", "booked"),
        supabaseDb.from("cleaning_subscriptions").select("total_price_cents").eq("payment_status", "paid"),
      ]);

      const restaurants = restaurantsRes.data || [];
      const cleaningSubs = cleaningSubsRes.data || [];
      const revenue = (cleaningPaidRes.data || []).reduce((sum: number, s: any) => sum + (s.total_price_cents || 0), 0);

      return {
        users: usersRes.count || 0,
        restaurants: restaurants.length,
        activeRestaurants: restaurants.filter((r: any) => r.is_active).length,
        cleaningActiveSubscriptions: cleaningSubs.filter((s: any) => s.payment_status === "paid").length,
        cleaningPendingPayments: cleaningSubs.filter((s: any) => s.payment_status === "pending").length,
        cleaningUpcomingBookings: cleaningBookingsRes.data?.length || 0,
        totalRevenueCents: revenue,
      };
    },
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const { data: usersData, error } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name, auth_provider, avatar_url, created_at, last_login_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch roles separately
      const { data: rolesData } = await supabaseDb.from("user_roles").select("user_id, role");
      const rolesMap = new Map<string, string[]>();
      for (const r of rolesData || []) {
        const existing = rolesMap.get(r.user_id) || [];
        existing.push(r.role);
        rolesMap.set(r.user_id, existing);
      }

      return (usersData || []).map((u: any) => ({
        ...u,
        roles: rolesMap.get(u.id) || ["user"],
      }));
    },
  });

  const pendingPayments = stats?.cleaningPendingPayments ?? 0;
  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <SuperAdminLayout>
      {/* ── Top KPIs ─────────────────────────────────────────────── */}
      <SectionLabel>Platform</SectionLabel>
      <div className="grid grid-cols-2 gap-space-4 md:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatCents(stats?.totalRevenueCents ?? 0)}
          icon={Zap}
          href="/admin/payments"
          accent
        />
        <StatTile
          label="Users"
          value={stats?.users ?? "—"}
          icon={Users}
        />
        <StatTile
          label="Active cleaning subs"
          value={stats?.cleaningActiveSubscriptions ?? "—"}
          icon={SparklesIcon}
          href="/admin/cleaning"
        />
        <StatTile
          label="Upcoming bookings"
          value={stats?.cleaningUpcomingBookings ?? "—"}
          icon={CalendarDays}
          href="/admin/cleaning"
        />
      </div>

      {/* ── Alerts ───────────────────────────────────────────────── */}
      {pendingPayments > 0 && (
        <div className="mt-space-6">
          <SectionLabel>Needs attention</SectionLabel>
          <Link
            to="/admin/payments"
            className="flex items-center justify-between rounded-radius-lg border border-warning/30 bg-warning/5 px-space-5 py-space-4 transition hover:bg-warning/10"
          >
            <div className="flex items-center gap-space-3">
              <AlertCircle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-semibold text-foreground">
                  {pendingPayments} pending payment{pendingPayments !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-muted-foreground">Review unconfirmed cleaning payments</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      )}

      {/* ── Quick links ───────────────────────────────────────────── */}
      <div className="mt-space-6">
        <SectionLabel>Cleaning</SectionLabel>
        <Card>
          <CardHeader className="pb-space-3">
            <CardTitle className="flex items-center gap-space-2">
              <SparklesIcon className="h-5 w-5 text-primary" />
              Cleaning service
            </CardTitle>
            <CardDescription>Active subscriptions, upcoming bookings, and client management.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-2">
            <div className="flex gap-space-2 pt-space-1">
              <Button asChild variant="secondary" size="sm" className="flex-1">
                <Link to="/admin/cleaning">
                  <CalendarDays className="h-4 w-4" />
                  Operations
                </Link>
              </Button>
              <Button asChild variant="tertiary" size="sm" className="flex-1">
                <Link to="/admin/clients">Clients</Link>
              </Button>
              <Button asChild variant="tertiary" size="sm" className="flex-1">
                <Link to="/admin/payments">Payments</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Users ─────────────────────────────────────────────────── */}
      <div className="mt-space-8">
        <SectionLabel>Users</SectionLabel>
        <Card>
          <CardHeader className="pb-space-3">
            <CardTitle className="flex items-center gap-space-2">
              <Users className="h-5 w-5 text-primary" />
              Registered accounts
            </CardTitle>
            <CardDescription>All users who have signed up or authenticated on the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="py-space-6 text-center text-sm text-muted-foreground">Loading users…</div>
            ) : users.length === 0 ? (
              <div className="rounded-radius-lg bg-[hsl(var(--app-control))] px-space-4 py-space-5 text-sm text-muted-foreground text-center">
                No users found.
              </div>
            ) : (
              <div className="divide-y divide-[hsl(var(--app-divider))]">
                {(users as any[]).map((user) => {
                  const displayName = user.display_name || user.name || user.email || "User";
                  const roles: string[] = user.roles?.length ? user.roles : ["USER"];
                  const joinedDate = formatDate(user.created_at);

                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-space-4 py-space-3"
                    >
                      {/* Avatar */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-full bg-primary text-base font-bold text-primary-foreground">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-space-2 gap-y-space-1">
                          <p className="truncate font-semibold text-foreground">{displayName}</p>
                          {roles.map((role) => (
                            <Badge
                              key={role}
                              variant={role === "SUPER_ADMIN" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {formatRole(role)}
                            </Badge>
                          ))}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{user.email || "No email"}</p>
                      </div>

                      {/* Meta */}
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {String(user.auth_provider || "EMAIL").toUpperCase()}
                        </p>
                        {joinedDate && (
                          <p className="text-xs text-muted-foreground">{joinedDate}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div className="mt-space-8">
        <SectionLabel>Quick actions</SectionLabel>
        <div className="flex flex-wrap gap-space-3">
          <Button asChild>
            <Link to="/admin/restaurants">
              <Store className="h-4 w-4" />
              Add restaurant
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/admin/payments">
              <Zap className="h-4 w-4" />
              Test payment
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/admin/cleaning">
              <CalendarDays className="h-4 w-4" />
              Cleaning slots
            </Link>
          </Button>
          <Button asChild variant="tertiary">
            <Link to="/admin/settings">
              <Settings className="h-4 w-4" />
              Platform settings
            </Link>
          </Button>
        </div>
      </div>
    </SuperAdminLayout>
  );
};

export default AdminDashboard;
