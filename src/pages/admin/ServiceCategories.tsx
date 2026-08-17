import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff, MoreHorizontal, Layers } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { AdminPageTabs } from "@/components/admin/AdminPageTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImageField } from "@/components/food/ImageField";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CATEGORY_ACCENTS, CATEGORY_ICONS, CATEGORY_ICON_KEYS, resolveCategoryIcon } from "@/lib/services/categoryIcons";

const TABLE = "service_categories";
const QUERY_KEY = ["admin-service-categories"] as const;
const AUDIT_ENTITY = "service_category";

interface Category {
  key: string;
  label: string;
  archetype_key: string;
  icon: string;
  accent: string;
  is_active: boolean;
  sort_order: number;
  /** Cover photo — Discovery shows up to two per service. */
  image_url: string | null;
}

const EMPTY: Category = {
  key: "", label: "", archetype_key: "",
  icon: "store", accent: "bg-blue-500",
  is_active: true, sort_order: 0, image_url: null,
};

/**
 * Service categories = the middle layer of the marketplace model:
 *
 *     Service (archetype)  →  Category  →  Provider  →  Plan
 *     Cleaning             →  Car Wash  →  EverySub Car Wash → $29/mo
 *
 * A category groups providers that do the same *kind* of work inside one
 * service. Without it, a car-wash provider and an apartment-cleaning provider
 * both landed in the same undifferentiated list on /services/cleaning.
 *
 * Lives as a tab next to Services rather than its own sidebar entry — the two
 * are edited together and a separate nav item would just duplicate the surface.
 */
export interface ServiceCategoriesProps {
  /** Mounted as a tab inside the service detail page — skip the page chrome. */
  embedded?: boolean;
  /** Locks the list to one service; the chip-row filter is hidden when set. */
  archetypeKey?: string;
}

