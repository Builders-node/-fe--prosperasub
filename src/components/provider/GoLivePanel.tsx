import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Eye, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { profileCompleteness } from "@/lib/providerProfile";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";

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
export function GoLivePanel({ provider, previewHref }: { provider: UniversalProviderRow; previewHref: string }) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const live = provider.status === "active" || provider.status === "approved";
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
      toast.success(next === "active" ? `${provider.name} is live` : `${provider.name} is hidden`);
      qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
      qc.invalidateQueries({ queryKey: ["admin-marketplace-providers"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not change the status"),
  });

  const profile = profileCompleteness(provider);
  const checks = [
    { label: "Profile filled in", done: profile.missing.length === 0, hint: profile.missing.map((m) => m.label).join(", ") },
    { label: "Photos", done: !!provider.banner_url || (provider.gallery_urls?.length ?? 0) > 0, hint: "A banner or a gallery photo" },
    { label: "At least one plan on sale", done: (plansQ.data ?? 0) > 0, hint: "Offerings → publish a plan" },
    { label: "Owner set", done: !!provider.admin_user_id, hint: "Team → owner (or keep it platform-owned)" },
  ];
  const ready = checks.every((c) => c.done);
  const missing = checks.filter((c) => !c.done);

  const dialog = (
    <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm === "active" ? `Put ${provider.name} live?` : `Hide ${provider.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === "active"
              ? (missing.length
                  ? `Still missing: ${missing.map((c) => c.label.toLowerCase()).join(", ")}. Customers will see it as it is.`
                  : "Customers will be able to find it and buy its plans.")
              : "Customers stop seeing it and can't buy. Existing subscriptions keep running."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirm === "inactive" ? "destructive" : "primary"}
            onClick={() => { if (confirm) setStatus.mutate(confirm); setConfirm(null); }}
          >
            {confirm === "active" ? "Go live" : "Hide"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (live) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-radius-lg bg-card p-4">
        <div className="min-w-0">
          <p className="text-title font-semibold text-foreground">Live</p>
          <p className="text-meta text-muted-foreground">Customers can find and buy from this business.</p>
        </div>
        <Button size="sm" variant="secondary" disabled={setStatus.isPending}
          onClick={() => setConfirm("inactive")}>
          Hide
        </Button>
        {dialog}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-radius-lg bg-card p-4">
      <div>
        <p className="text-title font-semibold text-foreground">
          {provider.status === "inactive" ? "Hidden" : "Draft"} — customers can't see it
        </p>
        <p className="text-meta text-muted-foreground">Fill it in, check the preview, then put it live.</p>
      </div>
      <ul className="space-y-2">
        {checks.map((c) => (
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
        <Button variant="secondary" className="gap-2" onClick={() => window.open(previewHref, "_blank")}>
          <Eye /> Preview
        </Button>
        <Button className="gap-2" disabled={setStatus.isPending}
          onClick={() => (ready ? setStatus.mutate("active") : setConfirm("active"))}>
          <Rocket /> Go live
        </Button>
      </div>
      {dialog}
    </section>
  );
}
