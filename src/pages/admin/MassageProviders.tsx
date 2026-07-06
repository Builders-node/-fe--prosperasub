import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { ServiceLocationsEditor } from "@/components/admin/ServiceLocationsEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";

const SERVICE = SERVICE_REGISTRY.massage as typeof SERVICE_REGISTRY.massage & {
  providers: NonNullable<typeof SERVICE_REGISTRY.massage["providers"]>;
};
const TABLE = SERVICE.providers.table;
const QUERY_KEY = ["admin-providers", SERVICE.key] as const;
const AUDIT_ENTITY = "massage_provider";

interface Provider {
  id: string; name: string; description: string | null; location: string | null;
  working_hours: string | null; status: string; sort_order: number;
}
const EMPTY = { name: "", description: "", location: "", working_hours: "", status: "active", sort_order: 0 };

const MassageProviders = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<Provider | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [search, setSearch] = useState("");

  const { data: providers = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from(TABLE).select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Provider[];
    },
  });
  const q = search.trim().toLowerCase();
  const visible = q ? providers.filter((p) => [p.name, p.description, p.location].some((v) => (v ?? "").toLowerCase().includes(q))) : providers;

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, sort_order: providers.length }); };
  const openEdit = (p: Provider) => { setEditing(p); setForm({ name: p.name, description: p.description ?? "", location: p.location ?? "", working_hours: p.working_hours ?? "", status: p.status, sort_order: p.sort_order }); };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), description: form.description.trim() || null, location: form.location.trim() || null, working_hours: form.working_hours.trim() || null, status: form.status, sort_order: form.sort_order, updated_at: new Date().toISOString() };
      if (!payload.name) throw new Error("Name is required");
      if (editing === "new") {
        const { data, error } = await supabaseDb.from(TABLE).insert(payload).select("id").single();
        if (error) throw error; await logAuditEvent(userData!.id, "create", AUDIT_ENTITY, data.id, payload);
      } else if (editing && editing !== "new") {
        const { error } = await supabaseDb.from(TABLE).update(payload).eq("id", editing.id);
        if (error) throw error; await logAuditEvent(userData!.id, "edit", AUDIT_ENTITY, editing.id, payload);
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: QUERY_KEY }); setEditing(null); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const toggle = async (p: Provider) => {
    const { error } = await supabaseDb.from(TABLE).update({ status: p.status === "active" ? "inactive" : "active" }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
  const del = useMutation({
    mutationFn: async (p: Provider) => { const { error } = await supabaseDb.from(TABLE).delete().eq("id", p.id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: QUERY_KEY }); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e?.message || "Could not delete"),
  });

  const Icon = SERVICE.icon;
  const labels = SERVICE.providers.labels;

  return (
    <SuperAdminLayout title={`${SERVICE.label} — ${labels.plural}`}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{labels.plural}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{labels.apply}</p>
          </div>
          <Button onClick={openNew} className="gap-2 rounded-full"><Plus className="h-4 w-4" /> New {labels.singular}</Button>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder={`Search ${labels.plural.toLowerCase()}…`}
          isLoading={isLoading} isEmpty={providers.length === 0}
          isNoResults={providers.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle={`No ${labels.plural.toLowerCase()} yet`}
          emptySubtitle={`Add your first ${labels.singular.toLowerCase()}.`}
          onClearFilters={() => setSearch("")}
        >
          <div className="space-y-3">
            {visible.map((p) => (
              <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
                  <Icon className="h-5 w-5 text-rose-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{p.name}</span>
                    <Badge className={`rounded-full text-xs ${p.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>{p.status}</Badge>
                  </div>
                  {p.location && <p className="mt-0.5 text-xs text-muted-foreground">{p.location}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggle(p)} title={p.status === "active" ? "Hide" : "Activate"}>
                    {p.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </AdminListShell>

        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing === "new" ? `New ${labels.singular}` : `Edit ${labels.singular}`}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Serenity Massage" /></div>
              <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Prospera Village…" /></div>
              <div><Label>Working hours</Label><Input value={form.working_hours} onChange={(e) => setForm((f) => ({ ...f, working_hours: e.target.value }))} placeholder="Mon–Sat 09:00–19:00" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                </div>
                <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} /></div>
              </div>
              {editing && editing !== "new" && (
                <div className="border-t border-border pt-4">
                  <ServiceLocationsEditor
                    table="massage_provider_residences" itemColumn="provider_id" itemId={editing.id}
                    title="Service locations"
                    description="Pick where this provider works. Leave empty to show everywhere."
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>{save.isPending && <Spinner size="sm" className="mr-2" />}{editing === "new" ? "Create" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete {labels.singular.toLowerCase()}?</AlertDialogTitle>
              <AlertDialogDescription>This permanently deletes <strong>{deleteTarget?.name}</strong> and its plans.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && del.mutate(deleteTarget)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SuperAdminLayout>
  );
};

export default MassageProviders;
