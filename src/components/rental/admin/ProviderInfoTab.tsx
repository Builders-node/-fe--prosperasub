import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, Phone, Mail, Info as InfoIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import type { RentalProvider } from "@/types/carRental";

interface Props {
  provider: RentalProvider;
}

const emptyForm = (provider: RentalProvider) => ({
  name: provider.name,
  description: provider.description ?? "",
  logo_url: provider.logo_url ?? "",
  contact_phone: provider.contact_phone ?? "",
  contact_email: provider.contact_email ?? "",
  status: provider.status,
  sort_order: provider.sort_order,
});

export function ProviderInfoTab({ provider }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm(provider));

  const openEdit = () => {
    setForm(emptyForm(provider));
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        logo_url: form.logo_url.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        status: form.status,
        sort_order: form.sort_order,
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
      setOpen(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-6">
      {/* Header with edit button */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Provider Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">Basic details and contact info</p>
        </div>
        <Button onClick={openEdit} variant="outline" className="gap-2 rounded-full">
          <Edit className="h-4 w-4" /> Edit
        </Button>
      </div>

      {/* Description */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <InfoIcon className="h-4 w-4 text-orange-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</h3>
        </div>
        {provider.description ? (
          <p className="text-sm text-foreground whitespace-pre-line">{provider.description}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No description set</p>
        )}
      </section>

      {/* Contact */}
      <section className="divide-y divide-border rounded-2xl border border-border bg-card">
        <InfoRow
          icon={<Phone className="h-4 w-4" />}
          label="Phone"
          value={provider.contact_phone}
        />
        <InfoRow
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          value={provider.contact_email}
        />
      </section>

      {/* ─── Edit dialog ──────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Provider</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Atlantis Rentals" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3} placeholder="About this rental company..." />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input value={form.logo_url}
                onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="+504 ..." type="tel" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                  placeholder="info@company.com" type="email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3 p-5">
      <span className="mt-0.5 shrink-0 text-orange-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-foreground">
          {value || <span className="italic text-muted-foreground">Not set</span>}
        </p>
      </div>
    </div>
  );
}
