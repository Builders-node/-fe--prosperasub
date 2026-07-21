import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Archive, Save } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { adminApi } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Role = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  isSystem: boolean;
  isAdminRole: boolean;
  permissions: string[];
};

type Permission = {
  key: string;
  category: string;
  name: string;
  description: string | null;
  isAdminPermission: boolean;
};

const EMPTY_ROLE: Partial<Role> = {
  name: "",
  description: "",
  status: "active",
  isAdminRole: false,
  permissions: [],
};

export default function RoleManagement() {
  const queryClient = useQueryClient();
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Role | null>(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["admin-rbac-roles"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/roles");
      if (error) throw error;
      return data as Role[];
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ["admin-rbac-permissions"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/permissions");
      if (error) throw error;
      return data as Permission[];
    },
  });

  const saveRole = useMutation({
    mutationFn: async (role: Partial<Role>) => {
      const payload = {
        name: role.name,
        description: role.description || null,
        status: role.status || "active",
        isAdminRole: Boolean(role.isAdminRole),
        permissions: role.permissions || [],
      };
      const result = role.id
        ? await adminApi(`/admin/roles/${role.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await adminApi("/admin/roles", { method: "POST", body: JSON.stringify(payload) });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      toast.success("Role saved");
      queryClient.invalidateQueries({ queryKey: ["admin-rbac-roles"] });
      setEditingRole(null);
      setCreating(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await adminApi(`/admin/roles/${roleId}`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role archived");
      queryClient.invalidateQueries({ queryKey: ["admin-rbac-roles"] });
      setArchiveTarget(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeRoles = roles.filter((role) => role.status === "active");
  const inactiveRoles = roles.filter((role) => role.status !== "active");

  return (
    <SuperAdminLayout title="Roles" subtitle="Define who can access which admin surfaces">
      <div className="mb-space-4 flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New Role</Button>
      </div>

      <div className="grid gap-space-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-space-2">
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading roles...</div>
            ) : roles.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No roles found</div>
            ) : (
              [...activeRoles, ...inactiveRoles].map((role) => (
                <div key={role.id} className="flex flex-wrap items-center justify-between gap-space-3 rounded-radius-md border border-border bg-card px-space-4 py-space-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-space-2">
                      <p className="font-bold">{role.name}</p>
                      <Badge variant={role.status === "active" ? "default" : "secondary"}>{role.status}</Badge>
                      {role.isAdminRole && <Badge variant="outline">admin-level</Badge>}
                      {role.isSystem && <Badge variant="secondary">system</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{role.description || "No description"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{role.permissions.length} permissions</p>
                  </div>
                  <div className="flex gap-space-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditingRole(role)}>Edit</Button>
                    {!role.isSystem && (
                      <Button variant="tertiary" size="sm" onClick={() => setArchiveTarget(role)}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-space-3">
            {Object.entries(groupPermissions(permissions)).map(([category, rows]) => (
              <div key={category}>
                <p className="mb-space-1 text-sm font-bold text-muted-foreground">{category}</p>
                <div className="space-y-space-1">
                  {rows.map((permission) => (
                    <div key={permission.key} className="rounded-radius-md bg-muted px-space-3 py-space-2">
                      <p className="text-sm font-semibold">{permission.name}</p>
                      <p className="text-xs text-muted-foreground">{permission.key}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <RoleSheet
        open={creating || !!editingRole}
        role={editingRole ?? EMPTY_ROLE}
        permissions={permissions}
        saving={saveRole.isPending}
        onClose={() => { setCreating(false); setEditingRole(null); }}
        onSave={(role) => saveRole.mutate(role)}
      />

      <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive role?</DialogTitle>
            <DialogDescription>
              Users assigned to {archiveTarget?.name || "this role"} will lose that role when it becomes inactive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={archiveRole.isPending}
              onClick={() => archiveTarget && archiveRole.mutate(archiveTarget.id)}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}

function RoleSheet({
  open, role, permissions, saving, onClose, onSave,
}: {
  open: boolean;
  role: Partial<Role>;
  permissions: Permission[];
  saving: boolean;
  onClose: () => void;
  onSave: (role: Partial<Role>) => void;
}) {
  const [form, setForm] = useState<Partial<Role>>(role);

  useEffect(() => {
    if (open) setForm({ ...role, permissions: role.permissions || [] });
  }, [open, role]);

  const grouped = useMemo(() => groupPermissions(permissions), [permissions]);
  const togglePermission = (key: string) => {
    const current = new Set(form.permissions || []);
    if (current.has(key)) current.delete(key);
    else current.add(key);
    setForm((value) => ({ ...value, permissions: [...current] }));
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{form.id ? "Edit Role" : "New Role"}</SheetTitle>
          <SheetDescription>Roles and permissions are stored in the database and enforced by the backend.</SheetDescription>
        </SheetHeader>

        <div className="mt-space-5 space-y-space-4">
          <div>
            <Label>Role name</Label>
            <Input value={form.name || ""} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description || ""} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-space-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status || "active"} onValueChange={(status) => setForm((value) => ({ ...value, status: status as Role["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Access level</Label>
              <Select value={form.isAdminRole ? "admin" : "standard"} onValueChange={(value) => setForm((current) => ({ ...current, isAdminRole: value === "admin" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="admin">Admin-level</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-space-3">
            {Object.entries(grouped).map(([category, rows]) => (
              <div key={category}>
                <p className="mb-space-2 text-sm font-bold">{category}</p>
                <div className="grid gap-space-2 sm:grid-cols-2">
                  {rows.map((permission) => {
                    const selected = form.permissions?.includes(permission.key);
                    return (
                      <button
                        key={permission.key}
                        type="button"
                        onClick={() => togglePermission(permission.key)}
                        className={`rounded-radius-md border px-space-3 py-space-2 text-left text-sm transition ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}
                      >
                        <span className="block font-semibold">{permission.name}</span>
                        <span className="block text-xs text-muted-foreground">{permission.key}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Empty-permissions guard — an assigned user with a zero-perm role
              silently downgrades to nothing, which is almost always a mistake. */}
          <Button
            className="w-full"
            size="xl"
            onClick={() => onSave(form)}
            disabled={!form.name?.trim() || (form.permissions?.length ?? 0) === 0}
            loading={saving}
          >
            <Save className="h-4 w-4" />Save Role
          </Button>
          {(form.permissions?.length ?? 0) === 0 && (
            <p className="text-xs text-amber-500">Select at least one permission — otherwise anyone assigned this role will have no access.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function groupPermissions(permissions: Permission[]) {
  return permissions.reduce<Record<string, Permission[]>>((acc, permission) => {
    acc[permission.category] = acc[permission.category] || [];
    acc[permission.category].push(permission);
    return acc;
  }, {});
}
