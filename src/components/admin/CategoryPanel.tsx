import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Trash2 } from "lucide-react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { useConfirm } from "@/components/patterns/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ImageField } from "@/components/food/ImageField";
import { IconGrid, slugKey } from "@/components/admin/ServiceArchetypeDialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";

/**
 * The category panel, opened from a chip on the Services list.
 *
 * Replaces the Categories tab of the old per-service page, where a category
 * was a card whose edit lived behind a "…" menu. Name and cover photo up
 * front (that is what the site shows), on/off, delete, and a link to the
 * businesses filed under it. Order is the chip's place in its row (drag it).
 */

export interface CategoryRow {
  key: string;
  label: string;
  archetype_key: string | null;
  icon: string;
  accent: string;
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
}

const TABLE = "service_categories";

export function CategoryPanel({
  target, onClose, services, nextSortOrder = 0, businessCount = 0, siblings = [],
}: {
  /** A row to edit, a service key to add a new one to, or null when closed. */
  target: CategoryRow | { newIn: string } | null;
  onClose: () => void;
  services: Array<{ key: string; label: string }>;
  nextSortOrder?: number;
  businessCount?: number;
  /** The other categories of the same service — names already taken. */
  siblings?: string[];
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const isNew = !!target && "newIn" in target;
  const editing = target && !("newIn" in target) ? target : null;
  const [form, setForm] = useState<CategoryRow>(blank(""));

  useEffect(() => {
    if (!target) return;
    setForm("newIn" in target ? { ...blank(target.newIn), sort_order: nextSortOrder } : { ...target });
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["marketplace-hub-counts"] });
    // Public listings read categories to group businesses — refresh them too.
    void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("categor") });
  };

  const save = useMutation({
    mutationFn: async () => {
      const key = (form.key || slugKey(form.label)).trim();
      if (!form.label.trim()) throw new Error("Give the category a name");
      if (!key) throw new Error("The id can't be empty");
      if (!form.archetype_key) throw new Error("Pick the service it belongs to");
      const payload = {
        key, label: form.label.trim(), archetype_key: form.archetype_key, icon: form.icon, accent: form.accent,
        is_active: form.is_active, sort_order: form.sort_order, image_url: form.image_url,
      };
      const { error } = isNew
        ? await supabaseDb.from(TABLE).insert(payload)
        : await supabaseDb.from(TABLE).update(payload).eq("key", editing!.key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, isNew ? "create" : "edit", "service_category", key, payload);
    },
    onSuccess: () => { toast.success("Saved"); onClose(); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabaseDb.from(TABLE).delete().eq("key", editing!.key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", "service_category", editing!.key, {});
    },
    onSuccess: () => { toast.success("Category deleted"); onClose(); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const askDelete = async () => {
    const ok = await confirm({
      title: `Delete ${form.label || "this category"}?`,
      description: businessCount === 0
        ? "No businesses are in this category."
        : `${businessCount} ${businessCount === 1 ? "business is" : "businesses are"} in it. They stay in the service and show under "Other" on the site until you move them.`,
      confirmLabel: "Delete",
    });
    if (ok) remove.mutate();
  };

  const taken = siblings.filter((n) => n !== editing?.label);

  return (
    <>
      {confirmDialog}
      <ResponsiveDialog
        open={!!target}
        onOpenChange={(v) => !v && onClose()}
        title={isNew ? "New category" : form.label || "Category"}
        className="sm:max-w-[520px]"
        footer={
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button variant="ghost" className="gap-1.5 text-negative hover:text-negative" onClick={askDelete} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <Button variant="ghost" className="ml-auto" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-1" />} Save
            </Button>
          </div>
        }
      >
        <DialogBlock>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={form.label} placeholder="Car wash"
                onChange={(e) => {
                  const label = e.target.value;
                  // A new category's id follows its name: nobody should have to invent "car_wash".
                  const auto = isNew && (form.key === "" || form.key === slugKey(form.label));
                  setForm({ ...form, label, ...(auto ? { key: slugKey(label) } : {}) });
                }} />
              {taken.length > 0 && (
                <p className="text-meta text-muted-foreground">Already in this service: {taken.join(" · ")}</p>
              )}
            </div>

            <div>
              {/* Two categories in one service render side by side on the
                  home tile, so landscape crops read best. */}
              <ImageField label="Cover photo" value={form.image_url ?? ""} onChange={(url) => setForm({ ...form, image_url: url || null })}
                pathPrefix="categories" variant="card" />
              <p className="mt-1 text-meta text-muted-foreground">Shown on the service's tile on the home screen (the first two categories with a photo).</p>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-radius-md bg-inset px-3 py-2.5">
              <span>
                <span className="block text-body font-semibold text-foreground">On the site</span>
                <span className="block text-meta text-muted-foreground">{form.is_active ? "Customers see this category" : "Hidden from customers"}</span>
              </span>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </label>

            {editing && (
              <Link to={`/admin/marketplace/providers?service=${form.archetype_key ?? "unassigned"}&category=${encodeURIComponent(editing.key)}`}
                className="flex items-center justify-between rounded-radius-md bg-inset px-3 py-2.5 text-body font-semibold text-foreground hover:bg-muted">
                {businessCount === 1 ? "1 business" : `${businessCount} businesses`} in this category
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}

            <details className="rounded-radius-md bg-inset px-3 py-2.5">
              <summary className="cursor-pointer select-none text-body font-semibold text-foreground">Advanced</summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label>Service</Label>
                  <Select value={form.archetype_key ?? ""} onValueChange={(v) => setForm({ ...form, archetype_key: v })}>
                    <SelectTrigger><SelectValue placeholder="Which service is it in?" /></SelectTrigger>
                    <SelectContent>
                      {services.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Id</Label>
                  <Input value={form.key} disabled={!isNew}
                    onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 48) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Icon</Label>
                  <IconGrid value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
                </div>
              </div>
            </details>
          </div>
        </DialogBlock>
      </ResponsiveDialog>
    </>
  );
}

function blank(archetypeKey: string): CategoryRow {
  return { key: "", label: "", archetype_key: archetypeKey || null, icon: "store", accent: "bg-blue-500", is_active: true, sort_order: 0, image_url: null };
}
