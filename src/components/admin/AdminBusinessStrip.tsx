import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Layers, ReceiptText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/patterns/StatusPill";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";

interface Row {
  id: string;
  status: string;
  archetype_key: string | null;
  category_key: string | null;
  admin_user_id: string | null;
  review_requested_at: string | null;
}

/**
 * What only the admin needs to know about a business, above the owner's
 * workspace: who owns it, where it is listed (and a way to change that),
 * and one tap to its orders, payouts and history.
 *
 * The workspace below is the owner's own screen; the admin used to see only
 * that, with no owner, no orders and no way to move a business filed under
 * the wrong service short of deleting it.
 */
export function AdminBusinessStrip({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { archetypes } = useServiceArchetypes(false);
  const [changing, setChanging] = useState(false);
  const [svc, setSvc] = useState("");
  const [cat, setCat] = useState("");

  const { data: row } = useQuery({
    queryKey: ["admin-business-strip", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers")
        .select("id, status, archetype_key, category_key, admin_user_id, review_requested_at")
        .eq("id", providerId).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  const { data: owner } = useQuery({
    queryKey: ["admin-business-owner", row?.admin_user_id],
    enabled: !!row?.admin_user_id,
    queryFn: async () => {
      const u = (await fetchUsersByIds([row!.admin_user_id])).get(row!.admin_user_id!);
      return u ? (u.display_name || u.name || u.email || null) : null;
    },
  });

  const { data: invite } = useQuery({
    queryKey: ["admin-owner-invites"],
    enabled: !!row && !row.admin_user_id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/owner-invites");
      if (error) return [];
      return (data ?? []) as Array<{ providerId: string; state: string; invitedEmail: string | null; openedAt: string | null }>;
    },
    select: (all) => all.find((i) => String(i.providerId) === providerId) ?? null,
  });

  const { data: orderCount } = useQuery({
    queryKey: ["admin-business-orders-count", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { count, error } = await supabaseDb.from("subscriptions_unified")
        .select("id", { count: "exact", head: true }).eq("provider_id", providerId);
      return error ? null : count ?? 0;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-service-categories-active"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("service_categories")
        .select("key, label, archetype_key").eq("is_active", true).order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; archetype_key: string }>;
    },
  });

  const move = useMutation({
    mutationFn: async () => {
      const patch = { archetype_key: svc, category_key: cat, updated_at: new Date().toISOString() };
      const { error } = await supabaseDb.from("providers").update(patch).eq("id", providerId);
      if (error) throw error;
      if (userData?.id) {
        await logAuditEvent(userData.id, "edit", "provider", providerId, {
          from: { archetype_key: row?.archetype_key, category_key: row?.category_key }, to: patch,
        });
      }
    },
    onSuccess: () => {
      toast.success("Moved. Customers now find it under the new service.");
      setChanging(false);
      qc.invalidateQueries({ queryKey: ["admin-business-strip", providerId] });
      qc.invalidateQueries({ queryKey: ["marketplace-providers"] });
      qc.invalidateQueries({ queryKey: ["universal-provider", providerId] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not move it"),
  });

  if (!row) return null;
  const arche = archetypes.find((a) => a.key === row.archetype_key);
  const category = categories.find((c) => c.key === row.category_key);
  const live = row.status === "active" || row.status === "approved";
  const ownerText = row.admin_user_id
    ? owner ?? "Has an owner"
    : !invite || invite.state === "revoked" ? "No owner yet"
    : invite.state === "expired" ? "Invite expired"
    : invite.state === "claimed" ? "Claimed"
    : invite.openedAt ? `Invite opened${invite.invitedEmail ? ` · ${invite.invitedEmail}` : ""}`
    : `Invite sent${invite.invitedEmail ? ` · ${invite.invitedEmail}` : ""}`;
  const scoped = categories.filter((c) => c.archetype_key === svc);

  const openChange = () => {
    setSvc(row.archetype_key ?? "");
    setCat(row.category_key ?? "");
    setChanging(true);
  };

  return (
    <section className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-radius-lg bg-card px-4 py-3 text-meta">
      <StatusPill status={live ? "active" : row.status} />
      {!live && row.review_requested_at && <span className="font-semibold text-primary">Owner asked for review</span>}
      <span className="text-muted-foreground">Owner <span className="font-semibold text-foreground">{ownerText}</span></span>
      <span className="text-muted-foreground">
        Listed in <span className="font-semibold text-foreground">{arche?.label ?? "Unassigned"}{category ? ` · ${category.label}` : ""}</span>
        <button type="button" onClick={openChange} className="ml-2 font-semibold text-primary hover:underline">Change…</button>
      </span>
      <span className="flex flex-1 flex-wrap justify-end gap-1">
        <Button asChild size="sm" variant="ghost">
          <Link to={`/admin/marketplace/subscriptions?business=${encodeURIComponent(providerId)}`}>
            <ReceiptText className="h-4 w-4" /> Orders{typeof orderCount === "number" ? ` ${orderCount}` : ""}
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/payments?tab=payouts"><Wallet className="h-4 w-4" /> Payouts</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to={`/admin/audit-logs?q=${encodeURIComponent(providerId)}`}><History className="h-4 w-4" /> History</Link>
        </Button>
      </span>

      <AlertDialog open={changing} onOpenChange={(o) => { if (!o && !move.isPending) setChanging(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Where is it listed</AlertDialogTitle>
            <AlertDialogDescription>
              Customers find the business under this service and category. Its plans and orders stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Service</Label>
              <Select value={svc || undefined} onValueChange={(v) => { setSvc(v); setCat(categories.find((c) => c.archetype_key === v)?.key ?? ""); }}>
                <SelectTrigger><SelectValue placeholder="Pick a service" /></SelectTrigger>
                <SelectContent>
                  {archetypes.map((a) => (
                    <SelectItem key={a.key} value={a.key} disabled={!!a.source_service_key && a.key !== row.archetype_key}>
                      {a.label}{a.source_service_key && a.key !== row.archetype_key ? " · has its own page" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={cat || undefined} onValueChange={setCat} disabled={!svc || scoped.length === 0}>
                <SelectTrigger><SelectValue placeholder={svc && scoped.length === 0 ? "This service has no categories" : "Pick a category"} /></SelectTrigger>
                <SelectContent>
                  {scoped.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={move.isPending}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={!svc || !cat || move.isPending || (svc === row.archetype_key && cat === row.category_key)}
              onClick={(e) => { e.preventDefault(); move.mutate(); }}
            >
              {move.isPending ? "Moving…" : "Move it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
