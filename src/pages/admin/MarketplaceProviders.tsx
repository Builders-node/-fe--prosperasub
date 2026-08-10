import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ExternalLink, Building2, Mail, Phone, ShieldCheck, MoreVertical, Pencil, Plus } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { CAPABILITIES, type CapabilityKey } from "@/components/provider/capabilities";
import { AdminPageTabs } from "@/components/admin/AdminPageTabs";
import { cn } from "@/lib/utils";

interface ProviderRow {
  id: string;
  category_key: string;
  archetype_key: string | null;
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
 * Universal admin list for the `providers` table. Table layout matches Plans /
 * Subscriptions / People — one row per business, quick chip-row for archetype
 * filter, Edit sheet for archetype + capabilities changes so those aren't
 * inline (misclick surface).
 */
export interface MarketplaceProvidersProps {
  /** Mounted as a tab inside the service detail page — skip the page chrome. */
  embedded?: boolean;
  /**
   * Locks the list to one service. Pass `"unassigned"` for the providers whose
   * `archetype_key` is null — the FK is ON DELETE SET NULL, so deleting an
   * archetype orphans its providers and they'd be unreachable from a pure tree.
   */
  archetypeKey?: string;
}

const MarketplaceProviders = ({ embedded = false, archetypeKey }: MarketplaceProvidersProps = {}) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { archetypes } = useServiceArchetypes(false);

