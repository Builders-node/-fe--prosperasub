import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, Pencil, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { MobileActionSheet } from "@/components/admin/MobileActionSheet";
import { ContactActions } from "@/components/admin/customers/ContactActions";
import {
  useCustomerServices, type CustomerService,
  useCustomerActivity, useCustomerContacts, useCustomerSales,
} from "@/components/admin/customers/customerActivity";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { adminApiMessage, isNotDeployed } from "@/lib/admin/apiError";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatUSD } from "@/lib/pricing";
import { StatusPill, statusLabel } from "@/components/patterns/StatusPill";
import { pickPhone } from "@/components/patterns/CustomerPhone";
import { formatDateHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useTableSort } from "@/lib/table/useTableSort";
import { SortHeader } from "@/components/ui/sort-header";
import { useResidences } from "@/hooks/useResidences";
import { addressFromProfile, addressPayload, EMPTY_ADDRESS } from "@/lib/address";

type Filter = "all" | "user" | "admin" | "blocked";
const formatRole = (role: string) => role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const userRoles = (user: any) => Array.isArray(user?.roles) ? user.roles : [];
const userLinkedClients = (user: any) => Array.isArray(user?.linkedClients) ? user.linkedClients : [];

/** The URL parameter that opens one customer's sheet — Subscriptions and Support link here. */
const USER_PARAM = "userId";

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
  whatsapp: string | null;
  addressText: string;
  addressLine: string | null;
  createdAt: string | null;
  isBlocked: boolean;
  /** Services with a live, paid purchase — every source, cars and one-off plans included. */
  services: Set<CustomerService>;
  /** Bought something once, nothing live now. */
  lapsed: boolean;
  raw: any;
}

