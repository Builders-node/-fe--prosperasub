import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
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
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";

interface Residence {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

const EMPTY = { name: "", sort_order: 0, is_active: true };

const FoodResidences = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<Residence | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Residence | null>(null);

  const { data: residences = [], isLoading } = useQuery({
    queryKey: ["admin-food-residences-all"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_residences")
        .select("id, name, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Residence[];
    },
  });

  // Subscription counts per residence (lightweight reach indicator).
  const { data: counts = {} } = useQuery({
    queryKey: ["admin-food-residence-counts"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_subscriptions").select("residence").not("residence", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { if (r.residence) map[r.residence] = (map[r.residence] ?? 0) + 1; });
      return map;
    },
  });

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, sort_order: residences.length }); };
  const openEdit = (r: Residence) => { setEditing(r); setForm({ name: r.name, sort_order: r.sort_order, is_active: r.is_active }); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), sort_order: form.sort_order, is_active: form.is_active };
      if (!payload.name) throw new Error("Name is required");
      if (editing === "new") {
        const { data, error } = await supabaseDb.from("food_residences").insert(payload).select("id").single();
        if (error) throw error;
        await logAuditEvent(userData!.id, "create", "food_residence", data.id, payload);
      } else if (editing && editing !== "new") {
        const { error } = await supabaseDb.from("food_residences").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logAuditEvent(userData!.id, "edit", "food_residence", editing.id, payload);
      }
    },
    onSuccess: () => {
      toast.success("Location saved");
      qc.invalidateQueries({ queryKey: ["admin-food-residences-all"] });
      qc.invalidateQueries({ queryKey: ["food-residences"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const toggleActive = async (r: Residence) => {
    const { error } = await supabaseDb.from("food_residences").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(!r.is_active ? "Location enabled" : "Location hidden");
    qc.invalidateQueries({ queryKey: ["admin-food-residences-all"] });
    qc.invalidateQueries({ queryKey: ["food-residences"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (r: Residence) => {
      const { error } = await supabaseDb.from("food_residences").delete().eq("id", r.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "delete", "food_residence", r.id, { name: r.name });
    },
    onSuccess: () => {
      toast.success("Location deleted");
      qc.invalidateQueries({ queryKey: ["admin-food-residences-all"] });
      qc.invalidateQueries({ queryKey: ["food-residences"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e?.message || "Could not delete"),
  });

  return (
    <SuperAdminLayout title="Locations" subtitle="Residences and delivery zones where the platform operates">
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button onClick={openNew} className="gap-2 rounded-full">
            <Plus className="h-4 w-4" /> New Location
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : residences.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-14 text-center">
            <MapPin className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="font-semibold">No locations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first residence to start delivering there.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {residences.map((r) => (
              <div key={r.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                  <MapPin className="h-5 w-5 text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{r.name}</span>
                    <Badge className={`rounded-full text-xs ${r.is_active ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                      {r.is_active ? "Active" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sort #{r.sort_order} · {counts[r.name] ?? 0} active subscription{(counts[r.name] ?? 0) !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={r.is_active ? "Hide" : "Enable"} onClick={() => toggleActive(r)}>
                    {r.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create / edit */}
        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing === "new" ? "New Location" : "Edit Location"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Pristine Bay" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sort order</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
                </div>
                <div>
                  <Label>Status</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.is_active ? "active" : "hidden"}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "active" }))}>
                    <option value="active">Active</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
                {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
                {editing === "new" ? "Create" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete location?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes <strong>{deleteTarget?.name}</strong> and removes it from provider service areas and plan availability.
                Existing subscriptions keep their stored address text. Consider hiding instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SuperAdminLayout>
  );
};

export default FoodResidences;
