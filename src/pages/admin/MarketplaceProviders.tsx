import { useEffect, useMemo, useState } from "react";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { useNavigate, Link } from "react-router-dom";
import { useUrlState } from "@/hooks/useUrlState";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ShieldCheck, Plus } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { TabPills } from "@/components/admin/TabPills";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { CAPABILITIES, type CapabilityKey } from "@/components/provider/capabilities";
import { profileCompleteness } from "@/lib/providerProfile";
import { cn } from "@/lib/utils";

interface ProviderRow {
  id: string;
  /** Set when the owner pressed "Ready for review" (migration 20261110120000). */
  review_requested_at?: string | null;
  category_key: string;
  archetype_key: string | null;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  contact_phone: string | null;
  google_calendar_id: string | null;
  contact_email: string | null;
  status: string;
  sort_order: number;
  capabilities: string[] | null;
  admin_user_id: string | null;
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
  const [serviceFilter, setServiceFilter] = useUrlState<string>("service", "all");
  const service = archetypeKey ?? serviceFilter;
  const [status, setStatus] = useUrlState<string>("status", "all");
  const [search, setSearch] = useUrlState<string>("q", "");
  const [creating, setCreating] = useState<boolean>(false);

  const { data: providers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // Hard cap at 200 — pre-cap `.select("*")` returned unbounded, which
       // rendered every row and pinned the browser on large tenants. Real
       // pagination is on the roadmap; this is the safety floor until then.
      // select("*") — the completeness score reads description, media, hours
      // and contacts, and they are all on this row already.
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

  // Who has been sent the hand-over link, and whether they opened it.
  const { data: invites = [] } = useQuery({
    queryKey: ["admin-owner-invites"],
    enabled: !embedded,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/owner-invites");
      if (error) return [];
      return (data ?? []) as Array<{ providerId: string; state: string; invitedEmail: string | null; openedAt: string | null }>;
    },
  });
  const inviteOf = useMemo(() => new Map(invites.map((i) => [String(i.providerId), i])), [invites]);

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

  // Client-side: the filters already have every row in hand.
  const pager = usePagination(visible, 25);

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

