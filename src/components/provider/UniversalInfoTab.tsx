import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MapPin, Clock, Info as InfoIcon, Phone, Mail } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProviderEditDialog, type ProviderEditFields } from "@/components/provider/ProviderEditDialog";

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
  const [form, setForm] = useState<ProviderEditFields>(() => hydrate(provider));

  const openEdit = () => { setForm(hydrate(provider)); setOpen(true); };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        avatar_url: form.avatar_url?.trim() || null,
        banner_url: form.banner_url?.trim() || null,
        location: form.location?.trim() || null,
        working_hours: form.working_hours?.trim() || null,
        contact_phone: form.contact_phone?.trim() || null,
        contact_email: form.contact_email?.trim() || null,
        status: form.status || "active",
        sort_order: form.sort_order ?? 0,
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
      qc.invalidateQueries({ queryKey: ["admin-legacy-provider-row"] });
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

      <div className="rounded-2xl bg-card p-5 space-y-4">
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

      <ProviderEditDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit provider"
        values={form}
        onChange={setForm}
        onSave={() => save.mutate()}
        saving={save.isPending}
      />
    </div>
  );
}

function hydrate(p: UniversalProviderRow): ProviderEditFields {
  return {
    name: p.name,
    description: p.description ?? "",
    avatar_url: p.avatar_url ?? "",
    banner_url: p.banner_url ?? "",
    location: p.location ?? "",
    working_hours: p.working_hours ?? "",
    contact_phone: p.contact_phone ?? "",
    contact_email: p.contact_email ?? "",
    status: p.status ?? "active",
    sort_order: 0,
  };
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
