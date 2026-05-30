import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Filter = "all" | "user" | "super_admin";

const formatRole = (role: string) =>
  role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const AdminUsers = () => {
  const [filter, setFilter] = useState<Filter>("all");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users-page"],
    queryFn: async () => {
      const { data: usersData, error } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name, auth_provider, created_at, last_login_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Roles
      const { data: rolesData } = await supabaseDb.from("user_roles").select("user_id, role");
      const rolesMap = new Map<string, string[]>();
      for (const r of rolesData || []) {
        const arr = rolesMap.get(r.user_id) || [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      }

      // Cleaning subscriptions
      const { data: subs } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("user_id, payment_status, is_active, cleaning_packages(name)");
      const subsMap = new Map<string, any>();
      for (const s of subs || []) {
        if (s.payment_status === "paid") subsMap.set(s.user_id, s);
      }

      return (usersData || []).map((u: any) => {
        const roles = rolesMap.get(u.id) || ["user"];
        const sub = subsMap.get(u.id);
        return {
          ...u,
          roles,
          subscriptionPlan: sub ? ((sub as any).cleaning_packages?.name || "Standard") : null,
          isActive: !!sub,
        };
      });
    },
  });

  const filteredUsers = useMemo(() => {
    if (filter === "all") return users;
    if (filter === "super_admin") return users.filter((u: any) => u.roles.includes("super_admin"));
    return users.filter((u: any) => !u.roles.includes("super_admin"));
  }, [users, filter]);

  const FILTERS: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Standard Users", value: "user" },
    { label: "Super Admin", value: "super_admin" },
  ];

  return (
    <SuperAdminLayout title="Users">
      {/* Filter pills */}
      <div className="mb-space-5 flex items-center justify-end gap-space-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-space-12 text-center text-sm text-muted-foreground">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-space-12 text-center text-sm text-muted-foreground">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UserName</TableHead>
                    <TableHead>Joined Date</TableHead>
                    <TableHead>Joined Type</TableHead>
                    <TableHead>Subscription Plan</TableHead>
                    <TableHead>Status Active</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user: any) => {
                    const displayName = user.display_name || user.name || user.email || "User";
                    const initials = displayName.slice(0, 1).toUpperCase();
                    const joinedDate = user.created_at
                      ? format(new Date(user.created_at), "MMM d, yyyy")
                      : "—";
                    const provider = String(user.auth_provider || "email").charAt(0).toUpperCase() +
                      String(user.auth_provider || "email").slice(1);

                    return (
                      <TableRow key={user.id}>
                        {/* UserName */}
                        <TableCell>
                          <div className="flex items-center gap-space-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                              <p className="truncate text-xs text-muted-foreground">{user.email || "—"}</p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Joined Date */}
                        <TableCell className="text-sm text-muted-foreground">{joinedDate}</TableCell>

                        {/* Joined Type */}
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{provider}</Badge>
                        </TableCell>

                        {/* Subscription Plan */}
                        <TableCell className="text-sm">
                          {user.subscriptionPlan ? (
                            <span className="text-foreground">{user.subscriptionPlan}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Status Active */}
                        <TableCell>
                          <Badge
                            variant={user.isActive ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {user.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>

                        {/* Role */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role: string) => (
                              <Badge
                                key={role}
                                variant={role === "super_admin" ? "default" : "outline"}
                                className="text-xs"
                              >
                                {formatRole(role)}
                              </Badge>
                            ))}
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
    </SuperAdminLayout>
  );
};

export default AdminUsers;
