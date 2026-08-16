import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus, Mail } from "lucide-react";
import { WorkspaceEmpty, WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { Spinner } from "@/components/ui/spinner";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { UserPicker } from "@/components/UserPicker";

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
}: UniversalStaffTabProps) {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const [ownerDialog, setOwnerDialog] = useState(false);
  const [managerDialog, setManagerDialog] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ user_id: "" });
  const [managerForm, setManagerForm] = useState({ user_email: "", user_name: "", user_id: "" });
  const [deleteManager, setDeleteManager] = useState<Manager | null>(null);

  const OWNER_QK = ["staff-owner", providerTable, ownerUserId] as const;
  const MANAGERS_QK = ["staff-managers", managerTable, providerId] as const;
  const PROFILES_QK = ["staff-manager-profiles", managerTable, providerId] as const;

  const { data: owner } = useQuery({
    queryKey: OWNER_QK,
    enabled: !!ownerUserId,
    queryFn: async () => {
      if (!ownerUserId) return null;
      const { data } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name")
        .eq("id", ownerUserId)
        .maybeSingle();
      return data;
    },
  });

  const { data: managers = [], isLoading } = useQuery({
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

  // Enrich managers with their user profile so we can render display_name even
  // when the manager table only stored user_email (cleaning schema).
  const managerIds = managers.map((m) => m.user_id).filter(Boolean);
  const { data: managerProfiles = {} } = useQuery({
    queryKey: [...PROFILES_QK, managerIds] as const,
    enabled: managerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name")
        .in("id", managerIds);
      const map: Record<string, { name?: string | null; display_name?: string | null; email?: string | null }> = {};
      (data ?? []).forEach((u: any) => { map[u.id] = u; });
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
      toast.success("Owner updated");
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

  const addManagerMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        userId: managerForm.user_id.trim() || null,
        userEmail: managerForm.user_email.trim() || null,
        userName: hasUserNameColumn ? managerForm.user_name.trim() || null : null,
      };
      // A membership is what lets someone see this business's day — addresses
      // included — so the server resolves the person and checks the caller
      // owns the business before writing the row.
      const { data, error } = await accountApi(`/account/providers/${providerId}/members`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (error) throw error;
      await logAuditEvent(userData!.id, "create", auditEntityManager, String((data as any)?.id ?? providerId), payload);
    },
    onSuccess: () => {
      toast.success("Manager added");
      qc.invalidateQueries({ queryKey: MANAGERS_QK });
      setManagerForm({ user_email: "", user_name: "", user_id: "" });
      setManagerDialog(false);
    },
    onError: (e) => toast.error(String(e)),
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
      toast.success("Manager removed");
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
        title="Owner"
        subtitle={`Who this ${entityLabel} belongs to.`}
        action={
          <Button size="sm" variant="outline" className="shrink-0 gap-2 rounded-full" onClick={openOwnerDialog}>
            {owner ? "Change" : "Set Owner"}
          </Button>
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
            <Badge className="rounded-full bg-primary/15 text-primary">Owner</Badge>
          </div>
        ) : (
          <WorkspaceEmpty>
            No owner assigned. Set one to grant {entityLabel}-level access.
          </WorkspaceEmpty>
        )}
      </WorkspaceSection>

      {/* Managers */}
      <WorkspaceSection
        title={`Managers (${managers.length})`}
        subtitle={`They can run the ${entityLabel} but not its money.`}
        action={
          <Button size="sm" variant="outline" className="shrink-0 gap-2 rounded-full" onClick={() => setManagerDialog(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Add
          </Button>
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-radius-md bg-inset" />)}
          </div>
        ) : managers.length === 0 ? (
          <WorkspaceEmpty>
            No managers yet. Add team members who can manage this {entityLabel}.
          </WorkspaceEmpty>
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteManager(m)}
                    aria-label="Remove manager"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </WorkspaceSection>

      {/* Permissions note — same wording across services keeps ops training simple. */}
      <section className="rounded-radius-lg bg-card p-4 text-[14px] leading-[18px] tracking-[-0.02em]">
        <p className="mb-1 text-[16px] font-semibold leading-[22px] text-foreground">About permissions</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• <span className="font-medium text-foreground">Platform Admins</span> can manage every {entityLabel}</li>
          <li>• <span className="font-medium text-foreground">Owner</span> can only access their own {entityLabel}</li>
          <li>• <span className="font-medium text-foreground">Managers</span> can operate this {entityLabel} on the owner's behalf</li>
        </ul>
      </section>

      {/* Set Owner dialog */}
      <Dialog open={ownerDialog} onOpenChange={(o) => { if (!o) setOwnerDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{owner ? "Change Owner" : "Set Owner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>User</Label>
              <UserPicker
                value={ownerForm.user_id}
                onSelect={(u) => setOwnerForm({ user_id: u?.id ?? "" })}
                placeholder="Select a platform user…"
                allowClear
                clearLabel="No owner (remove)"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a user from the platform. Choose "No owner" to remove the current owner.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOwnerDialog(false)}>Cancel</Button>
            <Button onClick={trySaveOwner} disabled={setOwnerMutation.isPending}>
              {setOwnerMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Self-lockout confirm — sole owner removing themselves gets a second
          chance before losing workspace access. */}
      <AlertDialog open={confirmSelfLockout} onOpenChange={setConfirmSelfLockout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove yourself as owner?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to remove yourself as the owner of this {entityLabel}.
              You will lose access to this workspace and won't be able to add
              yourself back — only a platform admin can restore your access.
              Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => setOwnerMutation.mutate()}
            >
              Yes, remove me
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Manager dialog */}
      <Dialog open={managerDialog} onOpenChange={(o) => { if (!o) setManagerDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Manager</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>User *</Label>
              <UserPicker
                value={managerForm.user_id}
                onSelect={(u) => setManagerForm({
                  user_id: u?.id ?? "",
                  user_email: u?.email ?? "",
                  user_name: (u?.display_name || u?.name || u?.email) ?? "",
                })}
                placeholder="Select a platform user…"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Pick the platform user to grant manager access to this {entityLabel}.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManagerDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addManagerMutation.mutate()}
              disabled={!managerForm.user_id.trim() || addManagerMutation.isPending}
            >
              {addManagerMutation.isPending && <Spinner size="sm" className="mr-2" />}
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove manager confirmation */}
      <AlertDialog open={!!deleteManager} onOpenChange={(o) => { if (!o) setDeleteManager(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove manager?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteManager?.user_name ?? deleteManager?.user_email ?? deleteManager?.user_id}</strong>{" "}
              from this {entityLabel}'s managers? They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteManager && removeManagerMutation.mutate(deleteManager)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
