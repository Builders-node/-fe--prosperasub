import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import { cn } from "@/lib/utils";

interface Provider { id: string; name: string; category_key: string; }
interface Plan {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  period: string;
  status: string;
  sort_order: number;
  source_service_key: string | null;
}

/**
 * Universal admin list of every subscription/membership/meal plan on the
 * platform. Reads `provider_plans` joined with providers so admins can
 * cross-cut by category or provider without switching legacy pages.
 */
const MarketplacePlans = () => {
  const { categories } = useServiceCategories(false);
  const [category, setCategory] = useState("all");
  const [providerId, setProviderId] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: providers = [] } = useQuery({
    queryKey: ["marketplace-providers-slim"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers")
        .select("id, name, category_key").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Provider[];
    },
  });
  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const providersInCategory = useMemo(() => (
    category === "all" ? providers : providers.filter((p) => p.category_key === category)
  ), [providers, category]);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["marketplace-plans"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("provider_plans")
        .select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      const prov = providerById.get(p.provider_id);
      if (category   !== "all" && prov?.category_key !== category)   return false;
      if (providerId !== "all" && p.provider_id      !== providerId) return false;
      if (status     !== "all" && p.status           !== status)     return false;
      if (q && !(p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || (prov?.name ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [plans, category, providerId, status, search, providerById]);

  const formatPrice = (cents: number, currency: string) => `${(cents / 100).toLocaleString("en-US", { style: "currency", currency: currency || "USD" })}`;

  return (
    <SuperAdminLayout title="Marketplace — Plans">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every subscription, membership and meal plan on the platform.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <FilterBlock label="Category">
            <Select value={category} onValueChange={(v) => { setCategory(v); setProviderId("all"); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBlock>
          <FilterBlock label="Provider">
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providersInCategory.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBlock>
          <FilterBlock label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </FilterBlock>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search plans…"
          isLoading={isLoading} isEmpty={plans.length === 0}
          isNoResults={plans.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No plans yet" emptySubtitle="Providers can create plans in their portal."
          onClearFilters={() => { setSearch(""); setCategory("all"); setProviderId("all"); setStatus("all"); }}
        >
          <div className="space-y-3">
            {visible.map((p) => {
              const prov = providerById.get(p.provider_id);
              const cat = prov ? categories.find((c) => c.key === prov.category_key) : undefined;
              const CatIcon = cat?.Icon ?? Building2;
              return (
                <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cat?.accent ?? "bg-muted")}>
                    <CatIcon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="rounded-full text-xs">{cat?.label ?? "?"}</Badge>
                      <Badge className={`rounded-full text-xs ${p.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>{p.status}</Badge>
                      {p.source_service_key && (
                        <Badge variant="outline" className="rounded-full text-[10px] uppercase">{p.source_service_key}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {prov?.name ?? "—"} · {formatPrice(p.price_cents, p.currency)} / {p.period.replace("_", " ")}
                    </p>
                    {p.description && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{p.description}</p>}
                  </div>
                  <div className="hidden text-right text-xs text-muted-foreground sm:block">
                    <p className="font-bold text-foreground">{formatPrice(p.price_cents, p.currency)}</p>
                    <p className="uppercase tracking-wider">{p.period.replace("_", " ")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminListShell>
      </div>
    </SuperAdminLayout>
  );
};

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[160px]">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default MarketplacePlans;
