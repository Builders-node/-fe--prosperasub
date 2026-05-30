import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, Search, Shield, ShieldOff, UserCheck } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { supabaseDb } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { useAuth } from "@/contexts/AuthContext";
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
const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;

const AdminUsers = () => {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const adminId = userData?.id || "admin";

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<any>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      const { data: usersData, error } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name, auth_provider, created_at, last_login_at, banned_until, deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: rolesData } = await supabaseDb.from("user_roles").select("user_id, role");
      const rolesMap = new Map<string, string[]>();
      for (const r of rolesData || []) {
        const arr = rolesMap.get(r.user_id) || [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      }

      const { data: subs } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id, user_id, package_id, payment_status, subscription_status, is_active, monthly_price_cents")
        .is("deleted_at", null);
      const subsMap = new Map<string, any[]>();
      for (const s of subs || []) {
        const arr = subsMap.get(s.user_id) || [];
        arr.push(s);
        subsMap.set(s.user_id, arr);
      }

      const { data: pkgs } = await supabaseDb.from("cleaning_packages").select("id, name");
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p.name]));

      return (usersData || []).map((u: any) => ({
        ...u,
        roles: rolesMap.get(u.id) || ["user"],
        subscriptions: (subsMap.get(u.id) || []).map((s: any) => ({
          ...s,
          package_name: pkgMap.get(s.package_id) || "Unknown",
        })),
        isBlocked: !!u.banned_until && new Date(u.banned_until) > new Date(),
      }));
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });

  // ── Mutations ────────────────────────────────────────────────────────────

  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; display_name?: string; email?: string }) => {
      const { id, ...fields } = data;
      const { error } = await supabaseDb.from("users").update(fields).eq("id", id);
      if (error) throw error;
      await logAuditEvent(adminId, "edit", "user", id, fields);
    },
    onSuccess: () => { toast.success("User updated"); invalidate(); setEditUser(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role, add }: { userId: string; role: string; add: boolean }) => {
      if (add) {
        await supabaseDb.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
      } else {
        await supabaseDb.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      }
      await logAuditEvent(adminId, "change_role", "user", userId, { role, add });
    },
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const blockMutation = useMutation({
    mutationFn: async ({ userId, block }: { userId: string; block: boolean }) => {
      const banned_until = block ? "2099-12-31T23:59:59Z" : null;
      const { error } = await supabaseDb.from("users").update({ banned_until }).eq("id", userId);
      if (error) throw error;
      await logAuditEvent(adminId, block ? "block" : "unblock", "user", userId);
    },
    onSuccess: (_, { block }) => { toast.success(block ? "User blocked" : "User unblocked"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabaseDb.from("users").update({ deleted_at: new Date().toISOString() }).eq("id", userId);
      if (error) throw error;
      await logAuditEvent(adminId, "delete", "user", userId);
    },
    onSuccess: () => { toast.success("User soft-deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Filter / Search ──────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let result = users;
    if (filter === "super_admin") result = result.filter((u: any) => u.roles.includes("super_admin"));
    else if (filter === "user") result = result.filter((u: any) => !u.roles.includes("super_admin"));
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
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Subscriptions</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user: any) => {
                    const name = user.display_name || user.name || user.email || "User";
                    const activeSubs = user.subscriptions.filter((s: any) => s.is_active);
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
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((r: string) => (
                              <Badge key={r} variant={r === "super_admin" ? "default" : "outline"} className="text-xs">{formatRole(r)}</Badge>
                            ))}
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
                            {user.roles.includes("super_admin") ? (
                              <Button variant="tertiary" size="sm" onClick={() => changeRoleMutation.mutate({ userId: user.id, role: "super_admin", add: false })}>
                                <ShieldOff className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button variant="tertiary" size="sm" onClick={() => changeRoleMutation.mutate({ userId: user.id, role: "super_admin", add: true })}>
                                <Shield className="h-3.5 w-3.5" />
                              </Button>
                            )}
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
          {editUser && <EditUserForm user={editUser} onSave={(d) => updateUserMutation.mutate({ id: editUser.id, ...d })} saving={updateUserMutation.isPending} />}
        </SheetContent>
      </Sheet>
    </SuperAdminLayout>
  );
};

function EditUserForm({ user, onSave, saving }: { user: any; onSave: (d: any) => void; saving: boolean }) {
  const [name, setName] = useState(user.name || "");
  const [displayName, setDisplayName] = useState(user.display_name || "");

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
        <Label>Subscriptions</Label>
        {user.subscriptions?.length > 0 ? (
          <div className="mt-2 space-y-2">
            {user.subscriptions.map((s: any) => (
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
      <Button className="w-full" size="xl" onClick={() => onSave({ name, display_name: displayName })} loading={saving}>
        Save Changes
      </Button>
    </div>
  );
}

export default AdminUsers;
