import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus, Mail, UserRound, Users, X } from "lucide-react";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { QueryError } from "@/components/patterns/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { Spinner } from "@/components/ui/spinner";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { fetchUsersByIds, isUserUuid } from "@/lib/admin/customerNames";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { UserPicker } from "@/components/patterns/UserPicker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tr, trx } from "@/lib/tr";

/**
 * Staff tab: owner + managers.
 *
 * Reads still come straight from the table — a membership list is not a
 * secret. Every WRITE goes through the account API: `provider_members` is what
 * the backend consults before showing a provider's day (home addresses,
 * access instructions) and `providers.admin_user_id` is what the payout
 * endpoint calls ownership. Both were writable with the anon key that ships in
 * this bundle, so anyone could appoint themselves. The table now refuses those
 * writes; see backend/src/account/provider-members.service.ts.
 */
export interface UniversalStaffTabProps {
  /** Universal `providers.id` — the business whose team this is. */
  providerId: string;
  /** Currently-set owner user id (from provider row's admin_user_id). */
  ownerUserId: string | null | undefined;
  /** Kept for the owner query key and audit entity naming; writes go through the API. */
  providerTable: string;
  /** Managers table, read directly. Writes go through the API. */
  managerTable: string;
  /** Human label ("restaurant", "cleaning provider", "car rental", "beach club"). */
  entityLabel: string;
  /** Audit-log entity type — e.g. `food_provider`, `cleaning_provider`. */
  auditEntityProvider: string;
  /** Audit-log entity type for managers — e.g. `food_restaurant_manager`. */
  auditEntityManager: string;
  /** Optional: the manager table has a `user_name` column (food/rental yes, cleaning no). */
  hasUserNameColumn?: boolean;
  /** Optional: the manager table has a `role` column (cleaning yes). Written as "manager". */
  hasRoleColumn?: boolean;
  /** Optional: extra query keys to invalidate after an owner change (e.g. legacy provider row query). */
  invalidateKeysOnOwnerChange?: readonly (readonly unknown[])[];
  /**
   * Whether the viewer may change who runs this.
   *
   * A manager sees the team and cannot appoint one. The endpoints refuse them
   * regardless — `provider-members.service` checks `admin_user_id` and not
   * membership — so this is only about not offering a button whose answer is
   * a refusal.
   */
  canManage?: boolean;
}

interface TeamInvite {
  id: string;
  email: string | null;
  sentAt: string;
  expiresAt: string;
  openedAt: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
  state: "sent" | "opened" | "accepted" | "expired" | "cancelled";
}

const INVITE_STATE: Record<TeamInvite["state"], { label: string; className: string }> = {
  sent: { label: tr("Sent"), className: "bg-muted text-muted-foreground" },
  opened: { label: tr("Opened"), className: "bg-primary/15 text-primary" },
  accepted: { label: tr("Accepted"), className: "bg-success/15 text-success" },
  expired: { label: tr("Expired"), className: "bg-muted text-muted-foreground" },
  cancelled: { label: tr("Cancelled"), className: "bg-muted text-muted-foreground" },
};

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

/** What happened to an invite, in one line under the address. */
function inviteLine(i: TeamInvite): string {
  switch (i.state) {
    case "accepted": return tr("Accepted {shortDate} · sent {shortDate2}", { shortDate: shortDate(i.acceptedAt), shortDate2: shortDate(i.sentAt) });
    case "cancelled": return tr("Cancelled {shortDate} · sent {shortDate2}", { shortDate: shortDate(i.cancelledAt), shortDate2: shortDate(i.sentAt) });
    case "expired": return tr("Expired {shortDate} · never accepted", { shortDate: shortDate(i.expiresAt) });
    case "opened": return tr("Sent {shortDate} · opened {shortDate2}, not accepted yet", { shortDate: shortDate(i.sentAt), shortDate2: shortDate(i.openedAt) });
    default: return tr("Sent {shortDate} · not opened yet · valid until {shortDate2}", { shortDate: shortDate(i.sentAt), shortDate2: shortDate(i.expiresAt) });
  }
}

interface Manager {
  id: string;
  provider_id: string;
  user_id: string;
  user_email: string | null;
  user_name?: string | null;
  role?: string | null;
  created_at: string;
}

