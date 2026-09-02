import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Car, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { QueryError } from "@/components/QueryError";
import { VehicleEditDialog } from "@/components/admin/VehicleEditDialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import type { RentalVehicle } from "@/types/carRental";

/**
 * A rental business's own cars.
 *
 * Every other vertical sells through `provider_plans`, and a car does not fit
 * that shape — availability is per-unit and continuous, price is a function of
 * duration, and the thing being booked is one physical object that exactly one
 * person can hold at a time. So the fleet keeps its own table and appears here
 * as its own tab, while the business itself is an ordinary `providers` row like
 * a restaurant or a cleaning company: same workspace, same Money, same Team.
 */
export function VehicleFleetTab({ providerId, canManage }: {
  providerId: string;
  /** Only the owner may add or change a car; the team can see the fleet. */
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RentalVehicle | "new" | null>(null);

  const fleetQ = useQuery({
    queryKey: ["provider-fleet", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .eq("provider_id", providerId)
        .neq("status", "archived")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentalVehicle[];
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["provider-fleet", providerId] });
    // The storefront and the admin list read the same cars under other keys.
    void qc.invalidateQueries({ queryKey: ["rental-vehicles"] });
    void qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
  };

  const toggleListed = async (v: RentalVehicle) => {
    const next = v.status === "public" ? "private" : "public";
    const { error } = await supabaseDb.from("rental_vehicles").update({ status: next }).eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next === "public" ? "Car is listed" : "Car is hidden");
    refresh();
  };

  const cars = fleetQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-semibold tracking-[-0.36px] text-foreground">Fleet</h2>
        {canManage && (
          <Button className="gap-2" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add vehicle
          </Button>
        )}
      </div>

      {fleetQ.isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : fleetQ.isError ? (
        <QueryError title="Couldn't load the fleet" error={fleetQ.error} onRetry={() => void fleetQ.refetch()} />
      ) : cars.length === 0 ? (
        <div className="flex flex-col items-center rounded-radius-md bg-card py-14 text-center">
          <Car className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold text-foreground">No cars yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage ? "Add one and it appears in the storefront." : "The owner has not added a car yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cars.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-radius-md bg-card p-3">
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-[8px] bg-muted">
                {v.image_url
                  ? <img src={v.image_url} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center"><Car className="h-6 w-6 text-muted-foreground/40" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{v.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[v.brand, v.model, v.year].filter(Boolean).join(" · ")} · {v.seats} seats
                </p>
              </div>
              <p className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
                {formatUSD(v.daily_price_cents)}
                <span className="text-xs font-normal text-muted-foreground">/day</span>
              </p>
              {canManage && (
                <>
                  <Button
                    variant={v.status === "public" ? "ghost" : "secondary"}
                    size="sm"
                    className="shrink-0"
                    onClick={() => void toggleListed(v)}
                  >
                    {v.status === "public" ? "Listed" : "Hidden"}
                  </Button>
                  <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" onClick={() => setEditing(v)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <VehicleEditDialog
        vehicle={editing}
        lockedProviderId={providerId}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    </div>
  );
}
