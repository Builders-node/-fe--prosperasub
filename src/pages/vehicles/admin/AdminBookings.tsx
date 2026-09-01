import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppContainer } from "@/components/layout/AppContainer";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";

const TONE: Record<string, string> = {
  confirmed: "text-emerald-500", paid: "text-emerald-500", active: "text-emerald-500",
  completed: "text-muted-foreground", pending: "text-amber-500", cancelled: "text-red-500",
};

export default function AdminBookings() {
  const qc = useQueryClient();
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-rental-bookings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*, rental_vehicles(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = async (id: string, status: string) => {
    const patch: Record<string, unknown> = { status };
    if (status === "paid" || status === "confirmed") patch.payment_status = "paid";
    const { error } = await supabaseDb.from("rental_bookings").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-rental-bookings"] });
  };

  return (
    <AppContainer className="py-6">
      <h1 className="mb-5 text-[22px] font-black tracking-tight text-foreground">Bookings</h1>
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : bookings.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">No bookings yet.</p>
      ) : (
        <div className="space-y-2">
          {bookings.map((b: any) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-radius-md bg-card p-3 shadow-figma">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-foreground">{b.rental_vehicles?.name ?? "Vehicle"}</p>
                <p className="text-xs text-muted-foreground">
                  {b.customer_name ?? "—"}{b.customer_whatsapp ? ` · ${b.customer_whatsapp}` : ""} · {format(new Date(b.start_date + "T00:00:00"), "MMM d")} → {format(new Date(b.end_date + "T00:00:00"), "MMM d")}
                </p>
                <p className={`text-[11px] font-bold uppercase tracking-wide ${TONE[b.status] ?? "text-muted-foreground"}`}>
                  {b.status} · {b.payment_method ?? "—"}
                </p>
              </div>
              <p className="text-[15px] font-black text-foreground">{formatUSD(b.total_cents)}</p>
              <div className="flex gap-1.5">
                {b.payment_status !== "paid" && <Button size="sm" variant="secondary" onClick={() => setStatus(b.id, "paid")}>Mark paid</Button>}
                {b.status !== "cancelled" && <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setStatus(b.id, "cancelled")}>Cancel</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppContainer>
  );
}
