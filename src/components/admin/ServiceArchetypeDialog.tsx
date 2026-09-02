import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { CAPABILITIES, type CapabilityKey } from "@/components/provider/capabilities";
import { CATEGORY_ACCENTS, CATEGORY_ICONS, CATEGORY_ICON_KEYS } from "@/lib/services/categoryIcons";
import { cn } from "@/lib/utils";

/**
 * Create/edit form for a service archetype.
 *
 * Lifted out of the flat Services list so the per-service page can edit the
 * service you're standing on. Its "Edit service" button used to navigate to
 * `/admin/services` — the list of ALL services — which is the opposite of what
 * the button says, and it dropped you out of the service you were working in.
 */

export const BOOKING_MODELS = ["time_slot", "date_range", "capacity_seat"] as const;

export interface Archetype {
  key: string;
  label: string;
  description: string | null;
  icon: string;
  accent: string;
  sort_order: number;
  is_active: boolean;
  default_capabilities: string[];
  default_resource_type: string | null;
  default_booking_model: (typeof BOOKING_MODELS)[number] | null;
  source_service_key?: string | null;
  category_key?: string | null;
  /** Opaque per-archetype booking config — carried through edits untouched. */
  default_booking_settings?: unknown;
}

export const EMPTY_ARCHETYPE: Archetype = {
  key: "", label: "", description: "",
  icon: "store", accent: "bg-blue-500",
  sort_order: 0, is_active: true,
  default_capabilities: [], default_resource_type: null, default_booking_model: null,
};

const TABLE = "service_archetypes";
const AUDIT_ENTITY = "service_archetype";

export function ServiceArchetypeDialog({
  open, onOpenChange, archetype, onSaved, invalidateKeys = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row to edit, or "new" to create one. */
  archetype: Archetype | "new" | null;
  onSaved?: () => void;
  /** Extra React Query keys to refresh — callers cache archetypes differently. */
  invalidateKeys?: unknown[][];
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [form, setForm] = useState<Archetype>({ ...EMPTY_ARCHETYPE });
  const isNew = archetype === "new";

  // Reseed whenever the dialog opens on a different row — otherwise editing two
  // services in a row shows the first one's values in the second one's form.
  useEffect(() => {
    if (!open || !archetype) return;
    setForm(isNew ? { ...EMPTY_ARCHETYPE } : { ...archetype, description: archetype.description ?? "" });
  }, [open, archetype, isNew]);

  const toggleCap = (cap: CapabilityKey) => {
    const set = new Set(form.default_capabilities);
    if (set.has(cap)) set.delete(cap); else set.add(cap);
    setForm({ ...form, default_capabilities: Array.from(set) });
  };

  const save = useMutation({
    mutationFn: async () => {
      const key = form.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!key || !form.label.trim()) throw new Error("Key and label are required");
      const payload = { ...form, key, label: form.label.trim() };
      if (isNew) {
        const { error } = await supabaseDb.from(TABLE).insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from(TABLE).update(payload).eq("key", (archetype as Archetype).key);
        if (error) throw error;
      }
      if (userData?.id) await logAuditEvent(userData.id, isNew ? "create" : "edit", AUDIT_ENTITY, key, {});
    },
    onSuccess: () => {
      toast.success("Saved");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["admin-service-archetypes"] });
      qc.invalidateQueries({ queryKey: ["service-archetypes"] });
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "New service" : "Edit service"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Key</Label>
            {/* Locked after creation: the key is the URL segment and the FK
                every provider points at — renaming it orphans them. */}
            <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="car_rental" disabled={!isNew} />
          </div>
          <div>
            <Label>Label</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Car Rental" />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shown on Discovery when the service has no categories yet" />
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
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
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
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {CATEGORY_ACCENTS.map((a) => (
                <button key={a.value} type="button" onClick={() => setForm({ ...form, accent: a.value })}
                  className={cn("h-9 rounded-lg", a.value, form.accent === a.value && "ring-2 ring-offset-2 ring-offset-background ring-foreground")}
                  aria-label={a.label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Spinner size="sm" className="mr-1" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
