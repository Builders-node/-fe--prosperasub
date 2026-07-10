import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Crown, UserPlus, Mail, Shield } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
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
 * Generic staff tab: owner + managers.
 *
 * Reused by every provider workspace (food / cars / cleaning / beach) so a
 * schema drift in one manager table (e.g. rental keeps `user_name`, cleaning
 * only has `user_email`) doesn't fork the UI. Consumer passes the table names
 * + which optional columns exist; the component takes care of dialogs,
 * mutations, and audit logging.
 */
export interface UniversalStaffTabProps {
  /** Legacy provider id — the row inside `providerTable` we edit for owner changes. */
  providerId: string;
  /** Currently-set owner user id (from provider row's admin_user_id). */
  ownerUserId: string | null | undefined;
  /** Legacy providers table — e.g. `food_providers`, `rental_providers`, `cleaning_providers`, `providers`. */
  providerTable: string;
  /** Managers table — e.g. `food_restaurant_managers`, `rental_provider_managers`, `cleaning_provider_managers`. */
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

  const setOwnerMutation = useMutation({
    mutationFn: async () => {
      const nextOwner = ownerForm.user_id.trim() || null;
      const { error } = await supabaseDb
        .from(providerTable)
        .update({ admin_user_id: nextOwner, updated_at: new Date().toISOString() })
        .eq("id", providerId);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", auditEntityProvider, providerId, { admin_user_id: nextOwner });
    },
    onSuccess: () => {
      toast.success("Owner updated");
      qc.invalidateQueries({ queryKey: OWNER_QK });
      invalidateKeysOnOwnerChange.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setOwnerDialog(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  const addManagerMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        provider_id: providerId,
        user_id: managerForm.user_id.trim() || managerForm.user_email.trim(),
        user_email: managerForm.user_email.trim() || null,
      };
      if (hasUserNameColumn) payload.user_name = managerForm.user_name.trim() || null;
      if (hasRoleColumn) payload.role = "manager";
      const { data, error } = await supabaseDb
        .from(managerTable)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      await logAuditEvent(userData!.id, "create", auditEntityManager, data.id, payload);
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
      const { error } = await supabaseDb.from(managerTable).delete().eq("id", m.id);
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black tracking-tight">Staff</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owner and managers who can access this {entityLabel}.
        </p>
      </div>

      {/* Owner */}
      <section className="rounded-2xl bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Owner</h3>
          </div>
          <Button size="sm" variant="outline" className="gap-2 rounded-full" onClick={openOwnerDialog}>
            {owner ? "Change" : "Set Owner"}
          </Button>
        </div>

        {owner ? (
          <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
              {(owner.display_name ?? owner.name ?? owner.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{owner.display_name ?? owner.name ?? "Unnamed"}</p>
              <p className="truncate text-sm text-muted-foreground">{owner.email}</p>
            </div>
            <Badge className="rounded-full bg-primary/15 text-primary">Owner</Badge>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No owner assigned. Set one to grant {entityLabel}-level access.
          </p>
        )}
      </section>

      {/* Managers */}
      <section className="rounded-2xl bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Managers ({managers.length})
            </h3>
          </div>
          <Button size="sm" variant="outline" className="gap-2 rounded-full" onClick={() => setManagerDialog(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Add Manager
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : managers.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No managers yet. Add team members who can manage this {entityLabel}.
          </p>
        ) : (
          <div className="space-y-2">
            {managers.map((m) => {
              const profile = managerProfiles[m.user_id];
              const displayName = m.user_name ?? profile?.display_name ?? profile?.name ?? "Unnamed";
              const email = m.user_email ?? profile?.email ?? m.user_id;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground">
                    {(displayName ?? email ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{displayName}</p>
                    <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
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
      </section>

      {/* Permissions note — same wording across services keeps ops training simple. */}
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="mb-1 font-semibold text-primary">About Permissions</p>
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
            <Button onClick={() => setOwnerMutation.mutate()} disabled={setOwnerMutation.isPending}>
              {setOwnerMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