  // Derived, not state, when the parent route owns the scope — see the note in
  // MarketplacePlans.
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const service = archetypeKey ?? serviceFilter;
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [editRow, setEditRow] = useState<ProviderRow | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  const { data: providers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // Hard cap at 200 — pre-cap `.select("*")` returned unbounded, which
       // rendered every row and pinned the browser on large tenants. Real
       // pagination is on the roadmap; this is the safety floor until then.
      const { data, error } = await supabaseDb.from("providers").select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .range(0, 199);
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  // All active categories once — sub-forms filter by chosen archetype.
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-service-categories-active"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, archetype_key")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; archetype_key: string }>;
    },
    staleTime: 60_000,
  });

  const { data: pendingApps = 0 } = useQuery({
    queryKey: ["admin-provider-applications-pending-count"],
    queryFn: async () => {
      const { count, error } = await supabaseDb
        .from("provider_applications").select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (service === "unassigned") { if (p.archetype_key) return false; }
      else if (service !== "all" && p.archetype_key !== service) return false;
      if (status  !== "all" && p.status        !== status)  return false;
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.contact_email ?? "").toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [providers, service, status, search]);

  // Everything in the current service, before search/status narrowing — tells
  // "this service has no providers" apart from "your filters matched nothing".
  const inScope = useMemo(() => (
    archetypeKey
      ? providers.filter((p) => (archetypeKey === "unassigned" ? !p.archetype_key : p.archetype_key === archetypeKey))
      : providers
  ), [providers, archetypeKey]);

  const counts = useMemo(() => ({
    total: providers.length,
    active: providers.filter((p) => p.status === "active").length,
    perArchetype: providers.reduce<Record<string, number>>((acc, p) => {
      if (p.archetype_key) acc[p.archetype_key] = (acc[p.archetype_key] ?? 0) + 1;
      return acc;
    }, {}),
  }), [providers]);

  const toggleStatus = useMutation({
    mutationFn: async (p: ProviderRow) => {
      const next = p.status === "active" ? "inactive" : "active";
      const { error } = await supabaseDb.from("providers").update({ status: next }).eq("id", p.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", AUDIT_ENTITY, p.id, { status: next });
      return { name: p.name, next };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(`${r.name} ${r.next === "active" ? "activated" : "deactivated"}`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not update status"),
  });

  // Deactivation confirm — pulling a live provider offline shouldn't happen on
  // a single dropdown tap. Activation stays one-click (harmless).
  const [confirmDeactivate, setConfirmDeactivate] = useState<ProviderRow | null>(null);

  const saveEdit = useMutation({
    mutationFn: async ({ p, patch }: { p: ProviderRow; patch: Record<string, unknown> }) => {
      const { error } = await supabaseDb.from("providers").update(patch).eq("id", p.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", AUDIT_ENTITY, p.id, patch);
    },
    onSuccess: () => { toast.success("Saved"); setEditRow(null); qc.invalidateQueries({ queryKey: QUERY_KEY }); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const createProvider = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      // Bump sort_order past the current max so the new row lands at the bottom.
      // DB trigger `providers_sync_category_from_archetype` fills `category_key`.
      const maxSort = providers.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
      const row = {
        ...payload,
        status: "active",
        is_platform_owned: true,
        sort_order: maxSort + 10,
      };
      const { data, error } = await supabaseDb.from("providers").insert(row).select("id").single();
      if (error) throw error;
      if (userData?.id && data?.id) {
        await logAuditEvent(userData.id, "create", AUDIT_ENTITY, data.id, payload);
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Provider created");
      setCreating(false);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: any) => toast.error(e?.message || "Could not create provider"),
  });

  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const body = (
    <>
      <div className="space-y-5">
        {!embedded && (
          <AdminPageTabs tabs={[
            { label: "Providers", to: "/admin/marketplace/providers" },
            { label: "Applications", to: "/admin/marketplace/providers/applications", badge: pendingApps },
          ]} />
        )}

        {/* Chip-row archetype filter: one click to jump between services.
            Hidden when the route already pins the service. */}
        <div className="flex flex-wrap items-center gap-2">
          {(archetypeKey ? [] : [
            { key: "all", label: "All", count: counts.total },
            ...archetypes.map((a) => ({ key: a.key, label: a.label, count: counts.perArchetype[a.key] ?? 0 })),
          ]).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setServiceFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                service === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {f.label}
              <span className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                service === f.key
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted-foreground/15 text-muted-foreground",
              )}>{f.count}</span>
            </button>
          ))}
          {/* Actions on the right: status filter + create CTA */}
          <div className="ml-auto flex items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-36 rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> New provider
            </Button>
          </div>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search providers…"
          isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
          isEmpty={inScope.length === 0}
          isNoResults={inScope.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No providers yet"
          emptySubtitle="Businesses appear here after they apply and are approved."
          onClearFilters={() => { setSearch(""); setServiceFilter("all"); setStatus("all"); }}
        >
          {/* Empty state gets a direct CTA to Applications */}
          {inScope.length === 0 && (
            <div className="flex justify-center pt-2">
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/admin/marketplace/providers/applications">Review applications</Link>
              </Button>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl bg-card">
            {/* Header row */}
            <div className="hidden grid-cols-[minmax(0,3fr)_140px_minmax(0,2fr)_100px_80px] items-center gap-4 border-b border-border/40 px-space-5 py-space-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
              <div>Provider</div>
              <div>Service</div>
              <div>Contact</div>
              <div>Status</div>
              <div className="text-right">Actions</div>
            </div>

            <div className="divide-y divide-border/40">
              {visible.map((p) => {
                const arche = archetypes.find((a) => a.key === p.archetype_key);
                const AIcon = arche?.Icon ?? Building2;
                const caps = p.capabilities ?? [];

                const providerCell = (
                  <div className="flex min-w-0 items-center gap-3">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                        {initials(p.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                        {p.is_platform_owned && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Platform-owned" />
                        )}
                      </div>
                      {p.description && (
                        <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                      )}
                      {caps.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {caps.slice(0, 3).map((c) => (
                            <span key={c} className="inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {c}
                            </span>
                          ))}
                          {caps.length > 3 && (
                            <span className="text-[10px] text-muted-foreground/70">+{caps.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );

                // Service + the category under it — the two upper layers of
                // Service → Category → Provider, so the admin can see where a
                // provider actually sits without opening the edit sheet.
                const cat = categories.find((c) => c.key === p.category_key);
                const serviceCell = arche ? (
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", arche.accent)}>
                        <AIcon className="h-3 w-3 text-white" />
                      </span>
                      <span className="text-sm text-foreground">{arche.label}</span>
                    </span>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {cat ? cat.label : <em className="italic opacity-70">no category</em>}
                    </p>
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>;

                const contactCell = (
                  <div className="min-w-0 space-y-0.5 text-xs">
                    {p.contact_email ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate text-foreground">{p.contact_email}</span>
                      </div>
                    ) : null}
                    {p.contact_phone ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate text-foreground">{p.contact_phone}</span>
                      </div>
                    ) : null}
                    {!p.contact_email && !p.contact_phone && (
                      <span className="text-muted-foreground">No contact info</span>
                    )}
                  </div>
                );

                const statusCell = (
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    p.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground",
                  )}>{p.status}</span>
                );

                const actionsCell = (
                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Provider actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate(`/admin/marketplace/providers/${p.id}`)}>
                          <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open workspace
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditRow(p)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit service & capabilities
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => (p.status === "active" ? setConfirmDeactivate(p) : toggleStatus.mutate(p))}
                        >
                          {p.status === "active"
                            ? (<><EyeOff className="mr-2 h-3.5 w-3.5" /> Deactivate</>)
                            : (<><Eye    className="mr-2 h-3.5 w-3.5" /> Activate</>)}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );

                return (
                  <div
                    key={p.id}
                    className={cn(
                      "group px-space-5 py-space-3 transition-colors hover:bg-muted/30 cursor-pointer",
                      p.status !== "active" && "opacity-70",
                    )}
                    onClick={() => navigate(`/admin/marketplace/providers/${p.id}`)}
                  >
                    {/* Desktop grid */}
                    <div className="hidden grid-cols-[minmax(0,3fr)_140px_minmax(0,2fr)_100px_80px] items-center gap-4 md:grid">
                      {providerCell}
                      {serviceCell}
                      {contactCell}
                      <div>{statusCell}</div>
                      {/* Stop propagation so opening the ⋮ menu doesn't also open the workspace. */}
                      <div onClick={(e) => e.stopPropagation()}>{actionsCell}</div>
                    </div>

                    {/* Mobile card layout */}
                    <div className="space-y-2 md:hidden">
                      <div className="flex items-start justify-between gap-3">
                        {providerCell}
                        {statusCell}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {serviceCell}
                      </div>
                      {contactCell}
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        {actionsCell}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AdminListShell>
      </div>

      {/* Edit sheet — dedicated surface for the moves people used to do inline. */}
      <Sheet open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit provider</SheetTitle>
            <SheetDescription>{editRow?.name}</SheetDescription>
          </SheetHeader>
          {editRow && (
            <EditProviderForm
              key={editRow.id}
              provider={editRow}
              archetypes={archetypes}
              categories={categories}
              saving={saveEdit.isPending}
              onSave={(patch) => saveEdit.mutate({ p: editRow, patch })}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Create sheet — parallels Edit, but no existing row to pre-fill. */}
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New provider</SheetTitle>
            <SheetDescription>Create a platform-owned business on any archetype.</SheetDescription>
          </SheetHeader>
          <CreateProviderForm
            defaultArchetype={archetypeKey && archetypeKey !== "unassigned" ? archetypeKey : undefined}
            archetypes={archetypes}
            categories={categories}
            saving={createProvider.isPending}
            onCreate={(payload) => createProvider.mutate(payload)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmDeactivate} onOpenChange={(o) => !o && setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {confirmDeactivate?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the business from Discovery, listings, and every checkout
              on the platform immediately. Existing subscriptions keep running but
              new sign-ups are blocked. You can activate it again anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeactivate) toggleStatus.mutate(confirmDeactivate);
                setConfirmDeactivate(null);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Providers" subtitle="Every business on the platform, across all services">
      {body}
    </SuperAdminLayout>
  );
};

function EditProviderForm({
  provider, archetypes, categories, saving, onSave,
}: {
  provider: ProviderRow;
  archetypes: ReturnType<typeof useServiceArchetypes>["archetypes"];
  categories: Array<{ key: string; label: string; archetype_key: string }>;
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(provider.name);
  const [archetypeKey, setArchetypeKey] = useState(provider.archetype_key ?? "__none");
  const [categoryKey, setCategoryKey] = useState(provider.category_key ?? "__none");
  const [caps, setCaps] = useState<Set<string>>(new Set(provider.capabilities ?? []));
  /** Legacy-backed providers get a bespoke tab bundle; capabilities don't reach it. */
  const isLegacyBacked = !!provider.source_service_key;
  const [contactEmail, setContactEmail] = useState(provider.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(provider.contact_phone ?? "");

  // Only offer categories that belong to the selected archetype.
  const scopedCategories = archetypeKey === "__none"
    ? []
    : categories.filter((c) => c.archetype_key === archetypeKey);

  // If admin switches archetype and the current category no longer fits,
  // auto-pick the first available so we don't submit a mismatched pair.
  const currentIsValid = scopedCategories.some((c) => c.key === categoryKey);
  if (archetypeKey !== "__none" && !currentIsValid && scopedCategories.length > 0 && categoryKey !== scopedCategories[0].key) {
    // Defer to next tick to avoid setState-in-render warnings.
    queueMicrotask(() => setCategoryKey(scopedCategories[0].key));
  }

  const toggleCap = (c: CapabilityKey) => {
    setCaps((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const submit = () => {
    const nextArchetype = archetypeKey === "__none" ? null : archetypeKey;
    const patch: Record<string, unknown> = {
      name: name.trim() || provider.name,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      capabilities: Array.from(caps),
    };
    if (nextArchetype !== (provider.archetype_key ?? null)) {
      patch.archetype_key = nextArchetype;
      // Merge archetype defaults into the current cap set on switch — matches
      // the previous inline behaviour.
      if (nextArchetype) {
        const a = archetypes.find((x) => x.key === nextArchetype);
        (a?.default_capabilities ?? []).forEach((c) => (patch.capabilities as string[]).push(c));
        patch.capabilities = Array.from(new Set(patch.capabilities as string[]));
      }
    }
    // Always write category_key when it changed (it no longer auto-derives
    // from archetype_key — since one archetype can have many categories).
    const nextCategory = categoryKey === "__none" ? null : categoryKey;
    if (nextCategory !== (provider.category_key ?? null)) {
      patch.category_key = nextCategory;
    }
    onSave(patch);
  };

  return (
    <div className="mt-6 space-y-4">
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Service (archetype)</Label>
        <Select value={archetypeKey} onValueChange={setArchetypeKey}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— none —</SelectItem>
            {archetypes.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {archetypeKey !== (provider.archetype_key ?? "__none") && archetypeKey !== "__none" && (
          <p className="mt-1 text-xs text-amber-400">
            Changing service will merge archetype defaults into capabilities.
          </p>
        )}
      </div>
      <div>
        <Label>Category</Label>
        <Select value={categoryKey} onValueChange={setCategoryKey} disabled={archetypeKey === "__none" || scopedCategories.length === 0}>
          <SelectTrigger><SelectValue placeholder={archetypeKey === "__none" ? "Pick a service first" : "—"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— none —</SelectItem>
            {scopedCategories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {archetypeKey !== "__none" && scopedCategories.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            No categories under this service yet — add one in Settings → Services.
          </p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Contact email</Label>
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <Label>Contact phone</Label>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      {/* Capabilities decide which Offerings editors a provider gets — but only
          for providers with no legacy table. The four legacy services render a
          fixed, bespoke tab bundle (legacyPortalTabs.tsx never reads this
          field), so toggling it there changed nothing at all and simply lied
          to whoever clicked. It is shown read-only for those, with the reason. */}
      <div>
        <Label>Capabilities</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.keys(CAPABILITIES) as CapabilityKey[]).map((cap) => {
            const on = caps.has(cap);
            const meta = CAPABILITIES[cap];
            const I = meta.icon;
            return (
              <button
                key={cap}
                type="button"
                disabled={isLegacyBacked}
                onClick={() => !isLegacyBacked && toggleCap(cap)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                  isLegacyBacked ? "cursor-not-allowed opacity-60" : "hover:text-foreground",
                )}
                title={meta.description}
              >
                <I className="h-3 w-3" /> {meta.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isLegacyBacked
            ? `${provider.name} runs on the built-in ${provider.source_service_key} workspace, whose tabs are fixed. These are shown for reference and can't be changed here.`
            : "Each one adds an editor under this provider's Offerings tab."}
        </p>
      </div>

      <SheetFooter className="mt-4">
        <Button onClick={submit} disabled={saving} loading={saving} loadingText="Saving…">Save changes</Button>
      </SheetFooter>
    </div>
  );
}

// ─── Create form ────────────────────────────────────────────────────────────
function CreateProviderForm({
  archetypes, categories, saving, onCreate, defaultArchetype,
}: {
  archetypes: ReturnType<typeof useServiceArchetypes>["archetypes"];
  categories: Array<{ key: string; label: string; archetype_key: string }>;
  saving: boolean;
  onCreate: (payload: Record<string, unknown>) => void;
  /** Pre-selects the service when opened from inside that service's page. */
  defaultArchetype?: string;
}) {
  const [name, setName] = useState("");
  const [archetypeKey, setArchetypeKey] = useState<string>("__none");
  const [categoryKey, setCategoryKey] = useState<string>("__none");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [caps, setCaps] = useState<Set<string>>(new Set());

  const scopedCategories = archetypeKey === "__none"
    ? []
    : categories.filter((c) => c.archetype_key === archetypeKey);

  // When picking an archetype, seed capabilities from its defaults + auto-
  // pick the first category so the admin doesn't have to make two picks in
  // a row (they can still override).
  const onArchetypeChange = (key: string) => {
    setArchetypeKey(key);
    if (key === "__none") { setCaps(new Set()); setCategoryKey("__none"); return; }
    const a = archetypes.find((x) => x.key === key);
    setCaps(new Set(a?.default_capabilities ?? []));
    const first = categories.find((c) => c.archetype_key === key);
    setCategoryKey(first?.key ?? "__none");
  };

  // Seed from the pinned service, but only once the archetype list has loaded —
  // it arrives async, so seeding on mount would silently select nothing.
  useEffect(() => {
    if (!defaultArchetype || archetypeKey !== "__none") return;
    if (!archetypes.some((a) => a.key === defaultArchetype)) return;
    onArchetypeChange(defaultArchetype);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultArchetype, archetypes, categories]);

  const toggleCap = (c: CapabilityKey) => {
    setCaps((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  /**
   * providers.category_key is NOT NULL, so a name alone is not enough. Before
   * this, picking "— none —" (an offered option) or a service with no categories
   * submitted null and the admin got a raw Postgres message in a toast:
   *   null value in column "category_key" violates not-null constraint
   * The button now says what is missing instead.
   */
  const missing =
    name.trim().length === 0        ? "Name is required"
    : archetypeKey === "__none"     ? "Pick a service"
    : scopedCategories.length === 0 ? "This service has no categories yet"
    : categoryKey === "__none"      ? "Pick a category"
    : null;
  const canSubmit = !missing && !saving;

  const submit = () => {
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      archetype_key: archetypeKey === "__none" ? null : archetypeKey,
      category_key: categoryKey === "__none" ? null : categoryKey,
      description: description.trim() || null,
      location: location.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      capabilities: Array.from(caps),
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <div>
        <Label>Name <span className="text-destructive">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunset Yoga Studio" />
      </div>
      <div>
        <Label>Service (archetype)</Label>
        <Select value={archetypeKey} onValueChange={onArchetypeChange}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— none —</SelectItem>
            {archetypes.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {archetypeKey !== "__none" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Capabilities were pre-filled from archetype defaults — tweak below.
          </p>
        )}
      </div>
      <div>
        <Label>Category</Label>
        <Select value={categoryKey} onValueChange={setCategoryKey} disabled={archetypeKey === "__none" || scopedCategories.length === 0}>
          <SelectTrigger><SelectValue placeholder={archetypeKey === "__none" ? "Pick a service first" : "—"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— none —</SelectItem>
            {scopedCategories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {archetypeKey !== "__none" && scopedCategories.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            No categories under this service — add one in Settings → Services.
          </p>
        )}
      </div>
      <div>
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short one-liner shown on the listing" />
      </div>
      <div>
        <Label>Location</Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Próspera Village, Main Block" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Contact email</Label>
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <Label>Contact phone</Label>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Capabilities</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.keys(CAPABILITIES) as CapabilityKey[]).map((cap) => {
            const on = caps.has(cap);
            const meta = CAPABILITIES[cap];
            const I = meta.icon;
            return (
              <button
                key={cap}
                type="button"
                onClick={() => toggleCap(cap)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
                title={meta.description}
              >
                <I className="h-3 w-3" /> {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <SheetFooter className="mt-4 flex-col items-stretch gap-2 sm:flex-col">
        {missing && !saving && (
          <p className="text-xs text-muted-foreground">{missing}</p>
        )}
        <Button onClick={submit} disabled={!canSubmit} loading={saving} loadingText="Creating…">
          Create provider
        </Button>
      </SheetFooter>
    </div>
  );
}

export default MarketplaceProviders;
