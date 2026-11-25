import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { useConfirm } from "@/components/patterns/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
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
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS } from "@/lib/services/categoryIcons";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

/**
 * The service panel — everything about one service, opened from its row on
 * the Services list. It replaces the per-service page, whose two tabs only
 * repeated the Businesses list and the category chips the row already shows.
 *
 * What an admin changes day to day is up front: name, icon, description, on
 * the site or not, delete. How the service books (family, resource type,
 * booking model, capabilities) is set once, so it sits under "Advanced".
 * Order is not a field: it is the row's place in the list (drag it).
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
  /** Top-level Discovery tab this service files under (experiences | transport | …). */
  family?: string;
  /** Opaque per-archetype booking config — carried through edits untouched. */
  default_booking_settings?: unknown;
}

export const EMPTY_ARCHETYPE: Archetype = {
  key: "", label: "", description: "",
  icon: "store", accent: "bg-blue-500",
  sort_order: 0, is_active: true, family: "experiences",
  default_capabilities: [], default_resource_type: null, default_booking_model: null,
};

const TABLE = "service_archetypes";
const AUDIT_ENTITY = "service_archetype";

export function ServiceArchetypeDialog({
  open, onOpenChange, archetype, onSaved, invalidateKeys = [], nextSortOrder = 0, businessCount = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row to edit, or "new" to create one. */
  archetype: Archetype | "new" | null;
  onSaved?: () => void;
  /** Extra React Query keys to refresh — callers cache archetypes differently. */
  invalidateKeys?: unknown[][];
  /** Where a new service lands: the end of the list. */
  nextSortOrder?: number;
  /** Businesses in this service — said before deleting it. */
  businessCount?: number;
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [form, setForm] = useState<Archetype>({ ...EMPTY_ARCHETYPE });
  const isNew = archetype === "new";

  // Reseed whenever the panel opens on a different row — otherwise editing two
  // services in a row shows the first one's values in the second one's form.
  useEffect(() => {
    if (!open || !archetype) return;
    setForm(isNew ? { ...EMPTY_ARCHETYPE, sort_order: nextSortOrder } : { ...archetype, description: archetype.description ?? "" });
  }, [open, archetype, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCap = (cap: CapabilityKey) => {
    const set = new Set(form.default_capabilities);
    if (set.has(cap)) set.delete(cap); else set.add(cap);
    setForm({ ...form, default_capabilities: Array.from(set) });
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-service-archetypes"] });
    qc.invalidateQueries({ queryKey: ["service-archetypes"] });
    invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const key = (form.key.trim() || slugKey(form.label)).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!form.label.trim()) throw new Error(tr("Give the service a name"));
      if (!key) throw new Error(tr("The id can't be empty"));
      // Only the table's own columns. The row a caller hands in is often the
      // HOOK's shape (useServiceArchetypes adds a resolved `Icon` component,
      // counts, …), and spreading it made PostgREST refuse the whole write.
      const payload = {
        key,
        label: form.label.trim(),
        description: form.description,
        icon: form.icon,
        accent: form.accent,
        sort_order: form.sort_order,
        is_active: form.is_active,
        default_capabilities: form.default_capabilities,
        default_resource_type: form.default_resource_type,
        default_booking_model: form.default_booking_model,
        ...(form.family !== undefined ? { family: form.family } : {}),
        ...(form.source_service_key !== undefined ? { source_service_key: form.source_service_key } : {}),
        ...(form.category_key !== undefined ? { category_key: form.category_key } : {}),
        ...(form.default_booking_settings !== undefined ? { default_booking_settings: form.default_booking_settings } : {}),
      };
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
      toast.success(tr("Saved"));
      onOpenChange(false);
      refresh();
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const key = (archetype as Archetype).key;
      const { error } = await supabaseDb.from(TABLE).delete().eq("key", key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", AUDIT_ENTITY, key, {});
    },
    onSuccess: () => { toast.success(tr("Service deleted")); onOpenChange(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const askDelete = async () => {
    const ok = await confirm({
      title: tr("Delete {value}?", { value: form.label || tr("this service") }),
      description: businessCount === 0
        ? tr("No businesses are in this service.")
        : tr("{businessCount} {value} in it. They stay, without a service: find them in Businesses under \"No service\".", { businessCount, value: businessCount === 1 ? tr("business is") : tr("businesses are") }),
      confirmLabel: tr("Delete"),
    });
    if (ok) remove.mutate();
  };

  return (
    <>
    {confirmDialog}
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? tr("New service") : form.label || tr("Service")}
      className="sm:max-w-[560px]"
      footer={
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="ghost" className="gap-1.5 text-negative hover:text-negative" onClick={askDelete} disabled={remove.isPending}>
              <Trash2 className="h-4 w-4" />{" "}{tr("Delete")}</Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Spinner size="sm" className="mr-1" />}{" "}{tr("Save")}</Button>
        </div>
      }
    >
      <DialogBlock>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">{tr("Name")}</Label>
            <Input id="svc-name" value={form.label}
              onChange={(e) => {
                const label = e.target.value;
                // A new service's id follows its name until someone edits it.
                const auto = isNew && (form.key === "" || form.key === slugKey(form.label));
                setForm({ ...form, label, ...(auto ? { key: slugKey(label) } : {}) });
              }}
              placeholder={tr("Cleaning")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-desc">{tr("Description")}</Label>
            <Input id="svc-desc" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={tr("Shown on the site while the service has no categories")} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("Icon")}</Label>
            <IconGrid value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-radius-md bg-inset px-3 py-2.5">
            <span>
              <span className="block text-body font-semibold text-foreground">{tr("On the site")}</span>
              <span className="block text-meta text-muted-foreground">{form.is_active ? tr("Customers see this service") : tr("Hidden from customers")}</span>
            </span>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </label>

          <details className="group rounded-radius-md bg-inset px-3 py-2.5">
            <summary className="cursor-pointer select-none text-body font-semibold text-foreground">{tr("Advanced")}</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{tr("Id")}</Label>
                {/* Locked after creation: every business points at it. */}
                <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="car_rental" disabled={!isNew} />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Family")}</Label>
                {/* The Discovery tab this service files under. */}
                <Input value={form.family ?? "experiences"} onChange={(e) => setForm({ ...form, family: e.target.value.trim().toLowerCase() || "experiences" })} placeholder={tr("experiences · transport")} />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Default resource type")}</Label>
                <Input value={form.default_resource_type ?? ""} onChange={(e) => setForm({ ...form, default_resource_type: e.target.value || null })} placeholder={tr("e.g. vehicle, tennis, desk")} />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Default booking model")}</Label>
                <Select value={form.default_booking_model ?? ""} onValueChange={(v) => setForm({ ...form, default_booking_model: (v || null) as Archetype["default_booking_model"] })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {BOOKING_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{tr("Default capabilities")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CAPABILITIES) as CapabilityKey[]).map((cap) => {
                    const on = form.default_capabilities?.includes(cap);
                    const meta = CAPABILITIES[cap];
                    const I = meta.icon;
                    return (
                      <button key={cap} type="button" onClick={() => toggleCap(cap)} aria-pressed={on}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition",
                          on ? "bg-primary/15 text-primary" : "bg-card text-muted-foreground hover:text-foreground",
                        )}>
                        <I className="h-3 w-3" /> {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>
        </div>
      </DialogBlock>
    </ResponsiveDialog>
    </>
  );
}

/** "Car wash" → "car_wash". */
export const slugKey = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);

/** The shared icon picker — services and categories use the same set. */
export function IconGrid({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_ICON_KEYS.map((k) => {
        const I = CATEGORY_ICONS[k];
        const on = value === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)} aria-label={k} aria-pressed={on}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-radius-md transition-colors",
              on ? "bg-primary/15 text-primary ring-1 ring-primary" : "bg-card text-muted-foreground hover:text-foreground",
            )}>
            <I className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
