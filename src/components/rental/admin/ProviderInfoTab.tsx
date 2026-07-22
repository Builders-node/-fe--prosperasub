import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, Phone, Mail, Info as InfoIcon, MapPin, Clock } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { ProviderEditDialog, type ProviderEditFields } from "@/components/provider/ProviderEditDialog";
import type { RentalProvider } from "@/types/carRental";

interface RentalProviderExtended extends RentalProvider {
  location?: string | null;
  working_hours?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
}

interface Props {
  provider: RentalProviderExtended;
}

/** Owner + admin info tab for a rental provider. Uses the shared
 *  ProviderEditDialog for a consistent look across all four services. */
export function ProviderInfoTab({ provider }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProviderEditFields>(() => hydrate(provider));

  const openEdit = () => { setForm(hydrate(provider)); setOpen(true); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const avatarUrl = form.avatar_url?.trim() || null;
      const payload = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        // Keep legacy logo_url in sync with avatar_url so older readers
        // (public rental listing, admin table) still see the image.
        logo_url: avatarUrl,
        avatar_url: avatarUrl,
        banner_url: form.banner_url?.trim() || null,
        location: form.location?.trim() || null,
        working_hours: form.working_hours?.trim() || null,
        contact_phone: form.contact_phone?.trim() || null,
        contact_email: form.contact_email?.trim() || null,
        status: (form.status || "active") as "active" | "inactive",
        sort_order: form.sort_order ?? 0,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseDb
        .from("rental_providers").update(payload).eq("id", provider.id);
      if (error) throw error;
      if (userData?.id) {
        await logAuditEvent(userData.id, "edit", "rental_provider", provider.id, payload);
      }
    },
    onSuccess: () => {
      toast.success("Provider updated");
      qc.invalidateQueries({ queryKey: ["admin-rental-provider", provider.id] });
      qc.invalidateQueries({ queryKey: ["admin-rental-providers"] });
      qc.invalidateQueries({ queryKey: ["admin-legacy-provider-row"] });
      qc.invalidateQueries({ queryKey: ["my-providers"] });
      setOpen(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Provider Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">Basic details and contact info</p>
        </div>
        <Button onClick={openEdit} variant="outline" className="gap-2 rounded-full">
          <Edit className="h-4 w-4" /> Edit
        </Button>
      </div>

      <div className="rounded-2xl bg-card p-5 space-y-4">
        <Row icon={<InfoIcon className="h-4 w-4 text-muted-foreground" />} label="Description">
          {provider.description ? provider.description : <em className="text-muted-foreground/70">No description</em>}
        </Row>
        <Row icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="Location">
          {provider.location ? provider.location : <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Working hours">
          {provider.working_hours ? provider.working_hours : <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Phone">
          {provider.contact_phone ? provider.contact_phone : <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Email">
          {provider.contact_email ? provider.contact_email : <em className="text-muted-foreground/70">Not set</em>}
        </Row>
      </div>

      <ProviderEditDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit provider"
        values={form}
        onChange={setForm}
        onSave={() => saveMutation.mutate()}
        saving={saveMutation.isPending}
      />
    </div>
  );
}

function hydrate(p: RentalProviderExtended): ProviderEditFields {
  return {
    name: p.name,
    description: p.description ?? "",
    // Bind the shared "avatar" field to whichever column has a value —
    // logo_url is the legacy column, avatar_url is what the shared shell reads.
    avatar_url: p.avatar_url ?? p.logo_url ?? "",
    banner_url: p.banner_url ?? "",
    location: p.location ?? "",
    working_hours: p.working_hours ?? "",
    contact_phone: p.contact_phone ?? "",
    contact_email: p.contact_email ?? "",
    status: p.status ?? "active",
    sort_order: p.sort_order ?? 0,
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