export function UniversalStaffTab({
  providerId, ownerUserId,
  providerTable, managerTable, entityLabel,
  auditEntityProvider, auditEntityManager,
  hasUserNameColumn = false,
  hasRoleColumn = false,
  invalidateKeysOnOwnerChange = [],
  canManage = true,
}: UniversalStaffTabProps) {
  const qc = useQueryClient();
  const { userData, isSuperAdmin } = useAuth();

  const [ownerDialog, setOwnerDialog] = useState(false);
  const [managerDialog, setManagerDialog] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ user_id: "" });
  const [managerForm, setManagerForm] = useState({ user_email: "", user_name: "", user_id: "" });
  const [deleteManager, setDeleteManager] = useState<Manager | null>(null);
  /** Admins only: add by email, or pick an existing platform user. */
  const [addBy, setAddBy] = useState<"email" | "user">("email");

  const OWNER_QK = ["staff-owner", providerTable, ownerUserId] as const;
  const MANAGERS_QK = ["staff-managers", managerTable, providerId] as const;
  const PROFILES_QK = ["staff-manager-profiles", managerTable, providerId] as const;

  const {
    data: owner, isError: ownerError, error: ownerErr,
    refetch: refetchOwner, isFetching: ownerFetching,
  } = useQuery({
    queryKey: OWNER_QK,
    enabled: !!ownerUserId,
    queryFn: async () => {
      // Same reason as the batch below: `users.id` is a uuid column, and an
      // owner recorded under a Google-sub id 400s rather than simply missing.
      if (!isUserUuid(ownerUserId)) return null;
      // Through the API (the `users` table is closed to the browser); the
      // team of a business may know its owner.
      const map = await fetchUsersByIds([ownerUserId]);
      return map.get(ownerUserId) ?? { id: ownerUserId, email: null, name: null, display_name: null };
    },
  });

  const {
    data: managers = [], isLoading, isError: managersError, error: managersErr,
    refetch: refetchManagers, isFetching: managersFetching,
  } = useQuery({
    queryKey: MANAGERS_QK,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from(managerTable)
        .select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Manager[];
    },
  });

  // Invites this business sent by email — who has them, who accepted. Owner
  // (and admin) only, like the endpoint.
  const INVITES_QK = ["staff-invites", providerId] as const;
  const { data: invites = [] } = useQuery({
    queryKey: INVITES_QK,
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/team-invites`);
      if (error) throw error;
      return ((data as { invites?: TeamInvite[] } | null)?.invites ?? []);
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (i: TeamInvite) => {
      const { error } = await accountApi(`/account/providers/${providerId}/team-invites/${i.id}`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Invite cancelled — the link no longer works"));
      qc.invalidateQueries({ queryKey: INVITES_QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  // Enrich managers with their user profile so we can render display_name even
  // when the manager table only stored user_email (cleaning schema).
  const managerIds = managers.map((m) => m.user_id).filter(Boolean);
  const { data: managerProfiles = {} } = useQuery({
    queryKey: [...PROFILES_QK, managerIds] as const,
    enabled: managerIds.length > 0,
    queryFn: async () => {
      // Guarded: one manager stored under a Google-sub id would 400 the batch
      // and blank the name of every other member of the team.
      const users = await fetchUsersByIds(managerIds);
      const map: Record<string, { name?: string | null; display_name?: string | null; email?: string | null }> = {};
      users.forEach((u, id) => { map[id] = u; });
      return map;
    },
  });

  const [confirmSelfLockout, setConfirmSelfLockout] = useState(false);

  const setOwnerMutation = useMutation({
    mutationFn: async () => {
      const nextOwner = ownerForm.user_id.trim() || null;
      // Through the API, not the table: `providers.admin_user_id` is what the
      // payout endpoint calls ownership, so the column refuses browser writes
      // and this endpoint checks who is asking first.
      const { error } = await accountApi(`/account/providers/${providerId}/owner`, {
        method: "PUT",
        body: JSON.stringify({ userId: nextOwner }),
      });
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", auditEntityProvider, providerId, { admin_user_id: nextOwner });
    },
    onSuccess: () => {
      toast.success(tr("Owner updated"));
      qc.invalidateQueries({ queryKey: OWNER_QK });
      invalidateKeysOnOwnerChange.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setOwnerDialog(false);
      setConfirmSelfLockout(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  // Guard: if the current user is trying to remove themselves as the sole
  // owner (nextOwner = null AND current admin is the existing owner), require
  // an explicit second confirmation. Otherwise a misclick on "No owner" locks
  // the owner out of their own workspace with no way back.
  const trySaveOwner = () => {
    const nextOwner = ownerForm.user_id.trim() || null;
    const iAmCurrentOwner = !!ownerUserId && ownerUserId === userData?.id;
    if (nextOwner === null && iAmCurrentOwner) {
      setConfirmSelfLockout(true);
      return;
    }
    setOwnerMutation.mutate();
  };

  const managerEmail = managerForm.user_email.trim().toLowerCase();
  const managerEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail);
  const pickingUser = isSuperAdmin && addBy === "user";
  const canAddManager = pickingUser ? !!managerForm.user_id.trim() : managerEmailOk;

  const addManagerMutation = useMutation({
    mutationFn: async () => {
      // Always by email. The server decides: someone with an account joins at
      // once and is emailed that they now have access; anyone else gets an
      // invite link and joins when they sign up and accept (Edge
      // provider-growth). A business never sees the platform's user list.
      const name = hasUserNameColumn ? managerForm.user_name.trim() || null : null;
      // A platform admin picks the person from the user list, as before.
      // Picked from the list (admins only) → added directly; typed email → the
      // invite path, which also tells an existing account it has access.
      const picked = pickingUser && !!managerForm.user_id.trim();
      const payload = picked
        ? { userId: managerForm.user_id.trim() || null, userEmail: managerForm.user_email.trim() || null, userName: name }
        : { email: managerEmail, name };
      const { data, error } = await accountApi(
        `/account/providers/${providerId}/${picked ? "members" : "team-invites"}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (error) throw error;
      await logAuditEvent(userData!.id, "create", auditEntityManager, providerId, payload);
      return data as { added?: boolean; already?: boolean; invited?: boolean; emailed?: boolean } | null;
    },
    onSuccess: (r) => {
      if (r?.already) toast.info(tr("They're already on the team"));
      else if (r?.invited) toast.success(r.emailed ? tr("Invite sent — they join once they sign up and accept") : tr("Invite created, but the email didn't go out"));
      else toast.success(r?.emailed ? tr("Manager added — we've emailed them") : tr("Manager added"));
      qc.invalidateQueries({ queryKey: MANAGERS_QK });
      qc.invalidateQueries({ queryKey: ["staff-invites", providerId] });
      setManagerForm({ user_email: "", user_name: "", user_id: "" });
      setManagerDialog(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const removeManagerMutation = useMutation({
    mutationFn: async (m: Manager) => {
      const { error } = await accountApi(
        `/account/providers/${providerId}/members/${m.id}`, { method: "DELETE" },
      );
      if (error) throw error;
      await logAuditEvent(userData!.id, "delete", auditEntityManager, m.id, {});
    },
    onSuccess: () => {
      toast.success(tr("Manager removed"));
      qc.invalidateQueries({ queryKey: MANAGERS_QK });
      setDeleteManager(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const openOwnerDialog = () => {
    setOwnerForm({ user_id: ownerUserId ?? "" });
    setOwnerDialog(true);
  };

  return (
    <div className="space-y-1">
      {/* Owner */}
      <WorkspaceSection
        title={tr("Owner")}
        subtitle={tr("Who this {entityLabel} belongs to.", { entityLabel })}
        action={
          // Choosing an owner means choosing from every account on the
          // platform — that list is the admin's alone.
          canManage && isSuperAdmin ? (
            <Button size="sm" variant="outline" className="shrink-0 gap-2" onClick={openOwnerDialog}>
              {owner ? tr("Change") : tr("Set Owner")}
            </Button>
          ) : undefined
        }
      >
        {owner ? (
          <div className="flex items-center gap-3 rounded-radius-md bg-inset p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-primary/15 font-semibold text-primary">
              {(owner.display_name ?? owner.name ?? owner.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{owner.display_name ?? owner.name ?? "Unnamed"}</p>
              <p className="truncate text-sm text-muted-foreground">{owner.email}</p>
            </div>
            <Badge className="rounded-full bg-primary/15 text-primary">{tr("Owner")}</Badge>
          </div>
        ) : ownerError ? (
          <QueryError
            compact
            title={tr("Couldn't load the owner")}
            error={ownerErr}
            onRetry={() => refetchOwner()}
            retrying={ownerFetching}
          />
        ) : (
          <YdEmptyState
            className="bg-inset py-8"
            icon={UserRound}
            title={tr("No owner assigned")}
            subtitle={tr("Set one to grant {entityLabel}-level access.", { entityLabel })}
            action={canManage && isSuperAdmin ? (
              <Button size="sm" variant="outline" onClick={openOwnerDialog}>{tr("Set owner")}</Button>
            ) : undefined}
          />
        )}
      </WorkspaceSection>

      {/* Managers */}
      <WorkspaceSection
        title={`Managers (${managers.length})`}
        subtitle={tr("They can run the {entityLabel} but not its money.", { entityLabel })}
        action={
          canManage ? (
            <Button size="sm" variant="outline" className="shrink-0 gap-2" onClick={() => setManagerDialog(true)}>
              <UserPlus className="h-3.5 w-3.5" />{" "}{tr("Add")}</Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-radius-md bg-inset" />)}
          </div>
        ) : managersError ? (
          <QueryError
            compact
            title={tr("Couldn't load the managers")}
            error={managersErr}
            onRetry={() => refetchManagers()}
            retrying={managersFetching}
          />
        ) : managers.length === 0 ? (
          <YdEmptyState
            className="bg-inset py-8"
            icon={Users}
            title={tr("No managers yet")}
            subtitle={tr("Add team members who can manage this {entityLabel}.", { entityLabel })}
            action={canManage ? (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setManagerDialog(true)}>
                <UserPlus className="h-3.5 w-3.5" />{" "}{tr("Add a manager")}</Button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-2">
            {managers.map((m) => {
              const profile = managerProfiles[m.user_id];
              const displayName = m.user_name ?? profile?.display_name ?? profile?.name ?? "Unnamed";
              const email = m.user_email ?? profile?.email ?? m.user_id;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-radius-md bg-inset p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-muted font-semibold text-muted-foreground">
                    {(displayName ?? email ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold leading-[22px] text-foreground">{displayName}</p>
                    <p className="flex items-center gap-1 truncate text-[14px] leading-[18px] text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {email}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteManager(m)}
                      aria-label={tr("Remove manager")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </WorkspaceSection>

      {/* Invites sent by email */}
      {canManage && invites.length > 0 && (
        <WorkspaceSection
          title={tr("Invites")}
          subtitle={tr("Who you invited by email, and who has accepted.")}
        >
          <div className="space-y-2">
            {invites.map((i) => {
              const st = INVITE_STATE[i.state];
              const open = i.state === "sent" || i.state === "opened";
              return (
                <div key={i.id} className={`flex items-center gap-3 rounded-radius-md bg-inset p-3 ${open || i.state === "accepted" ? "" : "opacity-60"}`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-muted text-muted-foreground">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold leading-[22px] text-foreground">{i.email ?? "—"}</p>
                    <p className="truncate text-[14px] leading-[18px] text-muted-foreground">{inviteLine(i)}</p>
                  </div>
                  <Badge className={`shrink-0 rounded-full ${st.className}`}>{st.label}</Badge>
                  {open && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => cancelInviteMutation.mutate(i)}
                      disabled={cancelInviteMutation.isPending}
                      aria-label={tr("Cancel the invite to {value}", { value: i.email ?? tr("this address") })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </WorkspaceSection>
      )}

      {/* Permissions note — same wording across services keeps ops training simple. */}
      <section className="rounded-radius-lg bg-card p-4 text-[14px] leading-[18px] tracking-[-0.02em]">
        <p className="mb-1 text-[16px] font-semibold leading-[22px] text-foreground">{tr("About permissions")}</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• <span className="font-medium text-foreground">{tr("Platform Admins")}</span>{" "}{trx("can manage every {entityLabel}", { entityLabel })}</li>
          <li>• <span className="font-medium text-foreground">{tr("Owner")}</span>{" "}{trx("can only access their own {entityLabel}", { entityLabel })}</li>
          <li>• <span className="font-medium text-foreground">{tr("Managers")}</span>{" "}{trx("can operate this {entityLabel} on the owner's behalf", { entityLabel })}</li>
        </ul>
      </section>

      {/* Set Owner dialog */}
      <Dialog open={ownerDialog} onOpenChange={(o) => { if (!o) setOwnerDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{owner ? tr("Change Owner") : tr("Set Owner")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tr("User")}</Label>
              <UserPicker
                value={ownerForm.user_id}
                onSelect={(u) => setOwnerForm({ user_id: u?.id ?? "" })}
                placeholder={tr("Select a platform user…")}
                allowClear
                clearLabel={tr("No owner (remove)")}
              />
              <p className="mt-1 text-xs text-muted-foreground">{tr("Pick a user from the platform. Choose \"No owner\" to remove the current owner.")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOwnerDialog(false)}>{tr("Cancel")}</Button>
            <Button onClick={trySaveOwner} disabled={setOwnerMutation.isPending}>
              {setOwnerMutation.isPending && <Spinner size="sm" className="mr-2" />}{tr("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Self-lockout confirm — sole owner removing themselves gets a second
          chance before losing workspace access. */}
      <AlertDialog open={confirmSelfLockout} onOpenChange={setConfirmSelfLockout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Remove yourself as owner?")}</AlertDialogTitle>
            <AlertDialogDescription>{trx("You're about to remove yourself as the owner of this {entityLabel}. You will lose access to this workspace and won't be able to add yourself back — only a platform admin can restore your access. Continue?", { entityLabel })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => setOwnerMutation.mutate()}
            >{tr("Yes, remove me")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Manager dialog */}
      <Dialog open={managerDialog} onOpenChange={(o) => { if (!o) { setManagerDialog(false); setAddBy("email"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{tr("Add a manager")}</DialogTitle></DialogHeader>
          <form
            id="add-manager-form"
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (canAddManager) addManagerMutation.mutate(); }}
          >
            {isSuperAdmin && (
              <Tabs value={addBy} onValueChange={(v) => { setAddBy(v as "email" | "user"); setManagerForm({ user_email: "", user_name: "", user_id: "" }); }}>
                <TabsList variant="segment">
                  <TabsTrigger value="email" variant="segment">{tr("By email")}</TabsTrigger>
                  <TabsTrigger value="user" variant="segment">{tr("Platform user")}</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {pickingUser ? (
              <div>
                <Label>{tr("User")}</Label>
                <UserPicker
                  value={managerForm.user_id}
                  onSelect={(u) => setManagerForm({
                    user_id: u?.id ?? "",
                    user_email: u?.email ?? "",
                    user_name: (u?.display_name || u?.name || u?.email) ?? "",
                  })}
                  placeholder={tr("Select a platform user…")}
                />
                <p className="mt-1 text-xs text-muted-foreground">{tr("They get access straight away.")}</p>
              </div>
            ) : (
              <div>
                <Label htmlFor="manager-email">{tr("Email")}</Label>
                <Input
                  id="manager-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoFocus
                  placeholder="name@example.com"
                  value={managerForm.user_email}
                  onChange={(e) => setManagerForm((f) => ({ ...f, user_email: e.target.value, user_id: "" }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">{tr("We'll email them. If they already have an EverySub account they get access straight away; if not, they sign up from the email and get access then.")}</p>
              </div>
            )}
          </form>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setManagerDialog(false)}>{tr("Cancel")}</Button>
            <Button type="submit" form="add-manager-form" disabled={!canAddManager || addManagerMutation.isPending}>
              {addManagerMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Plus className="mr-1 h-4 w-4" />}
              {pickingUser ? tr("Add") : tr("Send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove manager confirmation */}
      <AlertDialog open={!!deleteManager} onOpenChange={(o) => { if (!o) setDeleteManager(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Remove manager?")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("Remove")}{" "}<strong>{deleteManager?.user_name ?? deleteManager?.user_email ?? deleteManager?.user_id}</strong>{" "}{trx("from this {entityLabel}'s managers? They will lose access immediately.", { entityLabel })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteManager && removeManagerMutation.mutate(deleteManager)}
            >{tr("Remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