const AdminUsers = () => {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [filter, setFilter] = useState<Filter>("all");
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null);
  const [serviceFilter, setServiceFilter] = useState<"all" | CustomerService>("all");
  const { order: SERVICE_ORDER, metaOf: serviceMeta } = useCustomerServices();
  const [search, setSearch] = useState("");

  // ── One customer is a page now (/admin/customers/:id) ──────────────────
  // `?userId=` is what older links (Subscriptions, Support, bookmarks) carry;
  // it redirects there instead of opening a sheet.
  const navigate = useNavigate();
  const openUserId = params.get(USER_PARAM);
  const openUser = (id: string) => navigate(`/admin/customers/${encodeURIComponent(id)}`);
  useEffect(() => {
    if (openUserId) navigate(`/admin/customers/${encodeURIComponent(openUserId)}`, { replace: true });
  }, [openUserId, navigate]);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: users = [], isLoading: usersLoading, isError, error, refetch } = useQuery({
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

  // Every source through the read model (cleaning · food · beach · universal
  // plans · car rentals), plus phones and addresses for contact + search.
  const { data: activity } = useCustomerActivity();
  const { data: contacts } = useCustomerContacts();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });

  // ── Mutations ────────────────────────────────────────────────────────────

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

  // ── Assemble the People list ─────────────────────────────────────────────

  const people: Person[] = useMemo(() => {
    return (users as any[]).map((u: any) => {
      const id = String(u.id);
      const act = activity?.get(id);
      const contact = contacts?.get(id);
      const services = new Set<CustomerService>(act?.active ?? []);
      return {
        id,
        name: u.display_name || u.name || u.email || "User",
        email: u.email ?? null,
        phone: pickPhone(u.phone, contact?.phone),
        whatsapp: pickPhone(contact?.whatsapp, u.phone),
        addressText: contact?.addressText ?? "",
        addressLine: contact?.addressLine ?? null,
        createdAt: u.created_at ?? null,
        isBlocked: !!u.isBlocked,
        services,
        lapsed: services.size === 0 && (act?.ever.size ?? 0) > 0,
        raw: u,
      };
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [users, activity, contacts]);

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
      const q = search.trim().toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        (p.whatsapp ?? "").toLowerCase().includes(q) ||
        p.addressText.includes(q)
      );
    }
    return result;
  }, [people, filter, serviceFilter, search, adminSlugs]);

  const isLoading = usersLoading;
  // Click a header to sort; without a click the list stays newest first.
  const statusRank = (p: Person) => (p.isBlocked ? 0 : p.services.size > 0 ? 3 : p.lapsed ? 2 : 1);
  const sort = useTableSort(filteredPeople, {
    person: (p) => p.name,
    services: (p) => p.services.size || null,
    roles: (p) => userRoles(p.raw).join(", ") || null,
    joined: (p) => (p.createdAt ? new Date(p.createdAt) : null),
    status: (p) => statusRank(p),
  });
  const pager = usePagination(sort.sorted, 20);
  const paged = pager.paged;

  const FILTERS: { label: string; value: Filter; count?: number }[] = [
    { label: "All",     value: "all",     count: stats.total },
    { label: "Users",   value: "user",    count: stats.total - stats.admins },
    { label: "Admins",  value: "admin",   count: stats.admins },
    { label: "Blocked", value: "blocked", count: stats.blocked },
  ];

  const ROW_GRID = "grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.5fr)_104px_96px_auto]";

  return (
    <SuperAdminLayout title="Customers" subtitle="Everyone with an account — tap a person to see everything about them">
      <>
      {/* The one list scaffold every admin list uses — People had grown its
          own toolbar, its own counter and its own three inline states. */}
      <AdminListShell
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search name, email, phone, apartment…"
        count={filteredPeople.length}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={!isLoading && people.length === 0}
        isNoResults={people.length > 0 && filteredPeople.length === 0}
        emptyTitle="No people yet"
        emptySubtitle="Everyone who signs up appears here."

        onClearFilters={() => { setSearch(""); setFilter("all"); setServiceFilter("all"); }}
        filters={
          <>
            {FILTERS.map((f) => (
              <button key={f.value} type="button" onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={cn("group flex h-10 items-center gap-1.5 rounded-full px-4 text-body font-semibold transition-colors",
                  filter === f.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                )}>
                {f.label}
                {typeof f.count === "number" && (
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums",
                    filter === f.value ? "bg-background/20 text-background" : "bg-muted-foreground/15 text-muted-foreground"
                  )}>{f.count}</span>
                )}
              </button>
            ))}
            <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as any)}>
              <SelectTrigger className="w-40 rounded-full" inputSize="sm"><SelectValue placeholder="All services" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {SERVICE_ORDER.filter((k) => people.some((p) => p.services.has(k))).map((k) => <SelectItem key={k} value={k}>{serviceMeta(k).label}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      >
      <div className="overflow-hidden rounded-radius-md bg-card">
              {/* Header row (desktop) */}
              <div className={cn("hidden items-center gap-4 border-b border-border/40 px-space-5 py-space-3 text-meta font-semibold text-muted-foreground md:grid", ROW_GRID)}>
                <div aria-sort={sort.ariaSort("person")}><SortHeader {...sort.headerProps("person")}>Person</SortHeader></div>
                <div aria-sort={sort.ariaSort("services")}><SortHeader {...sort.headerProps("services")}>Services</SortHeader></div>
                <div aria-sort={sort.ariaSort("roles")}><SortHeader {...sort.headerProps("roles")}>Roles</SortHeader></div>
                <div aria-sort={sort.ariaSort("joined")}><SortHeader {...sort.headerProps("joined")}>Joined</SortHeader></div>
                <div aria-sort={sort.ariaSort("status")}><SortHeader {...sort.headerProps("status")}>Status</SortHeader></div>
                <div className="text-right">Actions</div>
              </div>

              <div className="divide-y divide-border/40">
                {paged.map((p) => {
                  const roles = userRoles(p.raw);
                  const rbac = ((p.raw as any).rbacRoles ?? []) as string[];
                  const isAdmin = isAdminUser(p.raw);
                  const svcArr = [...p.services].sort((a, b) => SERVICE_ORDER.indexOf(a) - SERVICE_ORDER.indexOf(b));

                  // The name opens the sheet — a real button, so the row's
                  // main action is reachable by keyboard and by thumb.
                  const person = (
                    <button
                      type="button"
                      onClick={() => openUser(p.id)}
                      className="flex min-w-0 items-center gap-3 rounded-radius-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                        {initials(p.name, p.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.email || p.phone || "—"}
                          {p.addressLine && <> · {p.addressLine}</>}
                        </p>
                      </div>
                    </button>
                  );

                  const svcChips = svcArr.length ? (
                    <div className="flex flex-wrap gap-1">
                      {svcArr.map((k) => {
                        const meta = serviceMeta(k); const Icon = meta.icon;
                        return (
                          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-meta font-semibold text-muted-foreground">
                            <Icon className="h-3 w-3" />{meta.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>;

                  const roleChips = (
                    <div className="flex flex-wrap gap-1">
                      {isAdmin && <Badge variant="default" className="text-meta">Admin</Badge>}
                      {rbac.map((slug: string) => (
                        <Badge key={slug} variant="outline" className="text-meta capitalize">{slug}</Badge>
                      ))}
                      {roles.filter((r: string) => r !== "super_admin").map((r: string) => (
                        <Badge key={r} variant="outline" className="text-meta">{formatRole(r)}</Badge>
                      ))}
                      {!isAdmin && rbac.length === 0 && roles.filter((r: string) => r !== "super_admin").length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );

                  const statusChip = p.isBlocked
                    ? <Badge variant="destructive" className="text-meta">Blocked</Badge>
                    : svcArr.length ? <Badge variant="default" className="text-meta">Active</Badge>
                    : p.lapsed ? <Badge variant="secondary" className="text-meta">Lapsed</Badge>
                    : <Badge variant="outline" className="text-meta">Idle</Badge>;

                  const contact = (
                    <ContactActions name={p.name} phone={p.phone} whatsapp={p.whatsapp} email={p.email} />
                  );

                  // Every row action has a visible label in the sheet — block
                  // used to be an unlabelled icon whose meaning lived in a
                  // hover title a phone never shows.
                  const menu = (
                    <MobileActionSheet
                      title={p.name}
                      className="h-10 w-10"
                      actions={[
                        { label: "Open profile", icon: <Pencil className="h-4 w-4" />, onClick: () => openUser(p.id) },
                        p.isBlocked
                          ? { label: "Unblock", icon: <UserCheck className="h-4 w-4" />, onClick: () => blockMutation.mutate({ userId: p.id, block: false }) }
                          : { label: "Block…", icon: <Ban className="h-4 w-4" />, danger: true, onClick: () => setBlockTarget({ id: p.id, name: p.name }) },
                      ]}
                    />
                  );

                  return (
                    <div key={p.id} className={cn("group px-space-5 py-space-3 transition-colors hover:bg-muted/30", p.isBlocked && "opacity-60")}>
                      {/* Desktop grid */}
                      <div className={cn("hidden items-center gap-4 md:grid", ROW_GRID)}>
                        {person}
                        {svcChips}
                        {roleChips}
                        <div className="text-xs text-muted-foreground">
                          {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : "—"}
                        </div>
                        <div>{statusChip}</div>
                        <div className="flex items-center justify-end gap-1">
                          {contact}
                          {menu}
                        </div>
                      </div>
                      {/* Mobile card */}
                      <div className="space-y-3 md:hidden">
                        <div className="flex items-start justify-between gap-3">
                          {person}
                          {statusChip}
                        </div>
                        {svcArr.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {svcChips}
                          </div>
                        )}
                        {(isAdmin || rbac.length > 0 || roles.length > 0) && (
                          <div>{roleChips}</div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : "—"}
                          </span>
                          <div className="flex items-center gap-1">
                            {contact}
                            {menu}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <TablePagination {...pager} onPage={pager.setPage} />
      </div>
      </AdminListShell>

      {/* Blocking locks a customer out of the platform — it was one
          unconfirmed click on an unlabelled icon button. Unblocking stays
          immediate: it's reversible and non-destructive. */}
      <AlertDialog open={!!blockTarget} onOpenChange={(o) => !o && setBlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {blockTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to the platform immediately and can't sign in.
              Active subscriptions keep running and are not refunded. You can
              unblock them again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (blockTarget) blockMutation.mutate({ userId: blockTarget.id, block: true });
                setBlockTarget(null);
              }}
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    </SuperAdminLayout>
  );
};


export function EditUserForm({ user, auditLogs, onSave, onSoftDelete, saving, deleting, hidePurchases }: {
  user: any;
  auditLogs: any[];
  /** The Customer page lists purchases itself, above the form. */
  hidePurchases?: boolean;
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

  // Full purchase history across EVERY source — cleaning, food, beach,
  // universal / one-time plans and car rentals — from the read model. It used
  // to query three tables and so a renter's sheet said "No subscriptions".
  const { data: allSubscriptions = [], isLoading: subsLoading } = useCustomerSales(user.id);
  const { metaOf: serviceMeta } = useCustomerServices();

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

  const activeSubsCount = allSubscriptions.filter((s) => s.active).length;

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
        <div className="space-y-3 rounded-radius-md bg-muted/20 p-3">
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

        {/* Platform credit — what they hold, and the one way to change it. */}
        <CustomerCredit userId={user.id} />

        {/* Linked Client Profiles */}
        <div>
          <Label>Linked Client Profiles</Label>
          {userLinkedClients(user).length > 0 ? (
            <div className="mt-2 space-y-2">
              {userLinkedClients(user).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-radius-md bg-muted p-3">
                  <div>
                    <p className="text-sm font-semibold">{c.company_name}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </div>
<StatusPill status={c.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No linked client profile</p>
          )}
        </div>

        <Button className="w-full" size="lg" onClick={() => onSave({ name, display_name: displayName })} loading={saving}>
          Save Changes
        </Button>
      </TabsContent>

      {/* ── PLANS & HISTORY ──────────────────────────────────────── */}
      <TabsContent value="plans" className="mt-4 space-y-5">
        {!hidePurchases && (
        <div>
          <Label>Everything they've bought</Label>
          {subsLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading purchases…</p>
          ) : allSubscriptions.length > 0 ? (
            <div className="mt-2 space-y-2">
              {allSubscriptions.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 rounded-radius-md bg-muted p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-meta shrink-0">{serviceMeta(s.service).label}</Badge>
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {statusLabel(s.status)}
                      {s.paymentStatus && <> · {statusLabel(s.paymentStatus)}</>}
                      {s.amountCents != null && <> · {formatUSD(s.amountCents)}</>}
                      {s.createdAt && <> · {format(new Date(s.createdAt), "MMM d, yyyy")}</>}
                    </p>
                  </div>
                  <Badge variant={s.active ? "default" : "secondary"} className="text-xs shrink-0">
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nothing bought yet</p>
          )}
        </div>
        )}

        <div>
          <Label>Subscription Period History</Label>
          {(periodHistory as any[]).length > 0 ? (
            <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
              {(periodHistory as any[]).map((p) => (
                <div key={p.id} className="rounded-radius-md bg-muted px-3 py-2 text-xs">
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
                    {p.payment_status && <> · {statusLabel(p.payment_status)}</>}
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
                  aria-pressed={selected}
                  className={cn("rounded-radius-md px-3 py-2 text-left transition-colors", selected ? "bg-card ring-2 ring-foreground" : "bg-muted hover:bg-muted/70")}
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
              <Button variant="destructive" className="w-full" size="lg" onClick={() => setConfirmDelete(true)}>
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


/**
 * What a customer is holding, and the only way to change it by hand.
 *
 * `user_credits` is service-role only — it decides who gets money — so this
 * goes through the API rather than writing the row itself. Before it existed,
 * compensating anybody for a ruined delivery meant SQL.
 *
 * A note is required, because it is the entire record of why somebody was
 * given money.
 */
function CustomerCredit({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const KEY = ["admin-customer-credits", userId] as const;
  const { data, isLoading, isError, error: creditError } = useQuery({
    queryKey: KEY,
    enabled: !!userId,
    queryFn: async () => {
      const { data: d, error } = await adminApi(`/admin/customers/${encodeURIComponent(userId)}/credits`);
      if (error) throw error;
      return d as { balanceCents: number; entries: Array<{ amountCents: number; note: string | null; createdAt: string }> };
    },
  });

  const adjust = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(amount) * 100);
      const { error } = await adminApi(`/admin/customers/${encodeURIComponent(userId)}/credits`, {
        method: "POST",
        body: JSON.stringify({ amount_cents: cents, note: note.trim() }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Credit updated");
      setAmount(""); setNote("");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(adminApiMessage(e, "Could not change the balance")),
  });

  return (
    <div>
      <Label>Platform credit</Label>
      {isError ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {isNotDeployed(creditError)
            ? "Credit needs the server updating before it can be read or given."
            : "Not available right now."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
            {isLoading ? "…" : formatUSD(data?.balanceCents ?? 0)}
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10.00"
              className="w-28"
              aria-label="Amount in dollars; negative takes it back"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why — this is the record"
            />
            <Button
              variant="secondary"
              onClick={() => adjust.mutate()}
              disabled={adjust.isPending || !Number(amount) || !note.trim()}
            >
              Apply
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            A negative amount takes credit back. The balance can never go below zero.
          </p>
          {!!data?.entries?.length && (
            <ul className="mt-2 divide-y divide-border/60 text-xs">
              {data.entries.slice(0, 5).map((e, i) => (
                <li key={i} className="flex justify-between gap-2 py-1.5">
                  <span className="truncate text-muted-foreground">{e.note || "—"}</span>
                  <span className={e.amountCents < 0 ? "tabular-nums text-destructive" : "tabular-nums text-positive"}>
                    {e.amountCents < 0 ? "" : "+"}{formatUSD(e.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