  const createProvider = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      // Bump sort_order past the current max so the new row lands at the bottom.
      // DB trigger `providers_sync_category_from_archetype` fills `category_key`.
      const maxSort = providers.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
      // A new business starts as a DRAFT: no photos, no plans, nobody to sell
      // it yet. It used to be inserted live, so a half-made page was public the
      // moment the form closed. "Go live" in its workspace flips it.
      const row = {
        ...payload,
        status: "draft",
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
    onSuccess: (data) => {
      toast.success("Draft created — fill it in, then Go live");
      setCreating(false);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // Straight into the business, where the setup checklist is.
      if (data?.id) navigate(`/admin/marketplace/providers/${data.id}`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not create provider"),
  });


  /** Owner state in words: who it was sent to, whether they opened it. */
  const ownerNote = (p: ProviderRow): string | null => {
    if (p.admin_user_id) return null;
    const inv = inviteOf.get(p.id);
    if (!inv || inv.state === "revoked") return "No owner";
    if (inv.state === "claimed") return null;
    if (inv.state === "expired") return "Invite expired";
    return inv.openedAt ? "Invite opened" : `Invited${inv.invitedEmail ? ` ${inv.invitedEmail}` : ""}`;
  };

  // Counts follow the service already chosen, so a tab never promises rows
  // the list then doesn't show.
  const inService = inScope.filter((p) => archetypeKey || service === "all" || p.archetype_key === service);
  const statusCount = (k: string) =>
    inService.filter((p) => k === "all" || p.status === k || (k === "active" && p.status === "approved")).length;

  const body = (
    <>
      <div className="space-y-4">
        {/* Applications are a step BEFORE a business, so they wait above the
            list as one line — not as a tab that swapped the whole page for a
            different layout. */}
        {!embedded && pendingApps > 0 && (
          <Link
            to="/admin/marketplace/providers/applications"
            className="flex items-center gap-3 rounded-radius-lg bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-primary/15 text-title font-semibold tabular-nums text-primary">
              {pendingApps}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-title font-semibold text-foreground">
                {pendingApps === 1 ? "1 application is waiting" : `${pendingApps} applications are waiting`}
              </span>
              <span className="block text-meta text-muted-foreground">Approve one and it lands here as a draft.</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        )}

        {/* Status is the question this page answers (what is live, what is
            still being set up), so it is the one row of tabs. The service is a
            narrower cut and sits beside the search as a menu. */}
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <TabPills
            className="flex-nowrap whitespace-nowrap"
            value={status as "all" | "active" | "draft" | "inactive"}
            onChange={setStatus}
            tabs={[
              { value: "all", label: `All ${statusCount("all")}` },
              { value: "active", label: `Live ${statusCount("active")}` },
              { value: "draft", label: `Draft ${statusCount("draft")}` },
              { value: "inactive", label: `Hidden ${statusCount("inactive")}` },
            ]}
          />
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search businesses…"
          filters={!archetypeKey ? (
            <Select value={service} onValueChange={setServiceFilter}>
              <SelectTrigger inputSize="sm" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services · {counts.total}</SelectItem>
                {archetypes.filter((a) => (counts.perArchetype[a.key] ?? 0) > 0).map((a) => (
                  <SelectItem key={a.key} value={a.key}>{a.label} · {counts.perArchetype[a.key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined}
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> New business
            </Button>
          }
          isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
          isEmpty={inScope.length === 0}
          isNoResults={inScope.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No businesses yet"
          emptySubtitle="Businesses appear here after they apply and are approved."
          onClearFilters={() => { setSearch(""); setServiceFilter("all"); setStatus("all"); }}
        >
          {/* One row shape at every width: who, where it is filed, how finished
              it is, its status. Everything else is one tap away on the
              business itself — the old phone card stacked contacts and a menu
              into a 300px-tall block per business. */}
          <div className="space-y-0.5 rounded-radius-lg bg-card p-1.5">
            {pager.paged.map((p) => {
              const arche = archetypes.find((a) => a.key === p.archetype_key);
              const cat = categories.find((c) => c.key === p.category_key);
              const profile = profileCompleteness(p as any);
              return (
                <Link
                  key={p.id}
                  to={`/admin/marketplace/providers/${p.id}`}
                  className="flex min-h-[64px] items-center gap-3 rounded-radius-md px-2.5 py-2 transition-colors hover:bg-inset"
                >
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
                    <Photo src={p.avatar_url} label={initialsOf(p.name)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-title font-semibold text-foreground">{p.name}</span>
                      {p.is_platform_owned && (
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Platform-owned" />
                      )}
                    </span>
                    <span className="block truncate text-meta text-muted-foreground">
                      {[arche?.label ?? "No service", cat && cat.label !== arche?.label ? cat.label : null].filter(Boolean).join(" · ")}
                      {profile.missing.length > 0 && <span className="text-attention"> · Profile {profile.percent}%</span>}
                      {ownerNote(p) && <span> · {ownerNote(p)}</span>}
                    </span>
                  </span>
                  {p.review_requested_at && p.status !== "active" && p.status !== "approved" && (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-meta font-semibold text-primary">Ready</span>
                  )}
                  <StatusPill
                    status={p.status}
                    label={p.status === "active" || p.status === "approved" ? "Live" : p.status === "inactive" ? "Hidden" : "Draft"}
                    className="shrink-0"
                  />
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                </Link>
              );
            })}
          </div>
          <TablePagination {...pager} onPage={pager.setPage} />
        </AdminListShell>
      </div>

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

    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Businesses" subtitle="Every business on the platform — drafts, live and hidden">
      {body}
    </SuperAdminLayout>
  );
};

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
  /**
   * An archetype with a `source_service_key` is shown to customers by a
   * bespoke legacy listing (food, cleaning, the beach club), and those pages
   * read their own tables — they do not list universal providers. A business
   * created under one is real, manageable and invisible, which is exactly how
   * the Massage provider sat on the Lifestyle tile for a week with nobody able
   * to reach it.
   */
  const pickedArchetype = archetypes.find((a) => a.key === archetypeKey);
  const bespokeListing = pickedArchetype?.source_service_key ?? null;

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
        {bespokeListing && (
          <p className="mt-1 text-xs text-attention">
            Customers see this service through the built-in {bespokeListing} page, which lists
            its own businesses only. A provider created here is manageable but will not appear
            on that page.
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
            No categories under this service — add one in Businesses → the service → Categories.
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
