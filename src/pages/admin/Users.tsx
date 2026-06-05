import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, Search, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { adminApi } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Filter = "all" | "user" | "super_admin" | "blocked";
const formatRole = (role: string) => role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const userRoles = (user: any) => Array.isArray(user?.roles) ? user.roles : [];
const userSubscriptions = (user: any) => Array.isArray(user?.subscriptions) ? user.subscriptions : [];
const userLinkedClients = (user: any) => Array.isArray(user?.linkedClients) ? user.linkedClients : [];

const AdminUsers = () => {
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<any>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: users = [], isLoading, isError, error } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/users");
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
    staleTime: 15_000,
  });

  // Load recent audit activity for selected user
  const { data: userAuditLogs = [] } = useQuery({
    queryKey: ["admin-user-audit", editUser?.id],
    enabled: !!editUser?.id,
    queryFn: async () => {
      const { data, error } = await adminApi(`/admin/users/${editUser.id}/audit`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });

  // ── Mutations ────────────────────────────────────────────────────────────

  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; display_name?: string; email?: string }) => {
      const { id, ...fields } = data;
      const { error } = await adminApi(`/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("User updated"); invalidate(); setEditUser(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const blockMutation = useMutation({
    mutationFn: async ({ userId, block }: { userId: string; block: boolean }) => {
      const { error } = await adminApi(`/admin/users/${userId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ block }),
      });
      if (error) throw error;
    },
    onSuccess: (_, { block }) => { toast.success(block ? "User blocked" : "User unblocked"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await adminApi(`/admin/users/${userId}`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("User soft-deleted"); invalidate(); setEditUser(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Filter / Search ──────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let result = users;
    if (filter === "super_admin") result = result.filter((u: any) => userRoles(u).includes("super_admin"));
    else if (filter === "user") result = result.filter((u: any) => !userRoles(u).includes("super_admin"));
    else if (filter === "blocked") result = result.filter((u: any) => u.isBlocked);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((u: any) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.display_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [users, filter, search]);

  const FILTERS: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Users", value: "user" },
    { label: "Admins", value: "super_admin" },
    { label: "Blocked", value: "blocked" },
  ];

  return (
    <SuperAdminLayout title="Users">
      {/* Toolbar */}
      <div className="mb-space-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-space-2">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => setFilter(f.value)}
              className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}>{f.label}</button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="pl-9" />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {(error as Error)?.message || "Could not load users. Please log out and sign in again."}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {filteredUsers.map((user: any) => {
                  const name = user.display_name || user.name || user.email || "User";
                  const activeSubs = userSubscriptions(user).filter((s: any) => s.is_active);
                  const linkedClients = userLinkedClients(user);
                  const roles = userRoles(user);
                  return (
                    <div key={user.id} className={cn("space-y-space-3 px-space-4 py-space-4", user.isBlocked && "opacity-60")}>
                      <div className="flex items-start gap-space-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email || "—"}</p>
                        </div>
                        {user.isBlocked ? (
                          <Badge variant="destructive" className="text-xs">Blocked</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">Active</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-space-2">
                        {(roles.length ? roles : ["user"]).map((role: string) => (
                          <Badge key={role} variant={role === "super_admin" ? "default" : "outline"} className="text-xs">
                            {formatRole(role)}
                          </Badge>
                        ))}
                        {((user as any).rbacRoles ?? []).map((slug: string) => (
                          <Badge key={`rbac-${slug}`} variant="default" className="text-xs capitalize">
                            {slug}
                          </Badge>
                        ))}
                        <Badge variant="secondary" className="text-xs">{user.auth_provider || "email"}</Badge>
                        {activeSubs.length > 0 ? <Badge variant="secondary" className="text-xs">{activeSubs.length} active subscriptions</Badge> : null}
                        {linkedClients.length > 0 ? <Badge variant="secondary" className="text-xs">{linkedClients.length} client profiles</Badge> : null}
                      </div>
                      <div className="flex flex-wrap gap-space-2">
                        <Button variant="secondary" size="sm" onClick={() => setEditUser(user)}>Edit</Button>
                        {user.isBlocked ? (
                          <Button variant="tertiary" size="sm" onClick={() => blockMutation.mutate({ userId: user.id, block: false })}>
                            <UserCheck className="h-3.5 w-3.5" />
                            Unblock
                          </Button>
                        ) : (
                          <Button variant="tertiary" size="sm" onClick={() => blockMutation.mutate({ userId: user.id, block: true })}>
                            <Ban className="h-3.5 w-3.5" />
                            Block
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Subscriptions</TableHead>
                      <TableHead>Client Profile</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user: any) => {
                      const name = user.display_name || user.name || user.email || "User";
                      const activeSubs = userSubscriptions(user).filter((s: any) => s.is_active);
                      const linkedClients = userLinkedClients(user);
                      const roles = userRoles(user);
                      return (
                        <TableRow key={user.id} className={user.isBlocked ? "opacity-50" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                                {name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{name}</p>
                                <p className="truncate text-xs text-muted-foreground">{user.email || "—"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{user.auth_provider || "email"}</Badge></TableCell>
                          <TableCell>
                            {activeSubs.length > 0 ? (
                              <div className="space-y-1">
                                {activeSubs.map((s: any) => (
                                  <Badge key={s.id} variant="default" className="text-xs mr-1">{s.package_name}</Badge>
                                ))}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">None</span>}
                          </TableCell>
                          <TableCell>
                            {linkedClients.length > 0 ? (
                              <div className="space-y-1">
                                {linkedClients.map((c: any) => (
                                  <Badge key={c.id} variant="outline" className="text-xs mr-1">{c.company_name}</Badge>
                                ))}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {roles.map((r: string) => (
                                <Badge key={r} variant={r === "super_admin" ? "default" : "outline"} className="text-xs">{formatRole(r)}</Badge>
                              ))}
                              {((user as any).rbacRoles ?? []).map((slug: string) => (
                                <Badge key={`rbac-${slug}`} variant="default" className="text-xs capitalize">{slug}</Badge>
                              ))}
                              {roles.length === 0 && !((user as any).rbacRoles?.length) ? <Badge variant="outline" className="text-xs">User</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            {user.isBlocked ? (
                              <Badge variant="destructive" className="text-xs">Blocked</Badge>
                            ) : (
                              <Badge variant="default" className="text-xs">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="tertiary" size="sm" onClick={() => setEditUser(user)}>Edit</Button>
                              {user.isBlocked ? (
                                <Button variant="tertiary" size="sm" onClick={() => blockMutation.mutate({ userId: user.id, block: false })}>
                                  <UserCheck className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <Button variant="tertiary" size="sm" onClick={() => blockMutation.mutate({ userId: user.id, block: true })}>
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit User Sheet */}
      <Sheet open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
            <SheetDescription>{editUser?.email}</SheetDescription>
          </SheetHeader>
          {editUser && (
            <EditUserForm
              user={editUser}
              auditLogs={userAuditLogs}
              onSave={(d) => updateUserMutation.mutate({ id: editUser.id, ...d })}
              onSoftDelete={() => softDeleteMutation.mutate(editUser.id)}
              saving={updateUserMutation.isPending}
              deleting={softDeleteMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </SuperAdminLayout>
  );
};

function EditUserForm({ user, auditLogs, onSave, onSoftDelete, saving, deleting }: {
  user: any;
  auditLogs: any[];
  onSave: (d: any) => void;
  onSoftDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name || "");
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const { data: roles = [] } = useQuery({
    queryKey: ["admin-rbac-roles"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/roles");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: activeRoles = [] } = useQuery({
    queryKey: ["admin-user-rbac-roles", user.id],
    queryFn: async () => {
      const { data, error } = await adminApi(`/admin/users/${user.id}/roles`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: roleHistory = [] } = useQuery({
    queryKey: ["admin-user-role-history", user.id],
    queryFn: async () => {
      const { data, error } = await adminApi(`/admin/users/${user.id}/role-history`);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    setSelectedRoleIds((activeRoles as any[]).map((role: any) => role.id));
  }, [activeRoles]);

  const saveRoles = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi(`/admin/users/${user.id}/roles`, {
        method: "PATCH",
        body: JSON.stringify({ roleIds: selectedRoleIds }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User roles updated");
      queryClient.invalidateQueries({ queryKey: ["admin-user-rbac-roles", user.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-role-history", user.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );
  };

  return (
    <div className="mt-6 space-y-5">
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Display Name</Label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div>
        <Label>Email</Label>
        <Input value={user.email || ""} disabled className="opacity-60" />
        <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed from admin panel</p>
      </div>
      <div>
        <Label>Auth Provider</Label>
        <Input value={user.auth_provider || "email"} disabled className="opacity-60" />
      </div>
      <div>
        <Label>Last Login</Label>
        <Input
          value={user.last_login_at ? format(new Date(user.last_login_at), "MMM d, yyyy · h:mm a") : "Never"}
          disabled
          className="opacity-60"
        />
      </div>

      <div>
        <Label>Database Roles</Label>
        <div className="mt-2 grid gap-2">
          {(roles as any[]).map((role: any) => {
            const selected = selectedRoleIds.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role.id)}
                className={`rounded-lg border px-3 py-2 text-left transition ${selected ? "border-primary bg-primary/10" : "border-border bg-muted/40 hover:bg-muted"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{role.name}</span>
                  <Badge variant={role.isAdminRole ? "default" : "secondary"} className="text-xs">
                    {role.isAdminRole ? "admin" : "standard"}
                  </Badge>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{role.description || role.slug}</span>
              </button>
            );
          })}
        </div>
        <Button className="mt-3 w-full" variant="secondary" onClick={() => saveRoles.mutate()} loading={saveRoles.isPending}>
          Save Roles
        </Button>
      </div>

      <div>
        <Label>Role History</Label>
        {(roleHistory as any[]).length > 0 ? (
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
            {(roleHistory as any[]).map((entry: any) => (
              <div key={entry.id} className="rounded bg-muted px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{entry.action}</span>
                  <span className="text-muted-foreground">
                    {entry.createdAt ? format(new Date(entry.createdAt), "MMM d, h:mm a") : ""}
                  </span>
                </div>
                <p className="text-muted-foreground">{entry.roleName || "Role"} · by {entry.actorEmail || entry.actorUserId || "system"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No role changes recorded</p>
        )}
      </div>

      {/* Linked Client Profiles */}
      <div>
        <Label>Linked Client Profiles</Label>
        {userLinkedClients(user).length > 0 ? (
          <div className="mt-2 space-y-2">
            {userLinkedClients(user).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-muted p-3">
                <div>
                  <p className="text-sm font-semibold">{c.company_name}</p>
                  <p className="text-xs text-muted-foreground">{c.email} · {c.status}</p>
                </div>
                <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-xs">
                  {c.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No linked client profile</p>
        )}
      </div>

      {/* Subscriptions */}
      <div>
        <Label>Subscriptions</Label>
        {userSubscriptions(user).length > 0 ? (
          <div className="mt-2 space-y-2">
            {userSubscriptions(user).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-muted p-3">
                <div>
                  <p className="text-sm font-semibold">{s.package_name}</p>
                  <p className="text-xs text-muted-foreground">{s.subscription_status} · {s.payment_status}</p>
                </div>
                <Badge variant={s.is_active ? "default" : "secondary"} className="text-xs">
                  {s.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No subscriptions</p>
        )}
      </div>

      {/* Activity Log */}
      {auditLogs.length > 0 && (
        <div>
          <Label>Recent Admin Activity</Label>
          <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
            {auditLogs.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between rounded bg-muted px-3 py-2 text-xs">
                <span className="font-medium">{log.action}</span>
                <span className="text-muted-foreground">
                  {log.created_at ? format(new Date(log.created_at), "MMM d, h:mm a") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button className="w-full" size="xl" onClick={() => onSave({ name, display_name: displayName })} loading={saving}>
        Save Changes
      </Button>

      {/* Soft Delete */}
      <div className="border-t border-border pt-4">
        {!confirmDelete ? (
          <Button variant="destructive" className="w-full" size="xl" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Soft-Delete User
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-destructive font-semibold text-center">
              Are you sure? This will hide the user from all lists.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={onSoftDelete} loading={deleting}>
                Confirm Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUsers;
