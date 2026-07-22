import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, Search, Trash2, UserCheck, Sparkles, UtensilsCrossed, Waves, Car } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useResidences } from "@/hooks/useResidences";
import { addressFromProfile, addressPayload, EMPTY_ADDRESS } from "@/lib/address";

type Filter = "all" | "user" | "admin" | "blocked";
const formatRole = (role: string) => role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const userRoles = (user: any) => Array.isArray(user?.roles) ? user.roles : [];
const userSubscriptions = (user: any) => Array.isArray(user?.subscriptions) ? user.subscriptions : [];
const userLinkedClients = (user: any) => Array.isArray(user?.linkedClients) ? user.linkedClients : [];

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

const SERVICE_META: Record<string, { label: string; icon: React.ComponentType<any>; tint: string }> = {
  cleaning: { label: "Cleaning", icon: Sparkles,         tint: "bg-blue-500/15 text-blue-400" },
  food:     { label: "Food",     icon: UtensilsCrossed,  tint: "bg-orange-500/15 text-orange-400" },
  beach:    { label: "Beach",    icon: Waves,            tint: "bg-cyan-500/15 text-cyan-400" },
  rental:   { label: "Rental",   icon: Car,              tint: "bg-amber-500/15 text-amber-400" },
};
const SERVICE_ORDER = ["cleaning", "food", "beach", "rental"] as const;
type ServiceKey = (typeof SERVICE_ORDER)[number];

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

interface Person {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  isBlocked: boolean;
  services: Set<ServiceKey>;
  raw: any;
}

