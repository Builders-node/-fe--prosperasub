import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CATEGORY_ACCENTS, CATEGORY_ICONS, CATEGORY_ICON_KEYS, resolveCategoryIcon,
} from "@/lib/services/categoryIcons";

const TABLE = "service_categories";
const QUERY_KEY = ["admin-service-categories"] as const;
const AUDIT_ENTITY = "service_category";

interface Category {
  key: string;
  label: string;
  icon: string;
  accent: string;
  sort_order: number;
  is_active: boolean;
}

const EMPTY: Category = {
  key: "", label: "", icon: "store", accent: "bg-blue-500", sort_order: 0, is_active: true,
};

const Categories = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [form, setForm] = useState<Category>({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [search, setSearch] = useState("");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from(TABLE).select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const q = search.trim().toLowerCase();
  const visible = q ? categories.filter((c) => [c.key, c.label].some((v) => v.toLowerCase().includes(q))) : categories;

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, sort_order: categories.length * 10 }); };
  const openEdit = (c: Category) => { setEditing(c); setForm({ ...c }); };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        key: form.key.trim().toLowerCase(),
        label: form.label.trim(),
        icon: form.icon,
        accent: form.accent,
        sort_order: form.sort_order,
        is_active: form.is_active,
      };
      if (!payload.key) throw new Error("Key is required");
      if (!payload.label) throw new Error("Label is required");
      if (!/^[a-z][a-z0-9_-]{1,30}$/.test(payload.key)) throw new Error("Key must be lowercase letters/digits/underscore/dash");

      if (editing === "new") {
        const { error } = await supabaseDb.from(TABLE).insert(payload);
        if (error) throw error;
        await logAuditEvent(userData!.id, "create", AUDIT_ENTITY, payload.key, payload);
      } else if (editing && editing !== "new") {
        // key is the PK — don't let users edit it (silently keep the existing key).
        const { error } = await supabaseDb.from(TABLE).update({
          label: payload.label, icon: payload.icon, accent: payload.accent,
          sort_order: payload.sort_order, is_active: payload.is_active,
        }).eq("key", editing.key);
        if (error) throw error;
        await logAuditEvent(userData!.id, "edit", AUDIT_ENTITY, editing.key, payload);
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: QUERY_KEY }); setEditing(null); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const toggle = async (c: Category) => {
    const { error } = await supabaseDb.from(TABLE).update({ is_active: !c.is_active }).eq("key", c.key);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const del = useMutation({
    mutationFn: async (c: Category) => {
      // FK guard: block deletion when providers still reference this category.
      const { count, error: cErr } = await supabaseDb
        .from("providers").select("id", { count: "exact", head: true }).eq("category_key", c.key);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) throw new Error(`Cannot delete: ${count} providers still use this category.`);
      const { error } = await supabaseDb.from(TABLE).delete().eq("key", c.key);
      if (error) throw error;
      await logAuditEvent(userData!.id, "delete", AUDIT_ENTITY, c.key, { label: c.label });
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: QUERY_KEY }); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e?.message || "Could not delete"),
  });

  return (
    <SuperAdminLayout title="Service Categories">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Categories</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              High-level domains providers slot into (Home Services, Food, Activities, …).
              Adding a category costs one row — no code changes needed as long as you pick an icon from the preset list.
            </p>
          </div>
          <Button onClick={openNew} className="gap-2 rounded-full"><Plus className="h-4 w-4" /> New category</Button>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search categories…"
          isLoading={isLoading} isEmpty={categories.length === 0}
          isNoResults={categories.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No categories yet" emptySubtitle="Add your first category."
          onClearFilters={() => setSearch("")}
        >
          <div className="space-y-3">
            {visible.map((c) => {
              const Icon = resolveCategoryIcon(c.icon);
              return (
                <div key={c.key} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", c.accent)}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground">{c.label}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.key}</code>
                      <Badge className={`rounded-full text-xs ${c.is_active ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                        {c.is_active ? "active" : "inactive"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Sort {c.sort_order}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggle(c)} title={c.is_active ? "Hide" : "Activate"}>
                      {c.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminListShell>

        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing === "new" ? "New category" : `Edit “${(editing as Category)?.label}”`}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Key *</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  placeholder="activities"
                  disabled={editing !== "new"}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Lowercase, letters/digits/dash/underscore. Immutable after creation — this is the PK referenced everywhere.
                </p>
              </div>
              <div>
                <Label>Label *</Label>
                <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Activities" />
              </div>
              <div>
                <Label>Icon</Label>
                <div className="mt-1.5 grid grid-cols-6 gap-2">
                  {CATEGORY_ICON_KEYS.map((k) => {
                    const I = CATEGORY_ICONS[k];
                    const selected = form.icon === k;
                    return (
                      <button
                        key={k} type="button" onClick={() => setForm((f) => ({ ...f, icon: k }))}
                        className={cn(
                          "flex h-10 w-full items-center justify-center rounded-lg border transition",
                          selected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
                        )}
                        title={k}
                      >
                        <I className="h-5 w-5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Accent</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {CATEGORY_ACCENTS.map((a) => (
                    <button
                      key={a.value} type="button" onClick={() => setForm((f) => ({ ...f, accent: a.value }))}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
                        form.accent === a.value ? "border-primary" : "border-border hover:border-primary/40",
                      )}
                    >
                      <span className={cn("h-4 w-4 rounded-full", a.value)} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sort order</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.is_active ? "active" : "inactive"}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "active" }))}
                  >
                    <option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={!form.label.trim() || !form.key.trim() || save.isPending}>
                {save.isPending && <Spinner size="sm" className="mr-2" />}{editing === "new" ? "Create" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete category?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteTarget?.label}</strong> ({deleteTarget?.key}) will be permanently removed.
                Any providers referencing this category must be reassigned first — the delete is blocked otherwise.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && del.mutate(deleteTarget)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SuperAdminLayout>
  );
};

export default Categories;
