import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";

interface Provider { id: string; name: string; }
interface Plan {
  id: string; provider_id: string; name: string; description: string | null;
  price_cents: number; duration_minutes: number; sessions_per_period: number; status: string; sort_order: number;
}
const EMPTY = { name: "", description: "", price_cents: 0, duration_minutes: 60, sessions_per_period: 1, status: "active", sort_order: 0 };

const MassagePlans = () => {
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState<string>("");
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const { data: providers = [] } = useQuery({
    queryKey: ["admin-massage-providers-min"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("massage_providers").select("id, name").order("sort_order");
      if (error) throw error;
      const list = (data ?? []) as Provider[];
      if (!providerId && list.length) setProviderId(list[0].id);
      return list;
    },
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-massage-plans", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("massage_plans").select("*").eq("provider_id", providerId).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, sort_order: plans.length }); };
  const openEdit = (p: Plan) => { setEditing(p); setForm({ name: p.name, description: p.description ?? "", price_cents: p.price_cents, duration_minutes: p.duration_minutes, sessions_per_period: p.sessions_per_period, status: p.status, sort_order: p.sort_order }); };

  const save = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error("Pick a provider first");
      const payload = { provider_id: providerId, name: form.name.trim(), description: form.description.trim() || null, price_cents: form.price_cents, duration_minutes: form.duration_minutes, sessions_per_period: form.sessions_per_period, status: form.status, sort_order: form.sort_order, updated_at: new Date().toISOString() };
      if (!payload.name) throw new Error("Name is required");
      if (editing === "new") { const { error } = await supabaseDb.from("massage_plans").insert(payload); if (error) throw error; }
      else if (editing && editing !== "new") { const { error } = await supabaseDb.from("massage_plans").update(payload).eq("id", editing.id); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-massage-plans", providerId] }); setEditing(null); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });
  const toggle = async (p: Plan) => { const { error } = await supabaseDb.from("massage_plans").update({ status: p.status === "active" ? "inactive" : "active" }).eq("id", p.id); if (error) { toast.error(error.message); return; } qc.invalidateQueries({ queryKey: ["admin-massage-plans", providerId] }); };
  const del = useMutation({ mutationFn: async (p: Plan) => { const { error } = await supabaseDb.from("massage_plans").delete().eq("id", p.id); if (error) throw error; }, onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-massage-plans", providerId] }); setDeleteTarget(null); }, onError: (e: any) => toast.error(e?.message) });

  return (
    <SuperAdminLayout title="Massage — Plans">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Plans</h1>
            <p className="mt-1 text-sm text-muted-foreground">Massage services & packages per provider</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="h-9 w-[200px] rounded-full"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={openNew} className="gap-2 rounded-full" disabled={!providerId}><Plus className="h-4 w-4" /> New Plan</Button>
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-14 text-center text-sm text-muted-foreground">Create a provider first.</div>
        ) : isLoading ? (
          <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-14 text-center"><p className="font-semibold">No plans yet</p><p className="mt-1 text-sm text-muted-foreground">Add the first plan for this provider.</p></div>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{p.name}</span>
                    <Badge className={`rounded-full text-xs ${p.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>{p.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{formatUSD(p.price_cents)} · {p.duration_minutes} min · {p.sessions_per_period} session{p.sessions_per_period !== 1 ? "s" : ""}/period</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggle(p)}>{p.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing === "new" ? "New Plan" : "Edit Plan"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Deep Tissue" /></div>
              <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Price ($)</Label><Input type="number" min={0} step={0.01} value={(form.price_cents / 100).toFixed(2)} onChange={(e) => setForm((f) => ({ ...f, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))} /></div>
                <div><Label>Duration (min)</Label><Input type="number" min={15} step={15} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value || "60") }))} /></div>
                <div><Label>Sessions</Label><Input type="number" min={1} value={form.sessions_per_period} onChange={(e) => setForm((f) => ({ ...f, sessions_per_period: parseInt(e.target.value || "1") }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Status</Label><select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>{save.isPending && <Spinner size="sm" className="mr-2" />}{editing === "new" ? "Create" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete plan?</AlertDialogTitle><AlertDialogDescription>Permanently delete <strong>{deleteTarget?.name}</strong>.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && del.mutate(deleteTarget)}>Delete</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SuperAdminLayout>
  );
};

export default MassagePlans;
