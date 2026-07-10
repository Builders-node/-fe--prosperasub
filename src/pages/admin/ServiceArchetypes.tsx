import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff, Layers } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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
const QUERY_KEY = ["admin-service-archetypes"] as const;
const AUDIT_ENTITY = "service_archetype";
const BOOKING_MODELS = ["time_slot", "date_range", "capacity_seat"] as const;

interface Archetype {
  key: string;
  label: string;
  description: string | null;
  category_key: string | null;
  icon: string;
  accent: string;
  default_capabilities: string[];
  default_resource_type: string | null;
  default_booking_model: (typeof BOOKING_MODELS)[number] | null;
  default_booking_settings: unknown;
  is_active: boolean;
  sort_order: number;
}

const EMPTY: Archetype = {
  key: "", label: "", description: "",
  category_key: null, icon: "store", accent: "bg-blue-500",
  default_capabilities: [], default_resource_type: null, default_booking_model: null,
  default_booking_settings: null, is_active: true, sort_order: 0,
};

/**
 * Service archetypes = business-unit templates. A provider inherits an
 * archetype's capabilities + resource type + booking model + settings as its
 * defaults. Categories were retired — archetype is the single organizational unit.
 */
export default function ServiceArchetypes() {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<Archetype | "new" | null>(null);
  const [form, setForm] = useState<Archetype>({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Archetype | null>(null);
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.key.includes(q) || r.label.toLowerCase().includes(q));
  }, [rows, search]);

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, sort_order: rows.length }); };
  const openEdit = (a: Archetype) => { setEditing(a); setForm({ ...a, description: a.description ?? "" }); };

  const save = useMutation({
    mutationFn: async () => {
      const key = form.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!key || !form.label.trim()) throw new Error("Key and label are required");
      const payload = {
        ...form,
        key,
        description: (form.description ?? "").trim() || null,
        default_capabilities: form.default_capabilities ?? [],
        default_resource_type: form.default_resource_type || null,
        default_booking_model: form.default_booking_model || null,
        default_booking_settings: form.default_booking_settings ?? null,
      };
      if (editing === "new") {
        const { error } = await supabaseDb.from(TABLE).insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from(TABLE).update(payload).eq("key", (editing as Archetype).key);
        if (error) throw error;
      }
      if (userData?.id) await logAuditEvent(userData.id, editing === "new" ? "create" : "edit", AUDIT_ENTITY, key, {});
    },
    onSuccess: () => { toast.success("Saved"); setEditing(null); qc.invalidateQueries({ queryKey: QUERY_KEY }); },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const toggleCap = (cap: CapabilityKey) => {
    const set = new Set(form.default_capabilities);
    if (set.has(cap)) set.delete(cap); else set.add(cap);
    setForm({ ...form, default_capabilities: Array.from(set) });
  };

  return (
    <SuperAdminLayout title="Services" subtitle="Business-unit templates that new providers plug into">
      <div className="space-y-5">
        <AdminListShell
          actions={<Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New service</Button>}
          search={search} onSearch={setSearch} searchPlaceholder="Search services…"
          isLoading={isLoading} isEmpty={rows.length === 0}
          isNoResults={rows.length > 0 && filtered.length === 0} count={filtered.length}
          emptyTitle="No services yet" emptySubtitle="Create your first service archetype."
          onClearFilters={() => setSearch("")}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => {
              const Icon = resolveCategoryIcon(a.icon);
              const count = providerCounts[a.key] ?? 0;
              return (
                <div key={a.key} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", a.accent)}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-bold text-foreground">{a.label}</p>
                        <Badge className={a.is_active ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}>
                          {a.is_active ? "active" : "inactive"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] tabular-nums">
                          {count} {count === 1 ? "provider" : "providers"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{a.key}</p>
                      {a.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.default_capabilities?.map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                        ))}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        {a.default_resource_type && <span>Resource: <b>{a.default_resource_type}</b></span>}
                        {a.default_booking_model && <span>Model: <b>{a.default_booking_model}</b></span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleActive.mutate(a)}
                        title={a.is_active ? "Hide" : "Show"}>
                        {a.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(a)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => setDeleteTarget(a)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminListShell>
      </div>

      {/* Editor dialog */}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "New service" : "Edit service"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Key</Label>
              <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="car_rental" disabled={editing !== "new"} />
            </div>
            <div>
              <Label>Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Car Rental" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="One-line description shown on Discovery" />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Default resource type</Label>
              <Input value={form.default_resource_type ?? ""} onChange={(e) => setForm({ ...form, default_resource_type: e.target.value || null })} placeholder="e.g. vehicle, tennis, desk" />
            </div>
            <div>
              <Label>Default booking model</Label>
              <Select value={form.default_booking_model ?? ""} onValueChange={(v) => setForm({ ...form, default_booking_model: (v || null) as Archetype["default_booking_model"] })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {BOOKING_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Default capabilities</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(Object.keys(CAPABILITIES) as CapabilityKey[]).map((cap) => {
                  const on = form.default_capabilities?.includes(cap);
                  const meta = CAPABILITIES[cap];
                  const I = meta.icon;
                  return (
                    <button key={cap} type="button" onClick={() => toggleCap(cap)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}>
                      <I className="h-3 w-3" /> {meta.label}
                    </button>
                  );
                })}
              </div>
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
                  <button key={a} type="button" onClick={() => setForm({ ...form, accent: a })}
                    className={cn("h-9 rounded-lg", a, form.accent === a && "ring-2 ring-offset-2 ring-offset-background ring-foreground")}
                    aria-label={a}
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
