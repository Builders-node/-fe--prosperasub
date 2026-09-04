import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS, resolveCategoryIcon } from "@/lib/services/categoryIcons";
import { cn } from "@/lib/utils";
import { VEHICLE_TYPES_KEY, useVehicleTypes, type VehicleType } from "../hooks/useVehicleTypes";

/**
 * Vehicle types, edited on transport's own terms.
 *
 * This used to be the marketplace's category CRUD mounted here with a filter,
 * and the borrowed machinery showed: the dialog asked which SERVICE the type
 * belongs to (Food? Cleaning? Lifestyle?), the cover-photo hint talked about
 * home-screen service tiles, and the count said "1 provider" for a row that
 * describes six cars.
 *
 * A vehicle type needs four facts — what it is called, what it looks like,
 * where it sorts, and whether it is on. Nothing here knows the word archetype.
 */

interface Draft {
  key: string;
  label: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

const EMPTY: Draft = { key: "", label: "", icon: "car", sort_order: 0, is_active: true };

/** "Motorbikes" → "motorbikes" — the key a vehicle row stores. */
const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export function VehicleTypesPanel() {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<VehicleType | "new" | null>(null);
  const [form, setForm] = useState<Draft>({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<VehicleType | null>(null);
  const [search, setSearch] = useState("");

  const { data: types = [], isLoading, isError, error, refetch } = useVehicleTypes({ activeOnly: false });

  /** How many vehicles carry each type — what a hide or a delete affects. */
  const { data: counts = {} } = useQuery({
    queryKey: ["vehicle-type-counts"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error: err } = await supabaseDb
        .from("rental_vehicles").select("category_key").neq("status", "archived");
      if (err) throw err;
      const tally: Record<string, number> = {};
      (data ?? []).forEach((v: any) => {
        if (v.category_key) tally[v.category_key] = (tally[v.category_key] ?? 0) + 1;
      });
      return tally;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) => t.key.includes(q) || t.label.toLowerCase().includes(q));
  }, [types, search]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: VEHICLE_TYPES_KEY });
    qc.invalidateQueries({ queryKey: ["vehicle-type-counts"] });
    // The storefront's chips read the same rows.
    qc.invalidateQueries({ queryKey: ["rental-vehicles"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const label = form.label.trim();
      if (!label) throw new Error("The type needs a name.");
      const isNew = editing === "new";
      const key = isNew ? slug(label) : form.key;
      if (!key) throw new Error("The name must contain a letter or a number.");
      const row = { label, icon: form.icon, sort_order: form.sort_order, is_active: form.is_active };
      const res = isNew
        ? await supabaseDb.from("rental_categories").insert({ key, ...row })
        : await supabaseDb.from("rental_categories")
            .update({ ...row, updated_at: new Date().toISOString() }).eq("key", key);
      if (res.error) throw res.error;
      if (userData?.id) await logAuditEvent(userData.id, isNew ? "create" : "edit", "rental_category", key, row);
    },
    onSuccess: () => { toast.success("Saved"); setEditing(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (t: VehicleType) => {
      const { error: err } = await supabaseDb.from("rental_categories")
        .update({ is_active: !t.is_active, updated_at: new Date().toISOString() }).eq("key", t.key);
      if (err) throw err;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (t: VehicleType) => {
      const { error: err } = await supabaseDb.from("rental_categories").delete().eq("key", t.key);
      if (err) throw err;
      if (userData?.id) await logAuditEvent(userData.id, "delete", "rental_category", t.key, {});
    },
    onSuccess: () => { toast.success("Type deleted"); setDeleteTarget(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing("new");
    setForm({ ...EMPTY, sort_order: (types.length + 1) * 10 });
  };
  const openEdit = (t: VehicleType) => {
    setEditing(t);
    setForm({ key: t.key, label: t.label, icon: t.icon, sort_order: t.sort_order, is_active: t.is_active });
  };

  return (
    <>
      <AdminListShell
        search={search} onSearch={setSearch} searchPlaceholder="Search types…"
        isLoading={isLoading} isError={isError} error={error} onRetry={() => void refetch()}
        isEmpty={types.length === 0}
        isNoResults={types.length > 0 && filtered.length === 0}
        count={filtered.length}
        emptyTitle="No vehicle types yet"
        emptySubtitle="A type is what the product IS — Cars, Motorbikes, Boats. Every vehicle picks one, and the storefront filters by it."
        onClearFilters={() => setSearch("")}
        actions={
          <Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New type</Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const Icon = resolveCategoryIcon(t.icon);
            const n = counts[t.key] ?? 0;
            return (
              <div
                key={t.key}
                className={cn(
                  "flex items-start gap-3 rounded-radius-md bg-card p-4",
                  !t.is_active && "opacity-60",
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-muted">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{t.label}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t.is_active ? "Active" : "Hidden"}
                    {" · "}
                    <span className="tabular-nums">{n}</span> {n === 1 ? "vehicle" : "vehicles"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="iconSm" variant="ghost" aria-label={`${t.label} actions`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggleActive.mutate(t)}>
                      {t.is_active
                        ? <><EyeOff className="h-4 w-4" /> Hide from the storefront</>
                        : <><Eye className="h-4 w-4" /> Show on the storefront</>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setDeleteTarget(t)}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </AdminListShell>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New vehicle type" : "Edit vehicle type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                className="mt-1"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Motorbikes"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {editing === "new"
                  // The key is what every vehicle row stores, so it is fixed
                  // once created — renaming it would orphan the fleet.
                  ? <>Saved as <code className="text-foreground">{slug(form.label) || "…"}</code>, which vehicles store. The name can change later; that key cannot.</>
                  : <>Stored as <code className="text-foreground">{form.key}</code> — fixed, because every vehicle of this type points at it.</>}
              </p>
            </div>

            <div>
              <Label>Icon</Label>
              <div className="mt-1.5 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                {CATEGORY_ICON_KEYS.map((k) => {
                  const I = CATEGORY_ICONS[k];
                  const on = form.icon === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, icon: k }))}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border",
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                      aria-label={k}
                    >
                      <I className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Sort order</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Lower shows first in the fleet's filter.</p>
              </div>
              <div>
                <Label>On the storefront</Label>
                <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  {form.is_active ? "Customers can filter by it" : "Hidden"}
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-1" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const n = deleteTarget ? counts[deleteTarget.key] ?? 0 : 0;
                if (n === 0) return "No vehicles are of this type — safe to delete.";
                return `${n} ${n === 1 ? "vehicle is" : "vehicles are"} of this type. They stay listed but lose their type until you give them another one.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default VehicleTypesPanel;
