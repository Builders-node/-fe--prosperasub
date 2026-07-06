import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MapPin, Clock, Info as InfoIcon, Phone, Mail } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export interface UniversalProviderRow {
  id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  working_hours?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  status?: string | null;
  category_key?: string;
  capabilities?: string[];
  source_service_key?: string | null;
  source_provider_id?: string | null;
  booking_settings?: unknown;
}

/**
 * The one universal tab. Works for any provider row in the new
 * `providers` table regardless of category. Legacy per-service Info tabs
 * (RestaurantInfoTab, ProviderInfoTab) live on for backward compat.
 */
export function UniversalInfoTab({ provider }: { provider: UniversalProviderRow }) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: provider.name,
    description: provider.description ?? "",
    location: provider.location ?? "",
    working_hours: provider.working_hours ?? "",
    contact_phone: provider.contact_phone ?? "",
    contact_email: provider.contact_email ?? "",
  });

  const openEdit = () => {
    setForm({
      name: provider.name,
      description: provider.description ?? "",
      location: provider.location ?? "",
      working_hours: provider.working_hours ?? "",
      contact_phone: provider.contact_phone ?? "",
      contact_email: provider.contact_email ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        working_hours: form.working_hours.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (!payload.name) throw new Error("Name is required");
      const { error } = await supabaseDb.from("providers").update(payload).eq("id", provider.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", "provider", provider.id, payload);
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">Business details shown to customers</p>
        </div>
        <Button onClick={openEdit} variant="outline" className="gap-2 rounded-full">
          <Edit className="h-4 w-4" /> Edit
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Row icon={<InfoIcon className="h-4 w-4 text-muted-foreground" />} label="Description">
          {provider.description || <em className="text-muted-foreground/70">No description</em>}
        </Row>
        <Row icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="Location">
          {provider.location || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Working hours">
          {provider.working_hours || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Phone">
          {provider.contact_phone || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Email">
          {provider.contact_email || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit information</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Prospera Village…" /></div>
            <div><Label>Working hours</Label><Input value={form.working_hours} onChange={(e) => setForm((f) => ({ ...f, working_hours: e.target.value }))} placeholder="Mon–Sat 08:00–18:00" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} placeholder="+504…" /></div>
              <div><Label>Email</Label><Input value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} placeholder="hello@…" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-2" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-foreground">{children}</p>
      </div>
    </div>
  );
}
