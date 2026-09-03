import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusPill } from "@/components/patterns/StatusPill";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { WorkspaceCard, WorkspaceEmpty, WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { OfferEditor, createDraftPlan } from "@/components/provider/plans/OfferEditor";

/**
 * What this business sells: a list, and one editor behind it.
 *
 * Offerings used to show a plan list AND a permanently-open editor under it,
 * each able to change the same plan. A provider with one plan met their plan
 * twice on one screen — named in the list, then named again in a form headed
 * "Sizes and prices" — and had to work out which of the two owned the price.
 *
 * There is one now: press a plan, and everything about it opens — its name,
 * how it is sold, what it includes, the choices the customer makes and the
 * price of each. Adding a plan opens the same editor on a fresh row, so a
 * plan is created exactly the way it is later edited.
 */

interface OfferRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  period: string | null;
  status: string;
  gallery_urls: string[] | null;
}

export function PlansTab({ providerId, sourceKey }: {
  /** Universal `providers.id` — plans live on `provider_plans` for every service. */
  providerId: string;
  /** Legacy service key, or "" for a universal-only provider. */
  sourceKey: string;
}) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const KEY = ["plans-tab", providerId] as const;
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OfferRow | null>(null);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id, name, description, price_cents, period, status, gallery_urls")
        .eq("provider_id", providerId)
        // Offers only. A variant is a combination INSIDE one of these and is
        // reached by opening its plan, never listed as a plan of its own.
        .is("parent_plan_id", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OfferRow[];
    },
  });

  const add = useMutation({
    mutationFn: () => createDraftPlan({ providerId, sourceKey, sortOrder: offers.length }),
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: KEY });
      await qc.invalidateQueries({ queryKey: ["offer-editor", providerId] });
      setEditing(id);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't add the plan"),
  });

  const del = useMutation({
    mutationFn: async (offer: OfferRow) => {
      // The combinations go with it: they are this product, not products of
      // their own, and leaving them behind would put unreachable rows in
      // front of anything that lists plans by provider.
      const { error: kids } = await supabaseDb.from("provider_plans").delete().eq("parent_plan_id", offer.id);
      if (kids) throw kids;
      const { error } = await supabaseDb.from("provider_plans").delete().eq("id", offer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["offer-editor", providerId] });
      setDeleteTarget(null);
      // The sheet was open on the plan that no longer exists.
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete"),
  });

  return (
    <>
      <WorkspaceSection
        title="Plans"
        subtitle="What customers can buy. Open one to set its choices and prices."
        action={
          <Button className="shrink-0 gap-2 rounded-full" disabled={add.isPending} onClick={() => add.mutate()}>
            <Plus className="h-4 w-4" /> {add.isPending ? "Adding…" : "New plan"}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-1">
          {[0, 1].map((i) => <div key={i} className="h-[120px] animate-pulse rounded-radius-lg bg-card" />)}
        </div>
      ) : offers.length === 0 ? (
        <WorkspaceCard>
          <WorkspaceEmpty>
            Nothing on sale yet. A plan is one product: a name, whatever the customer gets to
            choose, and a price for each way of choosing it.
          </WorkspaceEmpty>
        </WorkspaceCard>
      ) : (
        <div className="space-y-1">
          {offers.map((o) => (
            /* The same card the customer meets on the storefront — the picture,
               the name, what it costs — with the two things only the owner can
               do on the end of it. */
            <article key={o.id} className="flex items-stretch gap-2 rounded-radius-lg bg-card p-2 tracking-[-0.02em]">
              <div className="h-[104px] w-[104px] shrink-0 overflow-hidden rounded-[8px] bg-inset">
                {o.gallery_urls?.[0] && (
                  <img src={o.gallery_urls[0]} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col py-2 pr-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 text-[16px] font-semibold leading-[19px] text-foreground">
                    {o.name}
                  </h3>
                  <Button
                    size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-full px-3"
                    onClick={() => setEditing(o.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
                {o.description && (
                  <p className="mt-1 line-clamp-2 text-[14px] leading-[18px] text-muted-foreground">
                    {o.description}
                  </p>
                )}
                {/* Price where the customer's card carries it — bottom right —
                    with anything the owner alone needs to know beside it. */}
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                  {o.status !== "active"
                    ? <StatusPill status={o.status} />
                    : <span />}
                  <span className="text-[16px] font-semibold leading-[19px] tabular-nums text-foreground">
                    {formatUSD(o.price_cents)}
                    {o.period && (
                      <span className="ml-1 text-[14px] font-normal text-muted-foreground">
                        / {o.period.replace("_", " ")}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Everything about one plan, in a sheet over the list — from the side
          on a desktop, up from the bottom on a phone. */}
      <Sheet open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile
            ? "h-[92vh] p-0"
            : "w-full max-w-xl p-0 sm:max-w-xl"}
        >
          <SheetHeader className="px-4 py-4">
            <SheetTitle className="text-[20px] font-semibold leading-[26px]">
              {offers.find((o) => o.id === editing)?.name || "Plan"}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 pb-8 pt-1">
            {editing && (
              <OfferEditor
                providerId={providerId}
                sourceKey={sourceKey}
                planId={editing}
                onSaved={() => { qc.invalidateQueries({ queryKey: KEY }); setEditing(null); }}
                onDelete={() => {
                  const row = offers.find((o) => o.id === editing);
                  if (row) setDeleteTarget(row);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  This deletes <strong className="text-foreground">{deleteTarget.name}</strong> and
                  every price combination inside it. Any customer subscription linked to it loses
                  its plan reference. To stop selling it without touching what people already
                  bought, open it and take it off sale instead.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && del.mutate(deleteTarget)}
            >
              {del.isPending ? <Spinner size="sm" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
