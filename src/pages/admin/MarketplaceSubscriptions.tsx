import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import { cn } from "@/lib/utils";

type SortKey = "name" | "date" | "category";

interface Provider { id: string; name: string; category_key: string; }
interface Plan { id: string; name: string; }
interface UserRow { id: string; name: string | null; display_name: string | null; email: string | null; }
interface Subscription {
  id: string;
  provider_id: string;
  plan_id: string | null;
  user_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  price_cents: number | null;
  payment_reference: string | null;
  source_service_key: string | null;
  created_at: string;
}

/**
 * A single derived "Stage" that combines status + payment_status into one
 * lifecycle label admins actually think about:
 *   - awaiting payment: no money in yet
 *   - active:           paid + running
 *   - paused | expired | cancelled: terminal or on-hold states
 *   - refunded:         money returned
 */
function subscriptionStage(s: Subscription): { label: string; className: string } {
  if (s.payment_status === "refunded") return { label: "Refunded",         className: "bg-purple-500/15 text-purple-400" };
  if (s.status === "cancelled")        return { label: "Cancelled",        className: "bg-red-500/15 text-red-400" };
  if (s.status === "expired")          return { label: "Expired",          className: "bg-red-500/15 text-red-400" };
  if (s.status === "paused")           return { label: "Paused",           className: "bg-yellow-500/15 text-yellow-400" };
  if (s.payment_status !== "paid")     return { label: "Awaiting payment", className: "bg-amber-500/15 text-amber-400" };
  return { label: "Active", className: "bg-green-500/15 text-green-400" };
}

/**
 * Universal admin list of every recurring purchase on the platform. Reads
 * `provider_subscriptions` and joins providers/plans by id.
 */
const MarketplaceSubscriptions = () => {
  const { categories } = useServiceCategories(false);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const { data: providers = [] } = useQuery({
    queryKey: ["marketplace-providers-slim"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers")
        .select("id, name, category_key").order("name");
      if (error) throw error;
      return (data ?? []) as Provider[];
    },
  });
  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  const { data: plans = [] } = useQuery({
    queryKey: ["marketplace-plans-slim"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("provider_plans").select("id, name");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["marketplace-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("provider_subscriptions")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Subscription[];
    },
  });

  const userIds = useMemo(() => Array.from(new Set(subs.map((s) => s.user_id).filter((x): x is string => !!x))), [subs]);
  const { data: users = [] } = useQuery({
    queryKey: ["marketplace-subs-users", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("users").select("id, name, display_name, email").in("id", userIds);
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const userLabel = (id: string | null): string => {
    if (!id) return "—";
    const u = userById.get(id);
    return u?.display_name || u?.name || u?.email || id.slice(0, 8);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      const prov = providerById.get(s.provider_id);
      if (category !== "all" && prov?.category_key !== category) return false;
      if (status   !== "all" && s.status         !== status)     return false;
      if (payment  !== "all" && s.payment_status !== payment)    return false;
      if (q) {
        const plan = s.plan_id ? planById.get(s.plan_id) : undefined;
        const user = s.user_id ? userById.get(s.user_id) : undefined;
        if (!(
          (prov?.name ?? "").toLowerCase().includes(q) ||
          (plan?.name ?? "").toLowerCase().includes(q) ||
          userLabel(s.user_id).toLowerCase().includes(q) ||
          (user?.email ?? "").toLowerCase().includes(q) ||
          (s.payment_reference ?? "").toLowerCase().includes(q)
        )) return false;
      }
      return true;
    });
  }, [subs, category, status, payment, search, providerById, planById, userById]);

  const sorted = useMemo(() => {
    const catLabel = (key?: string) => categories.find((c) => c.key === key)?.label ?? "";
    const dir = sortDir === "asc" ? 1 : -1;
    return [...visible].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = userLabel(a.user_id).localeCompare(userLabel(b.user_id));
      } else if (sortBy === "category") {
        const prov = (s: Subscription) => providerById.get(s.provider_id)?.category_key;
        cmp = catLabel(prov(a)).localeCompare(catLabel(prov(b)));
      } else {
        // date — prefer start_date, fall back to created_at
        const key = (s: Subscription) => s.start_date || s.created_at || "";
        cmp = key(a).localeCompare(key(b));
      }
      // stable tiebreak on created_at so equal keys keep a deterministic order
      if (cmp === 0) cmp = (a.created_at || "").localeCompare(b.created_at || "");
      return cmp * dir;
    });
  }, [visible, sortBy, sortDir, categories, providerById, userById]);

  return (
    <SuperAdminLayout title="Marketplace — Subscriptions">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every recurring purchase across all categories and providers.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <FilterBlock label="Category">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBlock>
          <FilterBlock label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </FilterBlock>
          <FilterBlock label="Payment">
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </FilterBlock>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search by provider, plan, user, payment ref…"
          isLoading={isLoading} isEmpty={subs.length === 0}
          isNoResults={subs.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No subscriptions yet" emptySubtitle="Sales will show up here."
          onClearFilters={() => { setSearch(""); setCategory("all"); setStatus("all"); setPayment("all"); }}
        >
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <SortHeader label="Customer" sortKey="name" active={sortBy} dir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-bold text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 font-bold text-muted-foreground">Provider</th>
                  <SortHeader label="Category" sortKey="category" active={sortBy} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Period" sortKey="date" active={sortBy} dir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-bold text-muted-foreground">Stage</th>
                  <th className="px-4 py-3 text-right font-bold text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const prov = providerById.get(s.provider_id);
                  const plan = s.plan_id ? planById.get(s.plan_id) : undefined;
                  const cat = prov ? categories.find((c) => c.key === prov.category_key) : undefined;
                  const CatIcon = cat?.Icon ?? Building2;
                  const stage = subscriptionStage(s);
                  return (
                    <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{userLabel(s.user_id)}</td>
                      <td className="px-4 py-3">
                        {plan?.name ?? <em className="italic text-muted-foreground/70">no plan</em>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{prov?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", cat?.accent ?? "bg-muted")}>
                            <CatIcon className="h-3 w-3 text-white" />
                          </span>
                          <span className="text-muted-foreground">{cat?.label ?? "?"}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {s.start_date ? `${s.start_date}${s.end_date ? " → " + s.end_date : ""}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={`rounded-full text-xs ${stage.className}`}>{stage.label}</Badge>
                          {s.payment_method && (
                            <Badge variant="outline" className="rounded-full text-[10px] uppercase">{s.payment_method}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-foreground whitespace-nowrap">
                        {typeof s.price_cents === "number" ? `$${(s.price_cents / 100).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminListShell>
      </div>
    </SuperAdminLayout>
  );
};

function SortHeader({
  label, sortKey, active, dir, onSort,
}: {
  label: string; sortKey: SortKey; active: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className="px-4 py-3 font-bold text-muted-foreground">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          isActive && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !isActive && "text-muted-foreground/50")} />
      </button>
    </th>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[160px]">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default MarketplaceSubscriptions;
