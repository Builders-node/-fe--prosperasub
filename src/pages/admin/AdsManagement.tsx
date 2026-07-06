import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Megaphone, ExternalLink, X } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { AD_PLACEMENTS, EMPTY_AD, type Ad } from "@/types/ad";

const placementLabel = (value: string) =>
  AD_PLACEMENTS.find((p) => p.value === value)?.label ?? value;

// Live preview of the banner exactly as it renders on the site
function AdPreview({ form }: { form: typeof EMPTY_AD }) {
  return (
    <div
      className="relative flex items-center justify-center gap-2.5 overflow-hidden rounded-xl px-10 py-2.5"
      style={{
        background: `linear-gradient(90deg, ${form.gradient_from} 0%, ${form.gradient_via} 45%, ${form.gradient_to} 100%)`,
      }}
    >
      <span className="text-sm font-black uppercase tracking-wide" style={{ color: form.text_color }}>
        {form.label || "Banner text"}
      </span>
      {form.badge_text && (
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold"
          style={{ background: form.badge_bg, color: form.badge_text_color }}
        >
          {form.badge_text}
        </span>
      )}
      {form.cta_text && (
        <span className="text-xs font-medium" style={{ color: form.text_color, opacity: 0.85 }}>
          {form.cta_text}
        </span>
      )}
      {form.dismissible && (
        <X className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: form.text_color, opacity: 0.7 }} />
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 font-mono text-xs" />
      </div>
    </div>
  );
}

const AdsManagement = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editItem, setEditItem] = useState<Ad | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_AD });
  const [deleteTarget, setDeleteTarget] = useState<Ad | null>(null);

  const set = <K extends keyof typeof EMPTY_AD>(key: K, value: (typeof EMPTY_AD)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const { data: ads = [], isLoading } = useQuery({
    queryKey: ["admin-ads"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("promo_banners")
        .select("*")
        .order("placement", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Ad[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-ads"] });
    qc.invalidateQueries({ queryKey: ["active-ads"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        label: form.label.trim(),
        badge_text: form.badge_text.trim() || null,
        cta_text: form.cta_text.trim() || null,
        link_url: form.link_url.trim(),
        placement: form.placement,
        gradient_from: form.gradient_from,
        gradient_via: form.gradient_via,
        gradient_to: form.gradient_to,
        text_color: form.text_color,
        badge_bg: form.badge_bg,
        badge_text_color: form.badge_text_color,
        is_active: form.is_active,
        dismissible: form.dismissible,
        sort_order: Number(form.sort_order) || 0,
        updated_at: new Date().toISOString(),
      };
      let id = editItem?.id ?? "";
      if (isNew) {
        const { data, error } = await supabaseDb.from("promo_banners").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabaseDb.from("promo_banners").update(payload).eq("id", id);
        if (error) throw error;
      }
      if (userData?.id) await logAuditEvent(userData.id, isNew ? "create" : "edit", "plan", id, { entity: "ad", name: form.title });
    },
    onSuccess: () => {
      invalidate();
      toast.success(isNew ? "Ad created" : "Ad updated");
      close();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabaseDb.from("promo_banners").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("promo_banners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ad deleted");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNew = () => { setIsNew(true); setEditItem(null); setForm({ ...EMPTY_AD, sort_order: ads.length + 1 }); };
  const openEdit = (a: Ad) => {
    setIsNew(false); setEditItem(a);
    setForm({
      title: a.title, label: a.label, badge_text: a.badge_text ?? "", cta_text: a.cta_text ?? "",
      link_url: a.link_url, placement: a.placement,
      gradient_from: a.gradient_from, gradient_via: a.gradient_via, gradient_to: a.gradient_to,
      text_color: a.text_color, badge_bg: a.badge_bg, badge_text_color: a.badge_text_color,
      is_active: a.is_active, dismissible: a.dismissible, sort_order: a.sort_order,
    });
  };
  const close = () => { setEditItem(null); setIsNew(false); };

  const canSave = form.title.trim() && form.label.trim() && form.link_url.trim();

  return (
    <SuperAdminLayout title="Ads">
      <div className="max-w-3xl space-y-space-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Promotional banners shown across the site. Only the highest-priority active ad per placement is displayed.</p>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Ad</Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : ads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No ads yet. Create one to show a banner.</div>
        ) : (
          <div className="space-y-3">
            {ads.map((a) => (
              <div key={a.id} className={`rounded-2xl border bg-card p-4 ${a.is_active ? "border-border" : "border-border/40 opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Megaphone className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground truncate">{a.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                      <ExternalLink className="h-3 w-3 shrink-0" /> {a.link_url}
                    </p>
                  </div>
                  <Badge className="bg-muted text-muted-foreground text-[10px] uppercase">{placementLabel(a.placement)}</Badge>
                  {!a.is_active && <Badge className="bg-muted text-muted-foreground text-xs">Hidden</Badge>}
                  <div className="flex items-center gap-0.5">
                    <Switch checked={a.is_active} onCheckedChange={(c) => toggleMutation.mutate({ id: a.id, is_active: c })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTarget(a)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {/* Mini preview */}
                <div className="mt-3">
                  <AdPreview form={{ ...EMPTY_AD, ...a, badge_text: a.badge_text ?? "", cta_text: a.cta_text ?? "" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isNew || !!editItem} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{isNew ? "Add Ad" : "Edit Ad"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Live preview */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Live preview</Label>
              <AdPreview form={form} />
            </div>

            <div className="space-y-1.5">
              <Label>Internal name *</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Summer Promo" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Banner text *</Label>
                <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Get 20% off" />
              </div>
              <div className="space-y-1.5">
                <Label>Badge / pill</Label>
                <Input value={form.badge_text} onChange={(e) => set("badge_text", e.target.value)} placeholder="Pay with LIVES" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Trailing text</Label>
                <Input value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} placeholder="Open your account →" />
              </div>
              <div className="space-y-1.5">
                <Label>Placement</Label>
                <Select value={form.placement} onValueChange={(v) => set("placement", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AD_PLACEMENTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Link URL *</Label>
              <Input value={form.link_url} onChange={(e) => set("link_url", e.target.value)} placeholder="https://infinita.money/" />
            </div>

            <div className="space-y-2 rounded-xl border border-border/60 p-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colors</Label>
              <div className="grid grid-cols-3 gap-3">
                <ColorField label="Gradient left" value={form.gradient_from} onChange={(v) => set("gradient_from", v)} />
                <ColorField label="Gradient mid" value={form.gradient_via} onChange={(v) => set("gradient_via", v)} />
                <ColorField label="Gradient right" value={form.gradient_to} onChange={(v) => set("gradient_to", v)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <ColorField label="Text" value={form.text_color} onChange={(v) => set("text_color", v)} />
                <ColorField label="Badge bg" value={form.badge_bg} onChange={(v) => set("badge_bg", v)} />
                <ColorField label="Badge text" value={form.badge_text_color} onChange={(v) => set("badge_text_color", v)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority (lower = first)</Label>
                <Input type="number" min={0} value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} />
              </div>
              <div className="flex flex-col justify-end gap-2 pb-1">
                <div className="flex items-center gap-3">
                  <Switch checked={form.is_active} onCheckedChange={(c) => set("is_active", c)} />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.dismissible} onCheckedChange={(c) => set("dismissible", c)} />
                  <Label>Dismissible</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canSave}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ad?</AlertDialogTitle>
            <AlertDialogDescription><strong>{deleteTarget?.title}</strong> will be removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
};

export default AdsManagement;
