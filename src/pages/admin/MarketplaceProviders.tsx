import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ExternalLink, Building2 } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import { CAPABILITIES, type CapabilityKey } from "@/components/provider/capabilities";
import { cn } from "@/lib/utils";

interface ProviderRow {
  id: string;
  category_key: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  sort_order: number;
  capabilities: string[] | null;
  is_platform_owned: boolean;
  source_service_key: string | null;
  source_provider_id: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ["marketplace-providers"] as const;
const AUDIT_ENTITY = "provider";

/**
 * Universal admin list for the `providers` table. Filters by category,
 * status, and free-text search. Replaces the per-service Providers pages
 * (FoodProviders / CleaningProviders / …) which stay reachable by direct
 * URL for legacy edits.
 */
const MarketplaceProviders = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { categories } = useServiceCategories(false);

  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const { data: providers = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers").select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (category !== "all" && p.category_key !== category) return false;
      if (status   !== "all" && p.status       !== status)   return false;
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.contact_email ?? "").toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [providers, category, status, search]);

  const toggle = async (p: ProviderRow) => {
    const next = p.status === "active" ? "inactive" : "active";
    const { error } = await supabaseDb.from("providers").update({ status: next }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    if (userData?.id) await logAuditEvent(userData.id, "edit", AUDIT_ENTITY, p.id, { status: next });
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const capsToggle = useMutation({
    mutationFn: async ({ p, cap }: { p: ProviderRow; cap: CapabilityKey }) => {
      const current = new Set(p.capabilities ?? []);
      if (current.has(cap)) current.delete(cap); else current.add(cap);
      const next = Array.from(current);
      const { error } = await supabaseDb.from("providers").update({ capabilities: next }).eq("id", p.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", AUDIT_ENTITY, p.id, { capabilities: next });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (e: any) => toast.error(e?.message || "Could not update capabilities"),
  });

  const changeCategory = useMutation({
    mutationFn: async ({ p, categoryKey }: { p: ProviderRow; categoryKey: string }) => {
      const { error } = await supabaseDb.from("providers").update({ category_key: categoryKey }).eq("id", p.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", AUDIT_ENTITY, p.id, { category_key: categoryKey });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); toast.success("Category updated"); },
    onError: (e: any) => toast.error(e?.message || "Could not change category"),
  });

  return (
    <SuperAdminLayout title="Marketplace — Providers">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Providers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every business on the platform, in one place. Filter by category
              or status; change a provider's category and toggle capabilities inline.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search providers…"
          isLoading={isLoading} isEmpty={providers.length === 0}
          isNoResults={providers.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No providers yet" emptySubtitle="Providers appear here after they apply and are approved."
          onClearFilters={() => { setSearch(""); setCategory("all"); setStatus("all"); }}
        >
          <div className="space-y-3">
            {visible.map((p) => {
              const cat = categories.find((c) => c.key === p.category_key);
              const CatIcon = cat?.Icon ?? Building2;
              const caps = new Set<string>(p.capabilities ?? []);
              return (
                <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-4">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cat?.accent ?? "bg-muted")}>
                      <CatIcon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground">{p.name}</span>
                        <Badge variant="secondary" className="rounded-full text-xs">{cat?.label ?? p.category_key}</Badge>
                        <Badge className={`rounded-full text-xs ${p.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {p.status}
                        </Badge>
                        {p.is_platform_owned && (
                          <Badge variant="outline" className="rounded-full text-[10px]">Platform</Badge>
                        )}
                        {p.source_service_key && (
                          <Badge variant="outline" className="rounded-full text-[10px] uppercase">{p.source_service_key}</Badge>
                        )}
                      </div>
                      {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[p.contact_email, p.contact_phone].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={p.status === "active" ? "Hide" : "Activate"} onClick={() => toggle(p)}>
                        {p.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Manage provider" onClick={() => navigate(`/admin/marketplace/providers/${p.id}`)}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline category editor */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground self-center">Category:</span>
                    <Select
                      value={p.category_key}
                      onValueChange={(v) => { if (v !== p.category_key) changeCategory.mutate({ p, categoryKey: v }); }}
                    >
                      <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Inline capabilities editor */}
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/40 pt-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-2 self-center">Capabilities:</span>
                    {(Object.keys(CAPABILITIES) as CapabilityKey[]).map((cap) => {
                      const on = caps.has(cap);
                      const meta = CAPABILITIES[cap];
                      const I = meta.icon;
                      return (
                        <button
                          key={cap}
                          type="button"
                          onClick={() => capsToggle.mutate({ p, cap })}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                          title={meta.description}
                        >
                          <I className="h-3 w-3" /> {meta.label}
                        </button>
                      );
                    })}
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

export default MarketplaceProviders;