export default function ServiceCategories({ embedded = false, archetypeKey }: ServiceCategoriesProps = {}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { archetypes } = useServiceArchetypes();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [form, setForm] = useState<Category>({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  // Derived when the route pins the service — see the note in MarketplacePlans.
  const [archetypeFilterState, setArchetypeFilterState] = useState<string>("all");
  const archetypeFilter = archetypeKey ?? archetypeFilterState;

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from(TABLE).select("*")
        .order("archetype_key", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  // Provider count per category — tells the admin what a hide/delete affects.
  const { data: providerCounts = {} } = useQuery({
    queryKey: ["admin-category-provider-counts"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers").select("category_key");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p: any) => {
        if (p.category_key) counts[p.category_key] = (counts[p.category_key] ?? 0) + 1;
      });
      return counts;
    },
    staleTime: 30_000,
  });

  const archetypeLabel = (key: string) =>
    archetypes.find((a) => a.key === key)?.label ?? key;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (archetypeFilter !== "all" && r.archetype_key !== archetypeFilter) return false;
      if (!q) return true;
      return r.key.includes(q) || r.label.toLowerCase().includes(q);
    });
  }, [rows, search, archetypeFilter]);

  // Group by service so the parent → child relationship is visible at a glance,
  // which is the whole point of surfacing categories in the first place.
  const grouped = useMemo(() => {
    const byArchetype = new Map<string, Category[]>();
    filtered.forEach((c) => {
      if (!byArchetype.has(c.archetype_key)) byArchetype.set(c.archetype_key, []);
      byArchetype.get(c.archetype_key)!.push(c);
    });
    // Follow the archetypes' own sort order, then any orphans.
    const ordered: Array<{ key: string; label: string; categories: Category[] }> = [];
    archetypes.forEach((a) => {
      const list = byArchetype.get(a.key);
      if (list?.length) ordered.push({ key: a.key, label: a.label, categories: list });
    });
    byArchetype.forEach((list, key) => {
      if (!archetypes.some((a) => a.key === key)) {
        ordered.push({ key, label: archetypeLabel(key), categories: list });
      }
    });
    return ordered;
  }, [filtered, archetypes]);

  const counts = useMemo(() => ({
    total: rows.length,
    perArchetype: rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.archetype_key] = (acc[r.archetype_key] ?? 0) + 1;
      return acc;
    }, {}),
  }), [rows]);

  const openNew = () => {
    setEditing("new");
    setForm({
      ...EMPTY,
      // Pre-select the archetype the admin is currently filtered to — saves a
      // pick in the common "add another category to this service" flow.
      archetype_key: archetypeFilter !== "all" ? archetypeFilter : (archetypes[0]?.key ?? ""),
      sort_order: (rows.length + 1) * 10,
    });
  };
  const openEdit = (c: Category) => { setEditing(c); setForm({ ...c }); };

  const save = useMutation({
    mutationFn: async () => {
      const key = form.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!key || !form.label.trim()) throw new Error("Key and label are required");
      if (!form.archetype_key) throw new Error("Pick which service this category belongs to");
      const payload = { ...form, key, label: form.label.trim() };
      if (editing === "new") {
        const { error } = await supabaseDb.from(TABLE).insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from(TABLE).update(payload).eq("key", (editing as Category).key);
        if (error) throw error;
      }
      if (userData?.id) await logAuditEvent(userData.id, editing === "new" ? "create" : "edit", AUDIT_ENTITY, key, payload);
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // Public listings read categories to group providers — refresh them too.
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("categories") });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (c: Category) => {
      const { error } = await supabaseDb.from(TABLE).update({ is_active: !c.is_active }).eq("key", c.key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("categories") });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (c: Category) => {
      const { error } = await supabaseDb.from(TABLE).delete().eq("key", c.key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", AUDIT_ENTITY, c.key, {});
    },
    onSuccess: () => {
      toast.success("Deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scopedArchetypeCategories = rows.filter((r) => r.archetype_key === form.archetype_key);

  // Scope-aware empty state: inside one service, other services' categories
  // shouldn't make this look populated.
  const inScope = archetypeKey ? rows.filter((r) => r.archetype_key === archetypeKey) : rows;

  const body = (
    <>
      <div className="space-y-5">
        {!embedded && (
          <AdminPageTabs tabs={[
            { label: "Services", to: "/admin/services" },
            { label: "Categories", to: "/admin/services/categories", badge: counts.total },
          ]} />
        )}

        {/* Archetype filter — same chip row as the Providers page.
            Hidden when the route already pins the service. */}
        <div className="flex flex-wrap items-center gap-2">
          {(archetypeKey ? [] : [
            { key: "all", label: "All", count: counts.total },
            ...archetypes.map((a) => ({ key: a.key, label: a.label, count: counts.perArchetype[a.key] ?? 0 })),
          ]).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setArchetypeFilterState(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                archetypeFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>

        <AdminListShell
          actions={<Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New category</Button>}
          search={search} onSearch={setSearch} searchPlaceholder="Search categories by name or key…"
          isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
          isEmpty={inScope.length === 0}
          isNoResults={inScope.length > 0 && filtered.length === 0} count={filtered.length}
          emptyTitle="No categories yet"
          emptySubtitle="Categories group providers inside a service. Create one to split e.g. Cleaning into Apartment Cleaning and Car Wash."
          onClearFilters={() => { setSearch(""); setArchetypeFilterState("all"); }}
        >
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.key} className="space-y-3">
                {/* Parent service header — makes the hierarchy legible. */}
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-caption font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {group.label}
                  </h3>
                  <span className="text-caption text-muted-foreground/60">· {group.categories.length}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.categories.map((c) => {
                    const Icon = resolveCategoryIcon(c.icon);
                    const count = providerCounts[c.key] ?? 0;
                    return (
                      <div
                        key={c.key}
                        className={cn(
                          "flex items-start gap-3 rounded-2xl bg-card p-4 transition-colors",
                          !c.is_active && "opacity-60",
                        )}
                      >
                        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", c.accent, "bg-opacity-15")}>
                          <Icon className="h-5 w-5 text-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground">{c.label}</p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {c.is_active ? "Active" : "Hidden"}
                            {" · "}
                            <span className="tabular-nums">{count}</span> {count === 1 ? "provider" : "providers"}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="iconSm" variant="ghost" aria-label="Category actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={() => openEdit(c)}>
                              <Pencil className="h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleActive.mutate(c)}>
                              {c.is_active
                                ? <><EyeOff className="h-4 w-4" /> Hide from listings</>
                                : <><Eye className="h-4 w-4" /> Show on listings</>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setDeleteTarget(c)}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </AdminListShell>
      </div>

      {/* Editor */}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "New category" : "Edit category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Service <span className="text-destructive">*</span></Label>
              <Select
                value={form.archetype_key}
                onValueChange={(v) => setForm({ ...form, archetype_key: v })}
              >
                <SelectTrigger><SelectValue placeholder="Which service does this belong to?" /></SelectTrigger>
                <SelectContent>
                  {archetypes.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.archetype_key && scopedArchetypeCategories.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Already here: {scopedArchetypeCategories.map((c) => c.label).join(" · ")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Key</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="car_wash"
                  disabled={editing !== "new"}
                />
                {editing === "new" && (
                  <p className="mt-1 text-xs text-muted-foreground">Lowercase, underscores. Can't change later.</p>
                )}
              </div>
              <div>
                <Label>Label</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Car Wash"
                />
              </div>
            </div>

            <div>
              {/* Cover photo. Two categories in one service render side by
                  side on the Discovery tile, so landscape crops read best. */}
              <ImageField
                label="Cover photo"
                value={form.image_url ?? ""}
                onChange={(url) => setForm({ ...form, image_url: url || null })}
                pathPrefix="categories"
                variant="card"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown on the home screen tile for this service. Up to two categories
                per service get a photo there — the rest are listed by name.
              </p>
            </div>

            <div>
              <Label>Sort order</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
              />
              <p className="mt-1 text-xs text-muted-foreground">Lower shows first on the service page.</p>
            </div>

            <div>
              <Label>Icon</Label>
              <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                {CATEGORY_ICON_KEYS.map((k) => {
                  const I = CATEGORY_ICONS[k];
                  const on = form.icon === k;
                  return (
                    <button key={k} type="button" onClick={() => setForm({ ...form, icon: k })}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border",
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}>
                      <I className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Accent</Label>
              <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                {CATEGORY_ACCENTS.map((a) => (
                  <button key={a.value} type="button" onClick={() => setForm({ ...form, accent: a.value })}
                    className={cn("h-9 rounded-lg", a.value, form.accent === a.value && "ring-2 ring-offset-2 ring-offset-background ring-foreground")}
                    aria-label={a.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-1" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const n = deleteTarget ? providerCounts[deleteTarget.key] ?? 0 : 0;
                if (n === 0) return "No providers are in this category — safe to delete.";
                return `${n} ${n === 1 ? "provider is" : "providers are"} in this category. Deleting leaves them uncategorised: they'll show under "Other" on the public service page until you reassign them.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Categories" subtitle="Groups of providers inside a service — Cleaning → Apartment Cleaning · Car Wash">
      {body}
    </SuperAdminLayout>
  );
}
