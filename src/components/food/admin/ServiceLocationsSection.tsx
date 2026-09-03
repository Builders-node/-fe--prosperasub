import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MapPin } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useResidences } from "@/hooks/useResidences";
import { logAuditEvent } from "@/lib/auditLog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

interface ProviderResidence { id: string; residence_id: string; }

/**
 * Which residences a restaurant delivers to.
 *
 * Lifted out of the old RestaurantInfoTab so the food workspace could move to
 * the one universal Overview tab without losing the only genuinely
 * food-specific thing that tab had. The link table is keyed by the LEGACY
 * food_providers id, so this takes that id — not the universal one.
 */
export function ServiceLocationsSection({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { data: residences = [], isLoading: resLoading } = useResidences();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: ["food-provider-residences", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_provider_residences")
        .select("id, residence_id")
        .eq("provider_id", providerId);
      if (error) throw error;
      return (data ?? []) as ProviderResidence[];
    },
  });

  const linkByResidence: Record<string, string> = {};
  links.forEach((l) => { linkByResidence[l.residence_id] = l.id; });

  const toggle = useMutation({
    mutationFn: async (residenceId: string) => {
      setPendingId(residenceId);
      const existingLinkId = linkByResidence[residenceId];
      if (existingLinkId) {
        const { error } = await supabaseDb
          .from("food_provider_residences").delete().eq("id", existingLinkId);
        if (error) throw error;
        await logAuditEvent(userData!.id, "delete", "food_provider_residence", existingLinkId, { provider_id: providerId, residence_id: residenceId });
      } else {
        const { data, error } = await supabaseDb
          .from("food_provider_residences")
          .insert({ provider_id: providerId, residence_id: residenceId })
          .select("id").single();
        if (error) throw error;
        await logAuditEvent(userData!.id, "create", "food_provider_residence", data.id, { provider_id: providerId, residence_id: residenceId });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["food-provider-residences", providerId] }),
    onError: (e) => toast.error(String(e)),
    onSettled: () => setPendingId(null),
  });

  return (
    <section className="rounded-radius-md bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Service locations
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pick the residences this restaurant delivers to. Customers in other locations won't see it.
          </p>
        </div>
      </div>
      <div className="mt-4">
        {resLoading || linksLoading ? (
          <div className="flex gap-2">
            {[1, 2].map((i) => <div key={i} className="h-9 w-32 animate-pulse rounded-full bg-muted" />)}
          </div>
        ) : residences.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No residences configured yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {residences.map((r) => {
              const active = !!linkByResidence[r.id];
              const busy = pendingId === r.id && toggle.isPending;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={busy}
                  onClick={() => toggle.mutate(r.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    active
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {busy ? <Spinner size="xs" />
                    : active ? <Check className="h-3.5 w-3.5 text-primary" />
                    : <MapPin className="h-3.5 w-3.5" />}
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
