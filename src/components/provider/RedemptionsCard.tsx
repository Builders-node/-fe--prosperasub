import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { accountApi } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { WorkspaceCard } from "@/components/provider/WorkspaceUI";
import { todayHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface Redemption {
  id: string; customer: string; plan: string | null; item: string;
  method: "customer" | "pin"; at: string; voided: boolean;
}

const timeHN = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Tegucigalpa" });

/**
 * "Collected at the till" for one day — what customers took with the till QR
 * (Edge routes/redeem.ts). Refreshes itself while it shows today, so the
 * counter sees a press within seconds. A mistaken one can be undone.
 */
export function RedemptionsCard({ providerId, day }: { providerId: string; day: string }) {
  const qc = useQueryClient();
  const isToday = day === todayHN();
  const key = ["provider-redemptions", providerId, day];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    refetchInterval: isToday ? 15_000 : false,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/redemptions?day=${day}`);
      if (error) throw error;
      return (data as { redemptions?: Redemption[] } | null)?.redemptions ?? [];
    },
  });
  const undo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await accountApi(`/account/providers/${providerId}/redemptions/${id}/void`, { method: "POST" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Undone — it can be collected again"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not undo it"),
  });

  const rows = data ?? [];
  const live = rows.filter((r) => !r.voided).length;
  return (
    <WorkspaceCard className="space-y-3">
      <div>
        <h2 className="text-heading font-semibold text-foreground">
          Collected at the till{live > 0 ? ` · ${live}` : ""}
        </h2>
        <p className="mt-1 text-body text-muted-foreground">
          Customers who scanned your till QR and pressed Get{isToday ? " today" : ""}.
        </p>
      </div>
      {isLoading ? (
        <div className="h-12 animate-pulse rounded-radius-md bg-inset" />
      ) : error ? (
        <p className="text-body text-muted-foreground">{error instanceof Error ? error.message : "Could not load the list."}</p>
      ) : rows.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Nothing yet. Print the till QR from Overview and put it at the counter.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={cn("flex items-center gap-3 rounded-radius-md bg-inset p-3", r.voided && "opacity-50")}>
              <span className="w-16 shrink-0 text-body tabular-nums text-muted-foreground">{timeHN(r.at)}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-body font-semibold text-foreground", r.voided && "line-through")}>
                  {r.customer} · {r.item}
                </span>
                <span className="block truncate text-meta text-muted-foreground">
                  {r.plan ?? "Subscription"}{r.voided ? " · undone" : ""}
                </span>
              </span>
              {!r.voided && (
                <Button size="sm" variant="ghost" className="shrink-0 gap-1 text-muted-foreground"
                  disabled={undo.isPending} onClick={() => undo.mutate(r.id)} aria-label={`Undo ${r.item} for ${r.customer}`}>
                  <Undo2 className="h-4 w-4" /> Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </WorkspaceCard>
  );
}
