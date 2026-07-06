import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, Search, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useResidences } from "@/hooks/useResidences";
import { addressFromProfile, addressPayload, EMPTY_ADDRESS } from "@/lib/address";

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

  // Which RBAC role slugs count as "admin" (so the Admins filter catches users
  // who are admins via RBAC roles, not just the legacy super_admin role).
  const { data: adminSlugs = ["admin", "manager", "super_admin"] } = useQuery({
    queryKey: ["admin-rbac-admin-slugs"],
    queryFn: async () => {
      const { data } = await adminApi("/admin/roles");
      const slugs = (data ?? []).filter((r: any) => r.isAdminRole).map((r: any) => r.slug);
      return slugs.length ? slugs : ["admin", "manager", "super_admin"];
    },
    staleTime: 60_000,
  });

  const isAdminUser = (u: any) =>
    userRoles(u).includes("super_admin") ||
    ((u.rbacRoles ?? []) as string[]).some((s) => (adminSlugs as string[]).includes(s));

  // Active food subscriptions per user (not included in the backend /admin/users payload)
  const { data: foodSubsByUser = {} } = useQuery({
    queryKey: ["admin-users-food-subs"],
    queryFn: async () => {
      const { data: subs } = await supabaseDb
        .from("food_subscriptions")
        .select("id, user_id, status, meal_plan_id, provider_id")
        .eq("status", "active");
      const rows = subs ?? [];
      if (rows.length === 0) return {} as Record<string, { id: string; label: string }[]>;

      const planIds = [...new Set(rows.map((r) => r.meal_plan_id).filter(Boolean))];
      const provIds = [...new Set(rows.map((r) => r.provider_id).filter(Boolean))];
      const [{ data: plans }, { data: provs }] = await Promise.all([
        planIds.length
          ? supabaseDb.from("food_meal_plans").select("id, name").in("id", planIds)
          : Promise.resolve({ data: [] as any[] }),
        provIds.length
          ? supabaseDb.from("food_providers").select("id, name").in("id", provIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const planMap = new Map((plans ?? []).map((p: any) => [p.id, p.name]));
      const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.name]));

      const map: Record<string, { id: string; label: string }[]> = {};
      rows.forEach((r) => {
        const label = planMap.get(r.meal_plan_id) || provMap.get(r.provider_id) || "Food plan";
        (map[r.user_id] ??= []).push({ id: r.id, label });
      });
      return map;
    },
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
    if (filter === "super_admin") result = result.filter((u: any) => isAdminUser(u));
    else if (filter === "user") result = result.filter((u: any) => !isAdminUser(u));
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
  }, [users, filter, search, adminSlugs]);

  const usersPager = usePagination(filteredUsers, 20);
  const pagedUsers = usersPager.paged;

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
                {pagedUsers.map((user: any) => {
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
                    {pagedUsers.map((user: any) => {
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
                            {(() => {
                              const foodSubs = foodSubsByUser[user.id] ?? [];
                              if (activeSubs.length === 0 && foodSubs.length === 0) {
                                return <span className="text-xs text-muted-foreground">None</span>;
                              }
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {activeSubs.map((s: any) => (
                                    <Badge key={s.id} variant="default" className="text-xs">{s.package_name}</Badge>
                                  ))}
                                  {foodSubs.map((f) => (
                                    <Badge key={f.id} className="text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
                                      🍽 {f.label}
                                    </Badge>
                                  ))}
                                </div>
                              );
                            })()}
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
              <TablePagination {...usersPager} onPage={usersPager.setPage} />
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

  // ── Location / residence ──────────────────────────────────────────────────
  const { data: residences = [] } = useResidences();
  const [residence, setResidence] = useState<string>(""); // "" means "no residence"
  const [address, setAddress] = useState(EMPTY_ADDRESS);

  const { data: profile } = useQuery({
    queryKey: ["admin-user-profile", user.id],
    enabled: !!user.id,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("user_profiles")
        .select("user_id, address_street, address_house, address_apartment, address_area, address_notes, default_delivery_address")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });

  useEffect(() => {
    const addr = addressFromProfile(profile ?? undefined);
    setAddress(addr);
    setResidence(addr.area || "");
  }, [profile]);

  const saveLocationMutation = useMutation({
    mutationFn: async () => {
      const nextAddr = { ...address, area: residence.trim() };
      const payload = { user_id: user.id, ...addressPayload(nextAddr), updated_at: new Date().toISOString() };
      const { error } = await supabaseDb
        .from("user_profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location updated");
      queryClient.invalidateQueries({ queryKey: ["admin-user-profile", user.id] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update location"),
  });

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

  // Full subscription history across ALL services (the backend payload only
  // includes cleaning subs — fetch food / beach club / car rentals too).
  const { data: allSubscriptions = [], isLoading: subsLoading } = useQuery({
    queryKey: ["admin-user-all-subscriptions", user.id],
    enabled: !!user.id,
    queryFn: async () => {
      const uid = user.id;
      const [cleaning, food, beach, rentals] = await Promise.all([
        supabaseDb
          .from("cleaning_subscriptions")
          .select("id, package_id, subscription_status, payment_status, is_active, total_price_cents, created_at, service_end_date")
          .eq("user_id", uid)
          .is("deleted_at", null),
        supabaseDb
          .from("food_subscriptions")
          .select("id, status, meal_plan_id, provider_id, started_at, commitment_weeks, weekly_price_cents, created_at")
          .eq("user_id", uid),
        supabaseDb
          .from("beach_club_subscriptions")
          .select("id, plan_name, status, payment_status, start_date, end_date, total_cents, created_at")
          .eq("user_id", uid),
        supabaseDb
          .from("rental_bookings")
          .select("id, vehicle_id, status, payment_status, start_date, end_date, total_cents, created_at")
          .eq("user_id", uid)
          .is("deleted_at", null),
      ]);

      // Resolve names that need a second lookup.
      const pkgIds = [...new Set((cleaning.data ?? []).map((r: any) => r.package_id).filter(Boolean))];
      const planIds = [...new Set((food.data ?? []).map((r: any) => r.meal_plan_id).filter(Boolean))];
      const provIds = [...new Set((food.data ?? []).map((r: any) => r.provider_id).filter(Boolean))];
      const vehIds = [...new Set((rentals.data ?? []).map((r: any) => r.vehicle_id).filter(Boolean))];
      const [pkgs, plans, provs, vehs] = await Promise.all([
        pkgIds.length ? supabaseDb.from("cleaning_packages").select("id, name").in("id", pkgIds) : Promise.resolve({ data: [] as any[] }),
        planIds.length ? supabaseDb.from("food_meal_plans").select("id, name").in("id", planIds) : Promise.resolve({ data: [] as any[] }),
        provIds.length ? supabaseDb.from("food_providers").select("id, name").in("id", provIds) : Promise.resolve({ data: [] as any[] }),
        vehIds.length ? supabaseDb.from("rental_vehicles").select("id, name").in("id", vehIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const pkgMap = new Map((pkgs.data ?? []).map((p: any) => [p.id, p.name]));
      const planMap = new Map((plans.data ?? []).map((p: any) => [p.id, p.name]));
      const provMap = new Map((provs.data ?? []).map((p: any) => [p.id, p.name]));
      const vehMap = new Map((vehs.data ?? []).map((p: any) => [p.id, p.name]));

      const norm: Array<{
        id: string; service: string; name: string; status: string;
        active: boolean; amountCents: number | null; created_at: string | null;
      }> = [];

      (cleaning.data ?? []).forEach((r: any) => norm.push({
        id: `cleaning-${r.id}`, service: "Cleaning",
        name: pkgMap.get(r.package_id) || "Cleaning plan",
        status: `${r.subscription_status ?? "—"} · ${r.payment_status ?? "—"}`,
        active: r.is_active === true && String(r.subscription_status).toLowerCase() === "active" && r.payment_status === "paid",
        amountCents: r.total_price_cents ?? null, created_at: r.created_at ?? null,
      }));
      (food.data ?? []).forEach((r: any) => norm.push({
        id: `food-${r.id}`, service: "Food",
        name: planMap.get(r.meal_plan_id) || provMap.get(r.provider_id) || "Food plan",
        status: r.status ?? "—",
        active: String(r.status).toLowerCase() === "active",
        amountCents: r.weekly_price_cents ?? null, created_at: r.created_at ?? null,
      }));
      (beach.data ?? []).forEach((r: any) => norm.push({
        id: `beach-${r.id}`, service: "Beach Club",
        name: r.plan_name || "Beach Club membership",
        status: `${r.status ?? "—"} · ${r.payment_status ?? "—"}`,
        active: String(r.status).toLowerCase() === "active" && r.payment_status === "paid",
        amountCents: r.total_cents ?? null, created_at: r.created_at ?? null,
      }));
      (rentals.data ?? []).forEach((r: any) => norm.push({
        id: `rental-${r.id}`, service: "Car Rental",
        name: vehMap.get(r.vehicle_id) || "Car rental",
        status: `${r.status ?? "—"} · ${r.payment_status ?? "—"}`,
        active: r.payment_status === "paid" && ["confirmed", "active", "in_progress"].includes(String(r.status).toLowerCase()),
        amountCents: r.total_cents ?? null, created_at: r.created_at ?? null,
      }));

      return norm.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    },
  });

  // Full period history (every period the member ever had, incl. past/renewed).
  const { data: periodHistory = [] } = useQuery({
    queryKey: ["admin-user-period-history", user.id],
    enabled: !!user.id,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("subscription_periods")
        .select("id, service, plan_name, started_at, end_date, amount_cents, payment_method, payment_status, source, recorded_at")
        .eq("user_id", user.id)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Stable primitive key so this effect doesn't loop on the array's changing
  // reference (React Query returns a fresh [] default each render while loading).
  const activeRoleIdsKey = (activeRoles as any[]).map((role: any) => role.id).sort().join(",");
  useEffect(() => {
    setSelectedRoleIds(activeRoleIdsKey ? activeRoleIdsKey.split(",") : []);
  }, [activeRoleIdsKey]);

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

  const activeSubsCount = (allSubscriptions as any[]).filter((s) => s.active).length;

  return (
    <Tabs defaultValue="overview" className="mt-5">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="plans">Plans &amp; History</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      {/* ── OVERVIEW ─────────────────────────────────────────────── */}
      <TabsContent value="overview" className="mt-4 space-y-5">
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Auth Provider</Label>
            <Input value={user.auth_provider || "email"} disabled className="opacity-60" />
          </div>
          <div>
            <Label>Active Subs</Label>
            <Input value={`${activeSubsCount} active`} disabled className="opacity-60" />
          </div>
        </div>
        <div>
          <Label>Last Login</Label>
          <Input
            value={user.last_login_at ? format(new Date(user.last_login_at), "MMM d, yyyy · h:mm a") : "Never"}
            disabled
            className="opacity-60"
          />
        </div>

        {/* Location / Residence */}
        <div className="space-y-3 rounded-2xl bg-muted/20 p-3">
          <Label>Location / Residence</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Residence</Label>
              <Select value={residence || "__none"} onValueChange={(v) => setResidence(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No residence" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No residence</SelectItem>
                  {residences.map((r) => (
                    <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                  ))}
                  {residence && !residences.find((r) => r.name === residence) && (
                    <SelectItem value={residence}>{residence} (custom)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Apartment / Unit</Label>
              <Input
                value={address.apartment}
                onChange={(e) => setAddress((a) => ({ ...a, apartment: e.target.value }))}
                placeholder="Apt 407"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Street</Label>
              <Input
                value={address.street}
                onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                placeholder="Main St"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">House</Label>
              <Input
                value={address.house}
                onChange={(e) => setAddress((a) => ({ ...a, house: e.target.value }))}
                placeholder="12"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Access notes (optional)</Label>
            <Input
              value={address.notes}
              onChange={(e) => setAddress((a) => ({ ...a, notes: e.target.value }))}
              placeholder="Doorman, gate code, floor…"
            />
          </div>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => saveLocationMutation.mutate()}
            disabled={saveLocationMutation.isPending}
          >
            {saveLocationMutation.isPending ? "Saving…" : "Save location"}
          </Button>
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

        <Button className="w-full" size="xl" onClick={() => onSave({ name, display_name: displayName })} loading={saving}>
          Save Changes
        </Button>
      </TabsContent>

      {/* ── PLANS & HISTORY ──────────────────────────────────────── */}
      <TabsContent value="plans" className="mt-4 space-y-5">
        <div>
          <Label>All Subscriptions</Label>
          {subsLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading subscriptions…</p>
          ) : (allSubscriptions as any[]).length > 0 ? (
            <div className="mt-2 space-y-2">
              {(allSubscriptions as any[]).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] shrink-0">{s.service}</Badge>
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                    </div>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {s.status}
                      {s.amountCents != null && <> · {formatUSD(s.amountCents)}</>}
                      {s.created_at && <> · {format(new Date(s.created_at), "MMM d, yyyy")}</>}
                    </p>
                  </div>
                  <Badge variant={s.active ? "default" : "secondary"} className="text-xs shrink-0">
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No subscriptions</p>
          )}
        </div>

        <div>
          <Label>Subscription Period History</Label>
          {(periodHistory as any[]).length > 0 ? (
            <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
              {(periodHistory as any[]).map((p) => (
                <div key={p.id} className="rounded-lg bg-muted px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{p.service}</Badge>
                      <span className="truncate font-semibold">{p.plan_name || "—"}</span>
                    </div>
                    <span className="shrink-0 text-muted-foreground">{formatDateHN(p.started_at)} — {formatDateHN(p.end_date)}</span>
                  </div>
                  <p className="mt-0.5 capitalize text-muted-foreground">
                    {p.source}
                    {p.amount_cents != null && <> · {formatUSD(p.amount_cents)}</>}
                    {p.payment_status && <> · {p.payment_status}</>}
                    {p.payment_method && <> · {p.payment_method}</>}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No period history yet</p>
          )}
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

        {/* Activity Log */}
        <div>
          <Label>Recent Admin Activity</Label>
          {auditLogs.length > 0 ? (
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
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No recent admin activity</p>
          )}
        </div>
      </TabsContent>

      {/* ── SETTINGS ─────────────────────────────────────────────── */}
      <TabsContent value="settings" className="mt-4 space-y-5">
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

        {/* Danger zone — Soft Delete */}
        <div className="border-t border-border pt-4">
          <Label className="text-destructive">Danger Zone</Label>
          <div className="mt-2">
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
      </TabsContent>
    </Tabs>
  );
}

export default AdminUsers;
