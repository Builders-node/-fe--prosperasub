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
import type { FoodProvider } from "@/types/food";

interface Manager {
  id: string;
  provider_id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  created_at: string;
}

interface Props {
  restaurant: FoodProvider;
}

export function RestaurantStaffTab({ restaurant }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const [ownerDialog, setOwnerDialog] = useState(false);
  const [managerDialog, setManagerDialog] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ user_id: "" });
  const [managerForm, setManagerForm] = useState({ user_email: "", user_name: "", user_id: "" });
  const [deleteManager, setDeleteManager] = useState<Manager | null>(null);

  // Owner user details
  const { data: owner } = useQuery({
    queryKey: ["food-restaurant-owner", restaurant.admin_user_id],
    queryFn: async () => {
      if (!restaurant.admin_user_id) return null;
      const { data } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name")
        .eq("id", restaurant.admin_user_id)
        .maybeSingle();
      return data;
    },
    enabled: !!restaurant.admin_user_id,
  });

  // Managers list
  const { data: managers = [], isLoading } = useQuery({
    queryKey: ["food-restaurant-managers", restaurant.id],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_restaurant_managers")
        .select("*")
        .eq("provider_id", restaurant.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Manager[];
    },
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const setOwnerMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabaseDb
        .from("food_providers")
        .update({
          admin_user_id: ownerForm.user_id.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", restaurant.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_provider", restaurant.id, {
        admin_user_id: ownerForm.user_id.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Owner updated");
      qc.invalidateQueries({ queryKey: ["admin-food-restaurant", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["food-restaurant-owner"] });
      setOwnerDialog(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  const addManagerMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        provider_id: restaurant.id,
        user_id: managerForm.user_id.trim() || managerForm.user_email.trim(),
        user_email: managerForm.user_email.trim() || null,
        user_name: managerForm.user_name.trim() || null,
      };
      const { data, error } = await supabaseDb
        .from("food_restaurant_managers")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      await logAuditEvent(userData!.id, "create", "food_restaurant_manager", data.id, payload);
    },
    onSuccess: () => {
      toast.success("Manager added");
      qc.invalidateQueries({ queryKey: ["food-restaurant-managers", restaurant.id] });
      setManagerForm({ user_email: "", user_name: "", user_id: "" });
      setManagerDialog(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  const removeManagerMutation = useMutation({
    mutationFn: async (m: Manager) => {
      const { error } = await supabaseDb
        .from("food_restaurant_managers").delete().eq("id", m.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "delete", "food_restaurant_manager", m.id, {});
    },
    onSuccess: () => {
      toast.success("Manager removed");
      qc.invalidateQueries({ queryKey: ["food-restaurant-managers", restaurant.id] });
      setDeleteManager(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const openOwnerDialog = () => {
    setOwnerForm({ user_id: restaurant.admin_user_id ?? "" });
    setOwnerDialog(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black tracking-tight">Restaurant Staff</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owner and managers who can access this restaurant
        </p>
      </div>

      {/* ─── Owner section ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-orange-400" />
            <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground">
              Owner
            </h3>
          </div>
          <Button size="sm" variant="outline" className="gap-2 rounded-full" onClick={openOwnerDialog}>
            {owner ? "Change" : "Set Owner"}
          </Button>
        </div>

        {owner ? (
          <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/15 text-orange-400 font-bold">
              {(owner.display_name ?? owner.name ?? owner.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">
                {owner.display_name ?? owner.name ?? "Unnamed"}
              </p>
              <p className="text-sm text-muted-foreground truncate">{owner.email}</p>
            </div>
            <Badge className="rounded-full bg-orange-500/15 text-orange-400">Owner</Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No owner assigned. Set one to grant restaurant-level access.
          </p>
        )}
      </section>

      {/* ─── Managers section ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-orange-400" />
            <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground">
              Managers ({managers.length})
            </h3>
          </div>
          <Button size="sm" variant="outline" className="gap-2 rounded-full"
            onClick={() => setManagerDialog(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Add Manager
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : managers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No managers yet. Add team members who can manage this restaurant.
          </p>
        ) : (
          <div className="space-y-2">
            {managers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold">
                  {(m.user_name ?? m.user_email ?? "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{m.user_name ?? "Unnamed"}</p>
                  <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {m.user_email ?? m.user_id}
                  </p>
                </div>
                <Button size="sm" variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteManager(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Permissions info ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 text-sm">
        <p className="font-semibold text-orange-400 mb-1">About Permissions</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• <span className="text-foreground font-medium">Platform Admins</span> can manage all restaurants</li>
          <li>• <span className="text-foreground font-medium">Restaurant Owners</span> can only access their own restaurant</li>
          <li>• <span className="text-foreground font-medium">Managers</span> can edit menus and meal plans for their assigned restaurant</li>
        </ul>
      </section>

      {/* ─── Set Owner dialog ────────────────────────────────────────────── */}
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
                Pick a user from the platform. Choose “No owner” to remove the current owner.
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

      {/* ─── Add Manager dialog ──────────────────────────────────────────── */}
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
                Pick the platform user to grant manager access to this restaurant.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManagerDialog(false)}>Cancel</Button>
            <Button onClick={() => addManagerMutation.mutate()}
              disabled={!managerForm.user_name.trim() || !managerForm.user_email.trim() || addManagerMutation.isPending}>
              {addManagerMutation.isPending && <Spinner size="sm" className="mr-2" />}
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Remove manager confirmation ─────────────────────────────────── */}
      <AlertDialog open={!!deleteManager} onOpenChange={(o) => { if (!o) setDeleteManager(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove manager?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteManager?.user_name ?? deleteManager?.user_email}</strong> from
              this restaurant's managers? They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteManager && removeManagerMutation.mutate(deleteManager)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
