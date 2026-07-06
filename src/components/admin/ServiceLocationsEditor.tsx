import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Check } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { useResidences } from "@/hooks/useResidences";
import { toast } from "sonner";

interface Props {
  /** Join table name, e.g. "rental_vehicle_residences". */
  table: string;
  /** Column on the join table holding the item id, e.g. "vehicle_id". */
  itemColumn: string;
  /** The id of the item being edited. */
  itemId: string;
  /** Optional heading + helper copy. */
  title?: string;
  description?: string;
}

/**
 * Generic location (residence) picker for any service item. Toggling a chip
 * inserts/deletes a row in the given join table. Empty selection = available
 * everywhere. Used by food / cars / cleaning admin edit screens.
 */
export function ServiceLocationsEditor({
  table, itemColumn, itemId,
  title = "Service locations",
  description = "Pick where this is available. Leave empty to offer it everywhere.",
}: Props) {
  const qc = useQueryClient();
  const { data: residences = [], isLoading: resLoading } = useResidences();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const key = ["service-locations", table, itemId] as const;
  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: key,
    enabled: !!itemId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from(table).select(`id, residence_id`).eq(itemColumn, itemId);
      if (error) throw error;
      return (data ?? []) as { id: string; residence_id: string }[];
    },
  });

  const linkByResidence: Record<string, string> = {};
  links.forEach((l) => { linkByResidence[l.residence_id] = l.id; });

  const toggle = useMutation({
    mutationFn: async (residenceId: string) => {
      setPendingId(residenceId);
      const existing = linkByResidence[residenceId];
      if (existing) {
        const { error } = await supabaseDb.from(table).delete().eq("id", existing);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from(table).insert({ [itemColumn]: itemId, residence_id: residenceId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e?.message || "Could not update"),
    onSettled: () => setPendingId(null),
  });

  if (resLoading) return null;
  if (residences.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{description}</p>
      {linksLoading ? (
        <div className="flex gap-2">{[1, 2].map((i) => <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-muted" />)}</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {residences.map((r) => {
              const active = !!linkByResidence[r.id];
              const busy = pendingId === r.id && toggle.isPending;
              return (
                <button key={r.id} type="button" disabled={busy}
                  onClick={() => toggle.mutate(r.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    active ? "border-primary bg-primary/15 text-foreground" : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}>
                  {busy ? <Spinner size="xs" /> : active ? <Check className="h-3.5 w-3.5 text-primary" /> : <MapPin className="h-3.5 w-3.5" />}
                  {r.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {links.length === 0 ? "Available everywhere" : `Limited to ${links.length} location${links.length > 1 ? "s" : ""}`}
          </p>
        </>
      )}
    </div>
  );
}
