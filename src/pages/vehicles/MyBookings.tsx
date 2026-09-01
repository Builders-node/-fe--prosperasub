import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Car, ChevronRight } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatUSD } from "@/lib/pricing";
import { Button } from "@/components/ui/button";

const TONE: Record<string, string> = {
  confirmed: "text-emerald-500", paid: "text-emerald-500", active: "text-emerald-500", completed: "text-muted-foreground",
  pending: "text-amber-500", cancelled: "text-red-500",
};

export default function MyBookings() {
  const { userData } = useAuth();
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-rental-bookings", userData?.id],
    enabled: !!userData?.id,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*, rental_vehicles(name, image_url)")
        .eq("user_id", userData!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppContainer className="py-6">
      <h1 className="mb-5 text-[22px] font-black tracking-tight text-foreground">My bookings</h1>
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Car className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No bookings yet</p>
          <Link to="/" className="mt-3 text-sm font-semibold text-primary">Browse the fleet</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b: any) => (
            <Link
              key={b.id}
              to={`/booking/${b.id}`}
              className="flex items-center gap-4 rounded-radius-md bg-card p-3 shadow-figma transition-colors hover:bg-muted/30">
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-radius-sm bg-muted">
                {b.rental_vehicles?.image_url && <img src={b.rental_vehicles.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-foreground">{b.rental_vehicles?.name ?? "Vehicle"}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(b.start_date + "T00:00:00"), "MMM d")} → {format(new Date(b.end_date + "T00:00:00"), "MMM d")} · {b.rental_days} day{b.rental_days > 1 ? "s" : ""}
                </p>
                <p className={`text-xs font-bold uppercase tracking-wide ${TONE[b.status] ?? "text-muted-foreground"}`}>{b.status}</p>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-[15px] font-black tabular-nums text-foreground">{formatUSD(b.total_cents)}</p>
                  {/* The one row that needs an instruction rather than a label:
                      an unpaid booking is holding a car and can still be paid. */}
                  {b.payment_status !== "paid" && b.status !== "cancelled" && (
                    <Button size="sm" className="mt-1">Complete payment</Button>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppContainer>
  );
}