const AdminUsers = () => {
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>("all");
  const [serviceFilter, setServiceFilter] = useState<"all" | ServiceKey>("all");
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<any>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: users = [], isLoading: usersLoading, isError, error } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/users");
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
    staleTime: 15_000,
  });

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

  // ── Cross-service subscription aggregation (id-space is mixed: some by user_id, some by email) ──
  const { data: foodSubs = [] } = useQuery({
    queryKey: ["admin-people-food-subs"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .select("id, user_id, status, customer_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });

  const { data: beachSubs = [] } = useQuery({
    queryKey: ["admin-people-beach-subs"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .select("id, user_id, status, customer_email");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });

  const { data: rentalBookings = [] } = useQuery({
    queryKey: ["admin-people-rental-bookings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("id, user_id, status")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });

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

  // ── Assemble the People list from auth users + cross-service subs ──────

  const people: Person[] = useMemo(() => {
    // Build service-usage maps keyed by user_id (auth users) and email fallback.
    const serviceByUserId = new Map<string, Set<ServiceKey>>();
    const serviceByEmail = new Map<string, Set<ServiceKey>>();
    const addByUser = (uid: string | null | undefined, key: ServiceKey) => {
      if (!uid) return;
      const cur = serviceByUserId.get(uid) ?? new Set<ServiceKey>();
      cur.add(key);
      serviceByUserId.set(uid, cur);
    };
    const addByEmail = (email: string | null | undefined, key: ServiceKey) => {
      const e = norm(email);
      if (!e) return;
      const cur = serviceByEmail.get(e) ?? new Set<ServiceKey>();
      cur.add(key);
      serviceByEmail.set(e, cur);
    };

    (users as any[]).forEach((u: any) => {
      const subs = userSubscriptions(u);
      if (subs.some((s: any) => s.is_active)) addByUser(u.id, "cleaning");
    });
    (foodSubs as any[]).forEach((s: any) => {
      if (norm(s.status) === "active") addByUser(s.user_id, "food");
    });
    (beachSubs as any[]).forEach((s: any) => {
      if (norm(s.status) === "active") { addByUser(s.user_id, "beach"); addByEmail(s.customer_email, "beach"); }
    });
    (rentalBookings as any[]).forEach((s: any) => {
      if (["booked", "active", "confirmed"].includes(norm(s.status))) addByUser(s.user_id, "rental");
    });

    return (users as any[]).map((u: any) => {
      const email = norm(u.email);
      const services = new Set<ServiceKey>([
        ...(serviceByUserId.get(u.id) ?? []),
        ...(email ? (serviceByEmail.get(email) ?? []) : []),
      ]);
      return {
        id: u.id,
        name: u.display_name || u.name || u.email || "User",
        email: u.email ?? null,
        phone: (u.phone as string) ?? null,
        createdAt: u.created_at ?? null,
        isBlocked: !!u.isBlocked,
        services,
        raw: u,
      };
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [users, foodSubs, beachSubs, rentalBookings]);

  const stats = useMemo(() => ({
    total: people.length,
    admins: people.filter((p) => isAdminUser(p.raw)).length,
    blocked: people.filter((p) => p.isBlocked).length,
  }), [people, adminSlugs]);

  const filteredPeople = useMemo(() => {
    let result = people;
    if (filter === "user")    result = result.filter((p) => !isAdminUser(p.raw));
    if (filter === "admin")   result = result.filter((p) => isAdminUser(p.raw));
    if (filter === "blocked") result = result.filter((p) => p.isBlocked);

    if (serviceFilter !== "all") result = result.filter((p) => p.services.has(serviceFilter));

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [people, filter, serviceFilter, search, adminSlugs]);

  const isLoading = usersLoading;
  const pager = usePagination(filteredPeople, 20);
  const paged = pager.paged;

  const FILTERS: { label: string; value: Filter; count?: number }[] = [
    { label: "All",     value: "all",     count: stats.total },
    { label: "Users",   value: "user",    count: stats.total - stats.admins },
    { label: "Admins",  value: "admin",   count: stats.admins },
    { label: "Blocked", value: "blocked", count: stats.blocked },
  ];

  return (
    <SuperAdminLayout title="People" subtitle="Everyone who has signed up to the platform.">
      {/* Toolbar */}
      <div className="mb-space-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-space-2">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => setFilter(f.value)}
              className={cn("group flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}>
              {f.label}
              {typeof f.count === "number" && (
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums",
                  filter === f.value ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
                )}>{f.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-space-2">
          <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as any)}>
            <SelectTrigger className="w-40 rounded-full"><SelectValue placeholder="All services" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {SERVICE_ORDER.map((k) => <SelectItem key={k} value={k}>{SERVICE_META[k].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" className="rounded-full pl-9" />
          </div>
        </div>
      </div>

      {/* Result counter */}
      <p className="mb-space-3 text-xs text-muted-foreground">
        {isLoading ? "Loading…" : `${filteredPeople.length} ${filteredPeople.length === 1 ? "person" : "people"}`}
      </p>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-card">
        {isLoading ? (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-space-4 py-space-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-56 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {(error as Error)?.message || "Could not load users. Please log out and sign in again."}
            </div>
          ) : filteredPeople.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No people match these filters</div>
          ) : (
            <>
              {/* Header row (desktop) */}
              <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.5fr)_112px_100px_88px] items-center gap-4 border-b border-border/40 px-space-5 py-space-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
                <div>Person</div>
                <div>Services</div>
                <div>Roles</div>
                <div>Joined</div>
                <div>Status</div>
                <div className="text-right">Actions</div>
              </div>

              <div className="divide-y divide-border/40">
                {paged.map((p) => {
                  const roles = userRoles(p.raw);
                  const rbac = ((p.raw as any).rbacRoles ?? []) as string[];
                  const isAdmin = isAdminUser(p.raw);
                  const svcArr = SERVICE_ORDER.filter((k) => p.services.has(k));

                  const person = (
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                        {initials(p.name, p.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.email || p.phone || "—"}</p>
                      </div>
                    </div>
                  );

                  const svcChips = svcArr.length ? (
                    <div className="flex flex-wrap gap-1">
                      {svcArr.map((k) => {
                        const meta = SERVICE_META[k]; const Icon = meta.icon;
                        return (
                          <span key={k} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.tint)}>
                            <Icon className="h-3 w-3" />{meta.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>;

                  const roleChips = (
                    <div className="flex flex-wrap gap-1">
                      {isAdmin && <Badge variant="default" className="text-[10px]">Admin</Badge>}
                      {rbac.map((slug: string) => (
                        <Badge key={slug} variant="outline" className="text-[10px] capitalize">{slug}</Badge>
                      ))}
                      {roles.filter((r: string) => r !== "super_admin").map((r: string) => (
                        <Badge key={r} variant="outline" className="text-[10px]">{formatRole(r)}</Badge>
                      ))}
                      {!isAdmin && rbac.length === 0 && roles.filter((r: string) => r !== "super_admin").length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );

                  const statusChip = p.isBlocked
                    ? <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                    : svcArr.length ? <Badge variant="default" className="text-[10px]">Active</Badge>
                    : <Badge variant="outline" className="text-[10px]">Idle</Badge>;

                  const actions = (
                    <div className="flex justify-end gap-1">
                      <Button variant="tertiary" size="sm" onClick={() => setEditUser(p.raw)}>Edit</Button>
                      {p.isBlocked ? (
                        <Button variant="tertiary" size="sm" onClick={() => blockMutation.mutate({ userId: p.id, block: false })}>
                          <UserCheck className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="tertiary" size="sm" onClick={() => blockMutation.mutate({ userId: p.id, block: true })}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );

                  return (
                    <div key={p.id} className={cn("group px-space-5 py-space-3 transition-colors hover:bg-muted/30", p.isBlocked && "opacity-60")}>
                      {/* Desktop grid */}
                      <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.5fr)_112px_100px_88px] items-center gap-4 md:grid">
                        {person}
                        {svcChips}
                        {roleChips}
                        <div className="text-xs text-muted-foreground">
                          {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : "—"}
                        </div>
                        <div>{statusChip}</div>
                        {actions}
                      </div>
                      {/* Mobile card */}
                      <div className="space-y-3 md:hidden">
                        <div className="flex items-start justify-between gap-3">
                          {person}
                          {statusChip}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {svcChips}
                        </div>
                        {(isAdmin || rbac.length > 0 || roles.length > 0) && (
                          <div>{roleChips}</div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : "—"}
                          </span>
                          {actions}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <TablePagination {...pager} onPage={pager.setPage} />
            </>
          )}
      </div>

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
      // Route through the admin backend — user_profiles RLS restricts writes
      // to the row's owner, so an admin editing another user's profile via
      // supabaseDb (anon key) silently no-ops. The service-role endpoint
      // bypasses RLS + records an audit event.
      const { error } = await adminApi(`/admin/users/${user.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify(addressPayload(nextAddr)),
      });
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
