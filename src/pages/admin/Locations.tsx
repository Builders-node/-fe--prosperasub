import { fieldClass } from "@/components/ui/input";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { MobileActionSheet } from "@/components/admin/MobileActionSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchAllRows } from "@/lib/supabasePaging";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { QueryError } from "@/components/patterns/QueryError";
import { StatusPill } from "@/components/patterns/StatusPill";
import { toast } from "sonner";
import { tr, trx } from "@/lib/tr";

interface Residence {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

const EMPTY = { name: "", sort_order: 0, is_active: true };

const Locations = () => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Residence | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Residence | null>(null);

  const { data: residences = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-food-residences-all"],
    queryFn: async () => {
      // Through NestJS so RBAC applies — this table has permissive RLS and
      // was previously written straight from the browser with the anon key.
      const { data, error } = await adminApi("/admin/locations");
      if (error) throw error;
      return ((data ?? []) as Residence[])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
    },
  });

  // Subscription counts per residence (lightweight reach indicator).
  const { data: counts = {} } = useQuery({
    queryKey: ["admin-food-residence-counts"],
    queryFn: async () => {
      const data = await fetchAllRows<any>(() => supabaseDb
        .from("food_subscriptions").select("residence").not("residence", "is", null).order("id"));
      const map: Record<string, number> = {};
      data.forEach((r: any) => { if (r.residence) map[r.residence] = (map[r.residence] ?? 0) + 1; });
      return map;
    },
  });

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, sort_order: residences.length }); };
  const openEdit = (r: Residence) => { setEditing(r); setForm({ name: r.name, sort_order: r.sort_order, is_active: r.is_active }); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), sort_order: form.sort_order, is_active: form.is_active };
      if (!payload.name) throw new Error(tr("Name is required"));
      const { error } = editing === "new"
        ? await adminApi("/admin/locations", { method: "POST", body: JSON.stringify(payload) })
        : await adminApi(`/admin/locations/${(editing as Residence).id}`, {
            method: "PATCH", body: JSON.stringify(payload),
          });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Location saved"));
      qc.invalidateQueries({ queryKey: ["admin-food-residences-all"] });
      qc.invalidateQueries({ queryKey: ["food-residences"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message || tr("Could not save")),
  });

  // Was a bare `await` outside React Query: no pending state, no audit entry.
  const toggleMutation = useMutation({
    mutationFn: async (r: Residence) => {
      const { error } = await adminApi(`/admin/locations/${r.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !r.is_active }),
      });
      if (error) throw error;
      return !r.is_active;
    },
    onSuccess: (nowActive) => {
      toast.success(nowActive ? tr("Location enabled") : tr("Location hidden"));
      qc.invalidateQueries({ queryKey: ["admin-food-residences-all"] });
      qc.invalidateQueries({ queryKey: ["food-residences"] });
    },
    onError: (e: any) => toast.error(e?.message || tr("Could not update")),
  });
  const toggleActive = (r: Residence) => toggleMutation.mutate(r);

  const deleteMutation = useMutation({
    mutationFn: async (r: Residence) => {
      const { error } = await adminApi(`/admin/locations/${r.id}`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Location deleted"));
      qc.invalidateQueries({ queryKey: ["admin-food-residences-all"] });
      qc.invalidateQueries({ queryKey: ["food-residences"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e?.message || tr("Could not delete")),
  });

  return (
    <SuperAdminLayout title={tr("Locations")} subtitle={tr("Residences and delivery zones where the platform operates")}>
      <div className="space-y-6">
        {/* The same scaffold every admin list uses — this page kept its own
            loading rows, its own bordered empty state and a lone right-hung
            button where the shell has an actions slot. */}
        <AdminListShell
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={() => void refetch()}
          isEmpty={residences.length === 0}
          emptyTitle={tr("No locations yet")}
          emptySubtitle={tr("Add your first residence to start delivering there.")}
          actions={
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" />{" "}{tr("New Location")}</Button>
          }
        >
          <div className="space-y-3">
            {residences.map((r) => (
              <div key={r.id} className="flex items-center gap-4 rounded-radius-md bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-muted">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{r.name}</span>
                    <StatusPill status={r.is_active ? "active" : "inactive"} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{(counts[r.name] ?? 0) !== 1 ? trx("Sort #{sort_order} · {value} active subscriptions", { sort_order: r.sort_order, value: counts[r.name] ?? 0 }) : trx("Sort #{sort_order} · {value} active subscription", { sort_order: r.sort_order, value: counts[r.name] ?? 0 })}
                  </p>
                </div>
                {/* Three unlabelled 32px icons whose only explanation was a
                    hover title (and two had none). A desktop gets the words;
                    a phone gets one 44px target that opens a labelled sheet. */}
                <div className="hidden shrink-0 gap-1 md:flex">
                  <Button size="sm" variant="ghost" disabled={toggleMutation.isPending} onClick={() => toggleActive(r)}
                    aria-label={`${r.is_active ? "Hide" : "Enable"} ${r.name}`}>
                    {r.is_active ? <EyeOff /> : <Eye />}
                    {r.is_active ? tr("Hide") : tr("Enable")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)} aria-label={tr("Edit {name}", { name: r.name })}>
                    <Pencil />{" "}{tr("Edit")}</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}
                    aria-label={tr("Delete {name}", { name: r.name })}>
                    <Trash2 />{" "}{tr("Delete")}</Button>
                </div>
                <MobileActionSheet
                  title={r.name}
                  className="h-11 w-11 shrink-0 md:hidden"
                  actions={[
                    { label: r.is_active ? tr("Hide") : tr("Enable"), icon: r.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />, onClick: () => toggleActive(r), disabled: toggleMutation.isPending },
                    { label: tr("Edit"), icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) },
                    { label: tr("Delete…"), icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteTarget(r) },
                  ]}
                />
              </div>
            ))}
          </div>
        </AdminListShell>

        {/* Create / edit */}
        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing === "new" ? tr("New location") : tr("Edit location")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{tr("Name *")}</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={tr("e.g. Pristine Bay")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{tr("Sort order")}</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
                </div>
                <div>
                  <Label>{tr("Status")}</Label>
                  <select className={fieldClass}
                    value={form.is_active ? "active" : "hidden"}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "active" }))}>
                    <option value="active">{tr("Active")}</option>
                    <option value="hidden">{tr("Hidden")}</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
                {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
                {editing === "new" ? tr("Create") : tr("Save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tr("Delete location?")}</AlertDialogTitle>
              <AlertDialogDescription>{tr("This permanently deletes")}{" "}<strong>{deleteTarget?.name}</strong>{" "}{tr("and removes it from provider service areas and plan availability. Existing subscriptions keep their stored address text. Consider hiding instead.")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>{tr("Delete")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SuperAdminLayout>
  );
};

export default Locations;
