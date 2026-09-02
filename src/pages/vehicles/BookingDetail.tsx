import { useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Car, CheckCircle2, Clock, XCircle } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PaymentMethodTiles } from "@/components/payment/PaymentMethodTiles";
import { type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { attachPaymentReference } from "@/lib/payments/pendingReference";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { carPath } from "@/pages/vehicles/routes";

/**
 * One rental, in full — and the two things a customer could not do before.
 *
 * A booking whose payment never completed used to be a dead end: the list
 * showed it as "pending" and offered no way back to the invoice, while the car
 * stayed held for a day. And nobody could call off a booking they had not paid
 * for; they had to write to someone. Both live here, next to the breakdown of
 * what the rental actually costs.
 */

const dayText = (iso?: string | null) => (iso ? format(new Date(`${iso}T00:00:00`), "EEE, MMM d") : "—");

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { enabled: methods, addSurchargeCents } = usePaymentMethods();
  const { convertToSats } = useBtcPrice();

  const [method, setMethod] = useState<PaymentMethod>("lightning");
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const payingIdRef = useRef<string | null>(null);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["rental-booking", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*, rental_vehicles(name, image_url, brand, model, year)")
        .eq("id", id!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const isPaid = booking?.payment_status === "paid";
  const isCancelled = booking?.status === "cancelled";
  // The base is what was agreed at booking time; the fee depends on how they
  // choose to pay NOW, so it is recomputed rather than read off the old row.
  const baseTotal = Number(booking?.total_cents) || 0;
  const effectiveTotal = useMemo(() => addSurchargeCents(baseTotal, method), [addSurchargeCents, baseTotal, method]);
  const estimatedSats = convertToSats(centsToDollars(effectiveTotal));

  const markPaid = async (ref: string, m: string) => {
    if (!payingIdRef.current) return;
    await supabaseDb.from("rental_bookings")
      .update({
        status: "confirmed", payment_status: "paid", payment_method: m, payment_reference: ref,
        surcharge_cents: Math.max(0, effectiveTotal - baseTotal),
      })
      .eq("id", payingIdRef.current);
    await qc.invalidateQueries({ queryKey: ["rental-booking", id] });
    await qc.invalidateQueries({ queryKey: ["my-rental-bookings"] });
    toast.success("Payment confirmed — your booking is set.");
  };

  const inv = useInvoicePayment({
    onPaid: (ref, m) => markPaid(ref, m),
    onInvoiceReady: (ref, m) => {
      if (payingIdRef.current) attachPaymentReference(supabaseDb, "rental_bookings", payingIdRef.current, ref, m);
    },
  });

  const startPayment = () => {
    if (!booking) return;
    payingIdRef.current = booking.id;
    setPaying(true);
    if (method === "lightning" || method === "onchain") {
      inv.start({
        method,
        amountCents: effectiveTotal,
        amountSats: estimatedSats,
        description: `${booking.rental_vehicles?.name ?? "Car"} · ${booking.start_date}→${booking.end_date}`,
        meta: {
          service_name: "EverySub Cars — rental",
          plan_name: booking.rental_vehicles?.name,
          client_name: booking.customer_name || userData?.name || undefined,
          client_email: userData?.email || undefined,
          client_phone: booking.customer_whatsapp || undefined,
          duration: `${booking.rental_days} day${booking.rental_days > 1 ? "s" : ""}`,
          selected_date_time: `${booking.start_date} → ${booking.end_date}`,
          booking_id: booking.id,
        },
      });
    }
  };

  const cancelBooking = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      const { error } = await supabaseDb.from("rental_bookings")
        .update({ status: "cancelled", payment_status: "failed" })
        .eq("id", booking.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["rental-booking", id] });
      await qc.invalidateQueries({ queryKey: ["my-rental-bookings"] });
      // Releasing the dates is the point — the picker reads the same rows.
      await qc.invalidateQueries({ queryKey: ["vehicle-booked-ranges"] });
      toast.success("Booking cancelled. The car is free for those dates again.");
    } catch (e) {
      toast.error((e as Error).message || "Could not cancel the booking");
    } finally {
      setCancelling(false);
    }
  };

  if (isLoading) return <AppContainer className="flex justify-center py-24"><Spinner /></AppContainer>;
  if (!booking) return (
    <AppContainer className="py-24 text-center">
      <p className="text-[16px] font-semibold text-foreground">Booking not found.</p>
      <Button variant="secondary" className="mt-3" onClick={() => navigate(carPath("my-bookings"))}>My bookings</Button>
    </AppContainer>
  );

  const v = booking.rental_vehicles;
  const extras: Array<{ name?: string; cents?: number }> = Array.isArray(booking.extras) ? booking.extras : [];

  return (
    <AppContainer className="py-6">
      <button onClick={() => navigate(carPath("my-bookings"))} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My bookings
      </button>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* What was booked */}
          <div className="overflow-hidden rounded-radius-md bg-card shadow-figma">
            <div className="aspect-[16/7] w-full bg-inset">
              {v?.image_url
                ? <img src={v.image_url} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center"><Car className="h-12 w-12 text-muted-foreground/40" /></div>}
            </div>
            <div className="p-5">
              <StatusLine status={booking.status} paid={isPaid} />
              <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.4px] text-foreground">{v?.name ?? "Car rental"}</h1>
              <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
                {dayText(booking.start_date)} → {dayText(booking.end_date)} · {booking.rental_days} day{booking.rental_days > 1 ? "s" : ""}
              </p>
              {booking.delivery_address && (
                <p className="mt-2 text-[13px] text-muted-foreground">Delivery: {booking.delivery_address}</p>
              )}
              {booking.delivery_notes && (
                <p className="mt-1 text-[13px] text-muted-foreground">Notes: {booking.delivery_notes}</p>
              )}
            </div>
          </div>

          {/* Finish paying, when there is still something to pay */}
          {!isPaid && !isCancelled && (
            <div className="space-y-3 rounded-radius-md bg-card p-5 shadow-figma">
              <h2 className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                {paying ? "Complete your payment" : "This booking isn't paid yet"}
              </h2>
              {!paying ? (
                <>
                  <p className="text-[12px] tracking-[-0.24px] text-muted-foreground">
                    We're holding the car for these dates. Pay now to confirm it.
                  </p>
                  <PaymentMethodTiles value={method} onChange={setMethod} available={methods} />
                  <Button className="w-full" onClick={startPayment}>Pay {formatUSD(effectiveTotal)}</Button>
                </>
              ) : method === "paypal" ? (
                <PayPalPanel
                  totalCents={effectiveTotal}
                  onPaid={(cap: string) => markPaid(cap, "paypal")}
                  onOrderCreated={(orderId: string) =>
                    attachPaymentReference(supabaseDb, "rental_bookings", booking.id, orderId, "paypal")}
                  orderMeta={{ description: `${v?.name ?? "Car"} rental`, booking_id: booking.id }}
                />
              ) : (
                <InvoiceQrPanel
                  mode={method === "onchain" ? "onchain" : "lightning"}
                  invoice={inv.state.invoice} address={inv.state.address} uri={inv.state.uri}
                  sats={inv.state.sats ?? 0} totalCents={effectiveTotal}
                  isPaid={inv.state.isPaid} isExpired={inv.state.isExpired}
                  onRetry={() => inv.reset()} successLabel="Confirming your booking…"
                />
              )}
            </div>
          )}

          {isPaid && !isCancelled && (
            <div className="flex items-start gap-3 rounded-radius-md bg-card p-5 shadow-figma">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <p className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">Paid and confirmed</p>
                <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
                  We'll have the car ready for {dayText(booking.start_date)}. To change or cancel it, message us on WhatsApp.
                </p>
              </div>
            </div>
          )}

          {/* Calling it off — only while nothing has been paid. A paid rental
              involves a refund, which is a conversation, not a button. */}
          {!isPaid && !isCancelled && (
            <div className="rounded-radius-md bg-card p-5 shadow-figma">
              <Button variant="ghost" className="text-red-500" disabled={cancelling} onClick={cancelBooking}>
                {cancelling && <Spinner size="sm" className="mr-2" />}
                Cancel this booking
              </Button>
            </div>
          )}
        </div>

        {/* What it costs */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-radius-md bg-card p-4 shadow-figma">
            <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.32px] text-foreground">Price</h2>
            <div className="space-y-1.5 text-[13px]">
              <Line label={`Car · ${booking.rental_days}d`} value={formatUSD(booking.subtotal_cents ?? 0)} />
              {Number(booking.discount_cents) > 0 && (
                <Line label="Multi-day discount" value={`−${formatUSD(booking.discount_cents)}`} accent />
              )}
              {Number(booking.insurance_cents) > 0 && <Line label="Insurance" value={formatUSD(booking.insurance_cents)} />}
              {extras.map((e, i) => <Line key={i} label={e.name ?? "Extra"} value={formatUSD(Number(e.cents) || 0)} />)}
              {Number(booking.delivery_fee_cents) > 0 && <Line label="Delivery" value={formatUSD(booking.delivery_fee_cents)} />}
              {Number(booking.surcharge_cents) > 0 && isPaid && (
                <Line label="Payment fee" value={formatUSD(booking.surcharge_cents)} />
              )}
              <div className="flex justify-between border-t border-border/60 pt-2 text-[16px] font-semibold text-foreground">
                <span>{isPaid ? "Paid" : "Total"}</span>
                <span className="tabular-nums">
                  {formatUSD(isPaid ? baseTotal + (Number(booking.surcharge_cents) || 0) : effectiveTotal)}
                </span>
              </div>
            </div>
          </div>
          <Link to={carPath()} className="block text-center text-[13px] font-semibold text-primary">Browse the fleet</Link>
        </div>
      </div>
    </AppContainer>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span className="tracking-[-0.02em]">{label}</span>
      <span className={cn("tabular-nums", accent && "text-primary")}>{value}</span>
    </div>
  );
}

function StatusLine({ status, paid }: { status: string; paid: boolean }) {
  if (status === "cancelled") {
    return <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-red-500"><XCircle className="h-4 w-4" /> Cancelled</span>;
  }
  if (paid) {
    return <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-emerald-500"><CheckCircle2 className="h-4 w-4" /> Confirmed</span>;
  }
  return <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-amber-500"><Clock className="h-4 w-4" /> Awaiting payment</span>;
}
