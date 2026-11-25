import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Eye, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { accountApi, adminApi, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { logAuditEvent } from "@/lib/auditLog";
import { profileCompleteness } from "@/lib/providerProfile";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { OwnerInviteButton } from "@/components/provider/OwnerInviteButton";
import { ProviderSetupButton } from "@/components/provider/ProviderSetupButton";
import { tr, trx } from "@/lib/tr";

/**
 * The admin's way from "draft" to "live", on the business itself.
 *
 * A business used to be created live, and going live or hidden was a row
 * menu on a list screen away from the business — so nobody could see, at the
 * moment of flipping it, whether it had a single plan to sell. This puts the
 * checklist and the switch in one card at the top of the workspace, for an
 * admin only. Nothing here blocks: a business can go live incomplete, but the
 * admin sees what is missing when they press the button.
 */
export function GoLivePanel({ provider, previewHref, ownerView = false }: {
  provider: UniversalProviderRow;
  previewHref: string;
  /** The owner's version: the same checklist, read-only, ending in "Ready for review". */
  ownerView?: boolean;
}) {
  const qc = useQueryClient();
  const { userData, isSuperAdmin } = useAuth();
  const live = provider.status === "active" || provider.status === "approved";
  const { archetypes } = useServiceArchetypes(false);
  const service = archetypes.find((a) => a.key === provider.archetype_key) ?? null;
  const [confirm, setConfirm] = useState<"active" | "inactive" | null>(null);

  const plansQ = useQuery({
    queryKey: ["golive-plans", provider.id],
    queryFn: async () => {
      const { count, error } = await supabaseDb
        .from("provider_plans")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", provider.id)
        .eq("status", "active");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (next: "active" | "inactive") => {
      const { error } = await supabaseDb.from("providers")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", provider.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", "provider", provider.id, { status: next });
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === "active" ? tr("{name} is live", { name: provider.name }) : tr("{name} is hidden", { name: provider.name }));
      // The owner and team hear it — they used to find out by noticing.
      if (next === "active") void adminApi(`/admin/providers/${provider.id}/went-live`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
      qc.invalidateQueries({ queryKey: ["admin-marketplace-providers"] });
      qc.invalidateQueries({ queryKey: ["marketplace-providers"] });
    },
    onError: (e: Error) => toast.error(e.message || tr("Could not change the status")),
  });

  const requestedAt = (provider as { review_requested_at?: string | null }).review_requested_at ?? null;
  const [requested, setRequested] = useState(false);
  const requestReview = useMutation({
    mutationFn: async () => {
      const { error } = await accountApi(`/account/providers/${provider.id}/review-request`, { method: "POST" });
      if (error) throw error;
    },
    onSuccess: () => {
      setRequested(true);
      toast.success(tr("Sent — EverySub will check it and put it live"));
      qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
    },
    onError: (e: Error) => toast.error(e.message || tr("Could not send")),
  });

  const profile = profileCompleteness(provider);
  const checks = [
    { label: tr("Profile filled in"), done: profile.missing.length === 0, hint: profile.missing.map((m) => m.label).join(", ") },
    { label: tr("Photos"), done: !!provider.banner_url || (provider.gallery_urls?.length ?? 0) > 0, hint: tr("A banner or a gallery photo") },
    { label: tr("At least one plan on sale"), done: (plansQ.data ?? 0) > 0, hint: tr("Offerings → publish a plan") },
    { label: tr("Owner set"), done: !!provider.admin_user_id, hint: tr("Send the owner an invite link (or keep it platform-owned)"), owner: true },
  ];
  const ready = checks.every((c) => c.done);
  const missing = checks.filter((c) => !c.done);

  const dialog = (
    <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm === "active" ? tr("Put {name} live?", { name: provider.name }) : tr("Hide {name}?", { name: provider.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === "active"
              ? (missing.length
                  ? tr("Still missing: {join}. Customers will see it as it is.", { join: missing.map((c) => c.label.toLowerCase()).join(", ") })
                  : tr("Customers will be able to find it and buy its plans."))
              : tr("Customers stop seeing it and can't buy. Existing subscriptions keep running.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant={confirm === "inactive" ? "destructive" : "primary"}
            onClick={() => { if (confirm) setStatus.mutate(confirm); setConfirm(null); }}
          >
            {confirm === "active" ? tr("Go live") : tr("Hide")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (ownerView) {
    if (live) return null;
    const waiting = requested || !!requestedAt;
    return (
      <section className="space-y-4 rounded-radius-lg bg-card p-4">
        <div>
          <p className="text-title font-semibold text-foreground">
            {waiting ? tr("Waiting for review") : tr("Not live yet — customers can't see it")}
          </p>
          <p className="text-meta text-muted-foreground">
            {waiting
              ? tr("EverySub is checking your business and will put it live. You can keep editing meanwhile.")
              : tr("Finish what is below, check how your page looks, then tell us you're ready.")}
          </p>
        </div>
        <ul className="space-y-2">
          {checks.filter((c) => c.label !== "Owner set").map((c) => (
            <li key={c.label} className="flex items-start gap-2.5">
              {c.done
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />}
              <span className="min-w-0">
                <span className="block text-body text-foreground">{c.label}</span>
                {!c.done && c.hint && <span className="block text-meta text-muted-foreground">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="gap-2" onClick={() => window.open(previewHref, "_blank")}>
            <Eye />{" "}{tr("See my page")}</Button>
          {!waiting && (
            <Button size="sm" className="gap-2" loading={requestReview.isPending} onClick={() => requestReview.mutate()}>
              <Rocket />{" "}{tr("Ready for review")}</Button>
          )}
        </div>
      </section>
    );
  }

  if (live) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-radius-lg bg-card p-4">
        <div className="min-w-0">
          {/* Live, but its service is switched off: the business is ready and
              still invisible — its page says "No such service". This used to
              read "Customers can find and buy", which was untrue. */}
          {service && !service.is_active ? (
            <>
              <p className="text-title font-semibold text-foreground">{tr("Live, but its service is off")}</p>
              <p className="text-meta text-attention">{trx("{label} is switched off, so customers can't see this business yet.", { label: service.label })}{" "}{isSuperAdmin && (
                  <a href={`/admin/marketplace?service=${service.key}`} className="font-semibold underline underline-offset-2">{tr("Turn the service on")}</a>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-title font-semibold text-foreground">{tr("Live")}</p>
              <p className="text-meta text-muted-foreground">{tr("Customers can find and buy from this business.")}{!provider.admin_user_id && tr(" No owner yet — it's platform-owned.")}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ProviderSetupButton provider={provider} />
          {!provider.admin_user_id && <OwnerInviteButton provider={provider} />}
          <Button size="sm" variant="secondary" disabled={setStatus.isPending}
            onClick={() => setConfirm("inactive")}>{tr("Hide")}</Button>
        </div>
        {dialog}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-radius-lg bg-card p-4">
      <div>
        <p className="text-title font-semibold text-foreground">
          {provider.status === "inactive" ? tr("Hidden") : tr("Draft")}{" "}{tr("— customers can't see it")}</p>
        <p className="text-meta text-muted-foreground">{tr("Fill it in, check the preview, then put it live.")}</p>
      </div>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2.5">
            {c.done
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />}
            <span className="min-w-0 flex-1">
              <span className="block text-body text-foreground">{c.label}</span>
              {!c.done && c.hint && <span className="block text-meta text-muted-foreground">{c.hint}</span>}
            </span>
            {"owner" in c && <OwnerInviteButton provider={provider} />}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <ProviderSetupButton provider={provider} />
        <Button size="sm" variant="secondary" className="gap-2" onClick={() => window.open(previewHref, "_blank")}>
          <Eye />{" "}{tr("Preview")}</Button>
        <Button size="sm" className="gap-2" disabled={setStatus.isPending}
          onClick={() => (ready ? setStatus.mutate("active") : setConfirm("active"))}>
          <Rocket />{" "}{tr("Go live")}</Button>
      </div>
      {dialog}
    </section>
  );
}
