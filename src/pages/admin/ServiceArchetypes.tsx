import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff, MoreHorizontal } from "lucide-react";
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
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CATEGORY_ACCENTS, CATEGORY_ICONS, CATEGORY_ICON_KEYS, resolveCategoryIcon } from "@/lib/services/categoryIcons";
import { CAPABILITIES, type CapabilityKey } from "@/components/provider/capabilities";

const TABLE = "service_archetypes";
import { ServiceArchetypeDialog, type Archetype } from "@/components/admin/ServiceArchetypeDialog";

const QUERY_KEY = ["admin-service-archetypes"] as const;
const AUDIT_ENTITY = "service_archetype";
/**
 * Service archetypes = business-unit templates. A provider inherits an
 * archetype's capabilities + resource type + booking model + settings as its
 * defaults. Categories were retired — archetype is the single organizational unit.
 */
export default function ServiceArchetypes() {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<Archetype | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Archetype | null>(null);
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from(TABLE).select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Archetype[];
    },
  });

  // Provider count per archetype — surfaces impact of enabling/disabling/deleting.
  const { data: providerCounts = {} } = useQuery({
    queryKey: ["admin-archetype-provider-counts"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers").select("archetype_key");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p: any) => {
        if (p.archetype_key) counts[p.archetype_key] = (counts[p.archetype_key] ?? 0) + 1;
      });
      return counts;
    },
    staleTime: 30_000,
  });

  // Categories per archetype — the middle layer of the model. Shown as chips
  // on each service card so the admin can see the whole
  // Service → Category → Provider shape without leaving this page.
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-service-categories"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories").select("key, label, archetype_key, is_active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; archetype_key: string; is_active: boolean }>;
    },
    staleTime: 30_000,
  });
  const categoriesByArchetype = useMemo(() => {
    const m: Record<string, Array<{ key: string; label: string; is_active: boolean }>> = {};
    categories.forEach((c) => {
      (m[c.archetype_key] ??= []).push({ key: c.key, label: c.label, is_active: c.is_active });
    });
    return m;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.key.includes(q) || r.label.toLowerCase().includes(q));
  }, [rows, search]);

  const openNew = () => setEditing("new");
  const openEdit = (a: Archetype) => setEditing(a);

  const toggleActive = useMutation({
    mutationFn: async (a: Archetype) => {
      const { error } = await supabaseDb.from(TABLE).update({ is_active: !a.is_active }).eq("key", a.key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (a: Archetype) => {
      const { error } = await supabaseDb.from(TABLE).delete().eq("key", a.key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", AUDIT_ENTITY, a.key, {});
    },
    onSuccess: () => { toast.success("Deleted"); setDeleteTarget(null); qc.invalidateQueries({ queryKey: QUERY_KEY }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SuperAdminLayout title="Services" subtitle="Business-unit templates that new providers plug into">
      <div className="space-y-5">
        <AdminPageTabs tabs={[
          { label: "Services", to: "/admin/services" },
          { label: "Categories", to: "/admin/services/categories", badge: categories.length },
        ]} />

        <AdminListShell
          actions={<Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New service</Button>}
          search={search} onSearch={setSearch} searchPlaceholder="Search services…"
          isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
          isEmpty={rows.length === 0}
          isNoResults={rows.length > 0 && filtered.length === 0} count={filtered.length}
          emptyTitle="No services yet" emptySubtitle="Create your first service archetype."
          onClearFilters={() => setSearch("")}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => {
              const Icon = resolveCategoryIcon(a.icon);
              const count = providerCounts[a.key] ?? 0;
              const inactive = !a.is_active;
              return (
                <div
                  key={a.key}
                  className={cn(
                    "flex flex-col gap-3 rounded-radius-md bg-card p-4 transition-colors",
                    inactive && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon plaque tinted with the archetype's accent — same
                        hue as before but at low alpha so it reads as a chip,
                        not a vivid button. Kills the "colored disc chaos" from
                        the old design. */}
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md", a.accent, "bg-opacity-15")}>
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{a.label}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {inactive ? "Inactive" : "Active"}
                        {" · "}
                        <span className="tabular-nums">{count}</span> {count === 1 ? "provider" : "providers"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="iconSm" variant="ghost" aria-label="Service actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleActive.mutate(a)}>
                          {a.is_active
                            ? <><EyeOff className="h-4 w-4" /> Hide from Discovery</>
                            : <><Eye className="h-4 w-4" /> Show on Discovery</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setDeleteTarget(a)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {a.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{a.description}</p>
                  )}
                  {/* Categories under this service — the layer between the
                      service and its providers. Click-through to manage. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(categoriesByArchetype[a.key] ?? []).map((c) => (
                      <span
                        key={c.key}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          c.is_active
                            ? "bg-primary/10 text-primary"
                            : "bg-muted/60 text-muted-foreground line-through",
                        )}
                      >
                        {c.label}
                      </span>
                    ))}
                    <Link
                      to="/admin/services/categories"
                      className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {(categoriesByArchetype[a.key] ?? []).length === 0 ? "+ Add category" : "Manage"}
                    </Link>
                  </div>
                  {a.default_capabilities?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {a.default_capabilities.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {(CAPABILITIES[c as CapabilityKey]?.label ?? c).replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </AdminListShell>
      </div>

      {/* Editor dialog */}
      <ServiceArchetypeDialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        archetype={editing}
        invalidateKeys={[[...QUERY_KEY]]}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const n = deleteTarget ? providerCounts[deleteTarget.key] ?? 0 : 0;
                if (n === 0) return "No providers link to this archetype — safe to delete.";
                return `${n} ${n === 1 ? "provider currently links" : "providers currently link"} to this archetype. They'll keep their capabilities but lose the archetype pointer — new plans/bookings won't inherit archetype defaults.`;
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
    </SuperAdminLayout>
  );
}
