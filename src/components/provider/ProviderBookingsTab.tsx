import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { legacyIdOf } from "@/lib/services/providerBridge";
import { cn } from "@/lib/utils";

/**
 * Provider-scoped bookings list for the universal provider portal
 * (`/my-provider/:id`). Cleaning bookings have no `provider_id` of their own —
 * they belong to a provider through `cleaning_subscriptions.provider_id`, so we
 * resolve them via the subscriptions. Every other category reads the universal
 * `provider_bookings` table directly. Read-only: management actions
 * (reschedule / complete / calendar sync) stay on the global Operations page.
 */

interface BookingRow {
  id: string;
  date: string | null;   // yyyy-mm-dd
  time: string;          // pre-formatted label
  status: string;
  customer: string;
  priceCents: number | null;
}

const to12h = (time?: string | null) => {
  if (!time) return "—";
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
};

const statusClass = (s?: string | null) => {
  switch (s) {
    case "booked":
    case "active":
    case "confirmed":
      return "bg-green-500/15 text-green-400";
    case "completed":
      return "bg-sky-500/15 text-sky-400";
    case "cancelled":
      return "bg-red-500/15 text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(`${d}T00:00:00`), "MMM d, yyyy"); } catch { return d; }
};

export function ProviderBookingsTab({ provider }: { provider: UniversalProviderRow }) {
  const isCleaning = (provider.source_service_key ?? "") === "cleaning";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["provider-bookings", provider.id, provider.source_service_key],
    queryFn: async (): Promise<BookingRow[]> => {
      if (isCleaning) {
        // Cleaning data is keyed by the LEGACY provider id (see providerBridge).
        const legacyProviderId = legacyIdOf(provider);
        const { data: subs } = await supabaseDb
          .from("cleaning_subscriptions").select("id").eq("provider_id", legacyProviderId).is("deleted_at", null);
        const subIds = (subs ?? []).map((s: any) => s.id);
        if (!subIds.length) return [];
        const { data: bks } = await supabaseDb
          .from("cleaning_bookings")
          .select("id, status, user_id, client_id, cleaning_available_slots(date, start_time, end_time)")
          .in("subscription_id", subIds);
        const list = bks ?? [];
        const userIds = [...new Set(list.map((b: any) => b.user_id).filter(Boolean))];
        const clientIds = [...new Set(list.map((b: any) => b.client_id).filter(Boolean))];
        const [users, clients] = await Promise.all([
          userIds.length ? supabaseDb.from("users").select("id, display_name, name, email").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
          clientIds.length ? supabaseDb.from("cleaning_clients").select("id, company_name").in("id", clientIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const um = new Map((users.data ?? []).map((u: any) => [u.id, u]));
        const cm = new Map((clients.data ?? []).map((c: any) => [c.id, c]));
        return list
          .map((b: any): BookingRow => {
            const slot = b.cleaning_available_slots;
            const u = um.get(b.user_id);
            const c = cm.get(b.client_id);
            return {
              id: b.id,
              date: slot?.date ?? null,
              time: slot ? `${to12h(slot.start_time)} – ${to12h(slot.end_time)}` : "—",
              status: b.status,
              customer: c?.company_name || u?.display_name || u?.name || u?.email || "Unknown",
              priceCents: null,
            };
          })
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      }

      // Generic universal path.
      const { data: bks } = await supabaseDb
        .from("provider_bookings")
        .select("id, status, user_id, start_at, end_at, price_cents")
        .eq("provider_id", provider.id)
        .order("start_at", { ascending: false });
      const list = bks ?? [];
      const userIds = [...new Set(list.map((b: any) => b.user_id).filter(Boolean))];
      const users = userIds.length
        ? await supabaseDb.from("users").select("id, display_name, name, email").in("id", userIds)
        : { data: [] as any[] };
      const um = new Map((users.data ?? []).map((u: any) => [u.id, u]));
      return list.map((b: any): BookingRow => {
        const u = um.get(b.user_id);
        const start = b.start_at ? new Date(b.start_at) : null;
        const end = b.end_at ? new Date(b.end_at) : null;
        return {
          id: b.id,
          date: b.start_at ? String(b.start_at).slice(0, 10) : null,
          time: start ? `${format(start, "p")}${end ? ` – ${format(end, "p")}` : ""}` : "—",
          status: b.status,
          customer: u?.display_name || u?.name || u?.email || "—",
          priceCents: b.price_cents ?? null,
        };
      });
    },
  });

  const pager = usePagination(rows, 15);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-semibold text-foreground">No bookings yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Bookings for this provider will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} booking{rows.length === 1 ? "" : "s"} for {provider.name}</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-4 py-3 font-bold text-muted-foreground">Customer</th>
              <th className="px-4 py-3 font-bold text-muted-foreground">Date</th>
              <th className="px-4 py-3 font-bold text-muted-foreground">Time</th>
              <th className="px-4 py-3 font-bold text-muted-foreground">Status</th>
              {rows.some((r) => r.priceCents != null) && (
                <th className="px-4 py-3 text-right font-bold text-muted-foreground">Amount</th>
              )}
            </tr>
          </thead>
          <tbody>
            {pager.paged.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-semibold text-foreground">{r.customer}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(r.date)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.time}</td>
                <td className="px-4 py-3">
                  <Badge className={cn("rounded-full text-xs capitalize", statusClass(r.status))}>{r.status}</Badge>
                </td>
                {rows.some((x) => x.priceCents != null) && (
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">
                    {r.priceCents != null ? `$${(r.priceCents / 100).toFixed(2)}` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination {...pager} onPage={pager.setPage} />
      {isCleaning && (
        <p className="text-xs text-muted-foreground/70">
          Read-only view. Reschedule, mark complete, and Google Calendar sync live on the admin Cleaning Operations page.
        </p>
      )}
    </div>
  );
}
