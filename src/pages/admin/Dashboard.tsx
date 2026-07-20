import { Link } from "react-router-dom";
import { ArrowUpRight, Car, SparklesIcon, UtensilsCrossed, Waves } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { cn } from "@/lib/utils";

/**
 * Admin Overview.
 *
 * Kept intentionally sparse: three headline numbers, four per-service tiles,
 * and the last handful of *distinct* customer actions. The dense per-booking
 * activity feed used to inflate here — five rows for one recurring cleaning
 * subscription — was pure noise; it's replaced by a subscription-level feed.
 *
 * Everything drilling deeper (individual bookings, payment tables, per-user
 * history) lives one click away in Subscriptions / Finance / People.
 */

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type ServiceKey = "cleaning" | "food" | "beach" | "cars";

const SERVICE_META: Record<ServiceKey, { label: string; icon: typeof SparklesIcon; href: string }> = {
  cleaning: { label: "Cleaning",   icon: SparklesIcon,     href: "/admin/analytics?service=cleaning" },
  food:     { label: "Food",       icon: UtensilsCrossed,  href: "/admin/analytics?service=food" },
  beach:    { label: "Beach Club", icon: Waves,            href: "/admin/analytics?service=beach" },
  cars:     { label: "Car Rental", icon: Car,              href: "/admin/analytics?service=cars" },
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
        supabaseDb.from("food_subscriptions").select("status, payment_status, weekly_price_cents, commitment_weeks, periods_paid"),
      ]);

      const byService: Record<ServiceKey, { active: number; revenueCents: number }> = {
        cleaning: { active: 0, revenueCents: 0 },
        food:     { active: 0, revenueCents: 0 },
        beach:    { active: 0, revenueCents: 0 },
        cars:     { active: 0, revenueCents: 0 },
      };
      let pending = 0;

      (cleaning.data ?? []).forEach((r: any) => {
        if (r.payment_status === "paid") byService.cleaning.revenueCents += r.total_price_cents || r.monthly_price_cents || 0;
        if (r.payment_status === "paid" && r.is_active && r.subscription_status === "active") byService.cleaning.active++;
        if (r.payment_status !== "paid" && !["cancelled", "expired"].includes(r.subscription_status)) pending++;
      });
      // Food revenue must gate on payment_status='paid' — same as cleaning/
      // beach/cars. Otherwise Infinita/crypto subs that never reconciled inflate
      // the per-service Revenue tile on this page.
      (food.data ?? []).forEach((r: any) => {
        const s = String(r.status ?? "").toLowerCase();
        const isPaid = r.payment_status === "paid";
        if (isPaid && ["active", "paused", "expired"].includes(s)) {
          byService.food.revenueCents += (r.weekly_price_cents || 0) * (r.commitment_weeks || 1) * (r.periods_paid || 1);
        }
        if (isPaid && s === "active") byService.food.active++;
        if (!isPaid && s !== "cancelled") pending++;
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

  // Subscription-level activity — one row per distinct customer sale, not one
  // row per generated booking. The old feed emitted five identical rows for a
  // recurring cleaning purchase (one per generated cleaning_booking); the whole
  // point of "Recent activity" is that each event is meaningful.
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["admin-recent-activity-subscriptions"],
    queryFn: async () => {
      const [cleaningSubs, foodSubs, beachSubs, rentalBookings] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions").select("id, user_id, payment_status, total_price_cents, monthly_price_cents, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("food_subscriptions").select("id, user_id, status, customer_name, weekly_price_cents, commitment_weeks, created_at").order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("beach_club_subscriptions").select("id, user_id, status, payment_status, customer_name, total_cents, created_at").order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("rental_bookings").select("id, user_id, status, payment_status, total_cents, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
      ]);

      const userIds = [...new Set([
        ...(cleaningSubs.data ?? []).map((r: any) => r.user_id),
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

      type Activity = { id: string; service: ServiceKey; tone: "paid" | "pending"; label: string; detail: string; date: string; href: string };
      const out: Activity[] = [];

      (cleaningSubs.data ?? []).forEach((s: any) => out.push({
        id: `csub-${s.id}`, service: "cleaning", tone: s.payment_status === "paid" ? "paid" : "pending",
        label: `${nameOf(s.user_id)} — Cleaning subscription`,
        detail: s.payment_status === "paid" ? formatCents(s.total_price_cents || s.monthly_price_cents || 0) : "Awaiting payment",
        date: s.created_at, href: "/admin/marketplace/subscriptions",
      }));
      (foodSubs.data ?? []).forEach((s: any) => {
        const st = String(s.status ?? "").toLowerCase();
        out.push({
          id: `fsub-${s.id}`, service: "food", tone: st === "pending" ? "pending" : "paid",
          label: `${nameOf(s.user_id, s.customer_name)} — Food subscription`,
          detail: st === "pending" ? "Awaiting payment" : formatCents((s.weekly_price_cents || 0) * (s.commitment_weeks || 1)),
          date: s.created_at, href: "/admin/marketplace/subscriptions",
        });
      });
      (beachSubs.data ?? []).forEach((s: any) => out.push({
        id: `bsub-${s.id}`, service: "beach", tone: s.payment_status === "paid" ? "paid" : "pending",
        label: `${nameOf(s.user_id, s.customer_name)} — Beach Club membership`,
        detail: s.payment_status === "paid" ? formatCents(s.total_cents || 0) : "Awaiting payment",
        date: s.created_at, href: "/admin/beach-club/subscriptions",
      }));
      (rentalBookings.data ?? []).forEach((b: any) => out.push({
        id: `rbook-${b.id}`, service: "cars", tone: b.payment_status === "paid" ? "paid" : "pending",
        label: `${nameOf(b.user_id)} — Car rental`,
        detail: b.payment_status === "paid" ? formatCents(b.total_cents || 0) : "Awaiting payment",
        date: b.created_at, href: "/admin/car-rentals/reservations",
      }));

      return out
        .filter((a) => a.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8);
    },
  });

  return (
    <SuperAdminLayout title="Overview" subtitle="What happened across the platform today">
      {/* Headline metrics — three tiles only. Pending is orange only when >0 so
          the admin's eye lands on it; otherwise it blends with the other stats. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricTile
          label="Users"
          value={String(stats?.users ?? 0)}
          href="/admin/users"
        />
        <MetricTile
          label="Revenue"
          value={formatCents(stats?.revenueCents ?? 0)}
          href="/admin/payments"
          accent
        />
        <MetricTile
          label="Awaiting payment"
          value={String(stats?.pending ?? 0)}
          href="/admin/marketplace/subscriptions?status=pending"
          warning={(stats?.pending ?? 0) > 0}
          className="col-span-2 md:col-span-1"
        />
      </div>

      {/* Per-service breakdown. Flat, no icon disc, revenue + active side by side. */}
      <section className="mt-6">
        <SectionOverline label="By service" className="mb-3" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(Object.keys(SERVICE_META) as ServiceKey[]).map((key) => {
            const meta = SERVICE_META[key];
            const s = stats?.byService[key];
            const Icon = meta.icon;
            return (
              <Link
                key={key}
                to={meta.href}
                className="group flex flex-col gap-3 rounded-2xl bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">{meta.label}</span>
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-base font-black tabular-nums text-foreground sm:text-lg">
                      {formatCents(s?.revenueCents ?? 0)}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">revenue</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black tabular-nums text-foreground sm:text-lg">{s?.active ?? 0}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">active</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent activity — subscription-level so a recurring purchase is a
          single row, not five. Awaiting-payment rows are amber-toned to make
          them scannable alongside paid ones without a separate card. */}
      <section className="mt-6">
        <SectionOverline label="Recent activity" count={recentActivity.length} className="mb-3" />
        {recentActivity.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-card">
            <ul className="divide-y divide-border/40">
              {recentActivity.map((a: any) => {
                const meta = SERVICE_META[a.service as ServiceKey];
                const Icon = meta.icon;
                return (
                  <li key={a.id}>
                    <Link
                      to={a.href}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{a.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(new Date(a.date), "MMM d, yyyy · h:mm a")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-bold tabular-nums",
                          a.tone === "pending" ? "text-amber-500" : "text-foreground",
                        )}
                      >
                        {a.detail}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </SuperAdminLayout>
  );
};

function MetricTile({
  label, value, href, accent, warning, className,
}: {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
  warning?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "group flex flex-col gap-2 rounded-2xl bg-card p-4 transition-colors hover:bg-muted/40",
        warning && "bg-amber-500/10",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
      </div>
      <p
        className={cn(
          "text-2xl font-black tabular-nums tracking-tight md:text-3xl",
          accent ? "text-primary" : warning ? "text-amber-500" : "text-foreground",
        )}
      >
        {value}
      </p>
    </Link>
  );
}

export default AdminDashboard;
