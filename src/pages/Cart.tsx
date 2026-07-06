import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, Trash2, Minus, Plus, MapPin, MessageCircle, User as UserIcon,
  Check, CheckCircle2, Zap, Bitcoin,
} from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
import { toast } from "sonner";
import { supabaseDb } from "@/integrations/supabase/client";
import { LocationPicker } from "@/components/account/SavedLocations";
import { useCart, cartLineTotal } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useResidences } from "@/hooks/useResidences";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { todayHN } from "@/lib/timezone";
import { DURATION_OPTIONS } from "@/lib/durations";

type Step = "cart" | "pay" | "success";

function endDateFor(startISO: string, weeks: number): string {
  const d = new Date(`${startISO}T00:00:00`);
  d.setDate(d.getDate() + Math.max(weeks || 1, 1) * 7);
  return d.toISOString().split("T")[0];
}

export default function Cart() {
  const navigate = useNavigate();
  const { items, totalCents, count, setQty, setDuration, removeItem, clear } = useCart();
  const { isAuthenticated, userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  const userUuid = useUserUuid();
  const { btcPrice, convertToSats, isLoading: isPriceLoading } = useBtcPrice();
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();
  const { data: residences = [] } = useResidences();
  const { residence: globalResidence } = useSelectedResidence();

  const [step, setStep] = useState<Step>("cart");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const [form, setForm] = useState({
    customer_name: "",
    customer_whatsapp: "",
    residence: "",
    delivery_address: "",
    notes: "",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const createdRef = useRef(false);

  // Unified Lightning + on-chain invoice generation + polling.
  const inv = useInvoicePayment({
    onPaid: (paymentRef) => { onPaidComplete(paymentRef); },
  });

  // Prefill name + global residence once known.
  useEffect(() => {
    setForm((f) => ({
      ...f,
      customer_name: f.customer_name || userData?.name || userData?.display_name || "",
      residence: f.residence || globalResidence || "",
    }));
  }, [userData, globalResidence]);

  const effectiveTotalCents = addSurchargeCents(totalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  const totalUsd = centsToDollars(effectiveTotalCents);
  const estimatedSats = convertToSats(totalUsd);
  const formValid =
    form.customer_name.trim() && form.customer_whatsapp.trim() && form.delivery_address.trim();

  // ─── Create all subscriptions after a single payment ───────────────────────
  const createRecords = async (paymentRef: string, pending = false) => {
    const today = todayHN();
    const batchId = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const rows: any[] = [];
    items.forEach((item) => {
      for (let n = 0; n < item.qty; n++) {
        rows.push({
          user_id: userUuid ?? userData!.id,
          provider_id: item.providerId,
          meal_plan_id: item.planId,
          weekly_price_cents: item.unitPriceCents,
          commitment_weeks: item.durationWeeks,
          started_at: today,
          end_date: endDateFor(today, item.durationWeeks),
          status: pending ? "pending" : "active",
          payment_status: pending ? "pending" : "paid",
          payment_method: paymentMethod === "infinita" ? "crypto" : paymentMethod,
          payment_reference: paymentRef || null,
          periods_paid: 1,
          batch_id: batchId,
          customer_name: form.customer_name.trim(),
          customer_whatsapp: form.customer_whatsapp.trim(),
          residence: form.residence.trim() || null,
          delivery_address: form.delivery_address.trim() || null,
          notes: form.notes.trim() || null,
        });
      }
    });
    const { error } = await supabaseDb.from("food_subscriptions").insert(rows);
    if (error) throw error;
  };

  const onPaidComplete = async (paymentRef: string, pending = false) => {
    if (createdRef.current) return;
    createdRef.current = true;
    try {
      await createRecords(paymentRef, pending);
      setIsPaid(true);
      clear();
      setStep("success");
    } catch (e: any) {
      createdRef.current = false;
      toast.error(e?.message || "Could not create your orders");
    }
  };

  const startCheckout = async () => {
    if (!isAuthenticated) { openAuthModal("login", "/cart"); return; }
    if (!formValid || items.length === 0) return;
    createdRef.current = false;
    const description = `Cart - ${count} portion${count > 1 ? "s" : ""} - ${formatUSD(totalCents)}`;

    if (paymentMethod === "infinita" || paymentMethod === "paypal") {
      setStep("pay");
      return;
    }

    if (!btcPrice) { toast.error("BTC price not loaded yet."); return; }
    const sats = convertToSats(totalUsd);
    if (sats <= 0) { toast.error("Unable to calculate payment amount."); return; }

    setIsGenerating(true);
    setStep("pay");
    try {
      await inv.start({
        method: paymentMethod === "onchain" ? "onchain" : "lightning",
        amountCents: effectiveTotalCents,
        amountSats: sats,
        description,
        context: "food_cart",
        externalId: `food-cart-${Date.now()}`.slice(0, 100),
        meta: {
          service_name: "Food Cart",
          client_name: form.customer_name.trim(),
          client_phone: form.customer_whatsapp.trim(),
          admin_url: `${window.location.origin}/admin/food/subscriptions`,
        },
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const backToCart = () => {
    inv.reset();
    setStep("cart");
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-28 md:pb-12">
      <HomeHeader title="Cart" showBackButton onBack={() => navigate(-1)} />
      <DesktopHeader showBackButton breadcrumb="Cart" />

      <main className="market-content space-y-5 py-space-4 md:py-space-6">
        {step === "success" ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
            <h1 className="text-2xl font-black tracking-tight">Order placed!</h1>
            <p className="mt-2 max-w-sm text-muted-foreground">
              Your portions are confirmed. You can track them in My Subscriptions.
            </p>
            <div className="mt-6 flex gap-2">
              <Button onClick={() => navigate("/my-subscriptions")} className="rounded-full">My Subscriptions</Button>
              <Button variant="outline" onClick={() => navigate("/food")} className="rounded-full">Order more</Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="mb-4 h-14 w-14 text-muted-foreground/30" />
            <h1 className="text-xl font-black tracking-tight">Your cart is empty</h1>
            <p className="mt-1 text-muted-foreground">Add meal portions and pay for them together.</p>
            <Button onClick={() => navigate("/food")} className="mt-5 rounded-full">Browse food</Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Your cart</h1>

            {/* Items */}
            <section className="space-y-3">
              {items.map((item) => (
                <div key={item.key} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">{item.planName}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.providerName}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatUSD(item.unitPriceCents)}/wk · per portion
                    </p>
                    <Select value={String(item.durationWeeks)} onValueChange={(v) => setDuration(item.key, parseInt(v))}>
                      <SelectTrigger className="mt-1.5 h-8 w-[140px] rounded-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((d) => (
                          <SelectItem key={d.weeks} value={String(d.weeks)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full"
                      onClick={() => setQty(item.key, item.qty - 1)} aria-label="Decrease">
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-7 text-center text-sm font-bold tabular-nums">{item.qty}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full"
                      onClick={() => setQty(item.key, item.qty + 1)} aria-label="Increase">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <p className="font-mono font-bold tabular-nums text-foreground">{formatUSD(cartLineTotal(item))}</p>
                    <button type="button" onClick={() => removeItem(item.key)}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {/* Summary */}
            <section className="rounded-2xl bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">Total ({count} portion{count > 1 ? "s" : ""})</span>
                <div className="text-right">
                  <span className="text-xl font-black text-orange-400">{formatUSD(effectiveTotalCents)}</span>
                  {feePct > 0 && (
                    <p className="text-[10px] text-muted-foreground">Base {formatUSD(totalCents)} + {feePct}% fee</p>
                  )}
                </div>
              </div>
            </section>

            {step === "cart" && (
              <>
                {/* Delivery details */}
                <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Delivery details</p>
                  <div>
                    <Label className="mb-1.5 flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> Full name *</Label>
                    <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} placeholder="Your full name" />
                  </div>
                  <div>
                    <Label className="mb-1.5 flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp *</Label>
                    <Input type="tel" value={form.customer_whatsapp} onChange={(e) => setForm((f) => ({ ...f, customer_whatsapp: e.target.value }))} placeholder="+504 1234 5678" />
                  </div>
                  {residences.length > 0 && (
                    <div>
                      <Label className="mb-1.5 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Residence</Label>
                      <Select value={form.residence || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, residence: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Other / not listed" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Other / not listed</SelectItem>
                          {residences.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="mb-1.5 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Delivery address *</Label>
                    <LocationPicker userId={userData?.id} onPick={(line) => setForm((f) => ({ ...f, delivery_address: line }))} />
                    <Textarea value={form.delivery_address}
                      onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))}
                      rows={2} placeholder="Apartment / unit, building, street…" />
                  </div>
                  <div>
                    <Label className="mb-1.5">Notes</Label>
                    <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Allergies, preferences…" />
                  </div>
                </section>

                {/* Payment method */}
                <section className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</p>
                  <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
                </section>
              </>
            )}

            {/* Payment panels */}
            {step === "pay" && paymentMethod === "infinita" && (
              <InfinitaPaymentPanel totalCents={effectiveTotalCents} serviceName="Food order" onPaid={(pid) => onPaidComplete(pid, false)} />
            )}
            {step === "pay" && paymentMethod === "paypal" && (
              <PayPalPanel totalCents={effectiveTotalCents} onPaid={(cap) => onPaidComplete(cap)} />
            )}
            {step === "pay" && (inv.state.invoice || inv.state.address) && (
              <InvoiceQrPanel
                mode={inv.state.invoice ? "lightning" : "onchain"}
                invoice={inv.state.invoice}
                address={inv.state.address}
                uri={inv.state.uri}
                sats={inv.state.sats ?? 0}
                totalCents={effectiveTotalCents}
                isPaid={isPaid}
                successLabel="Creating your orders…"
              />
            )}

            {step === "pay" && (paymentMethod === "lightning" || paymentMethod === "onchain") && (
              <Button variant="ghost" className="w-full" onClick={backToCart}>Cancel payment</Button>
            )}
          </>
        )}
      </main>

      {/* Sticky checkout bar */}
      {step === "cart" && items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background md:left-[var(--sidebar-width,0px)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="market-content px-4 py-3">
            <Button size="lg" className="h-14 w-full rounded-2xl text-base font-bold"
              onClick={startCheckout}
              disabled={!formValid || isGenerating || ((paymentMethod === "lightning" || paymentMethod === "onchain") && (isPriceLoading || !btcPrice))}>
              {isGenerating ? (
                <><Spinner size="sm" className="mr-2" /> Starting…</>
              ) : !isAuthenticated ? (
                "Log in to checkout"
              ) : paymentMethod === "infinita" ? (
                <>Pay {formatUSD(effectiveTotalCents)} with LIVES</>
              ) : paymentMethod === "paypal" ? (
                <>Continue with PayPal</>
              ) : paymentMethod === "onchain" ? (
                <><Bitcoin className="mr-2 h-5 w-5" /> Pay {estimatedSats.toLocaleString()} sats</>
              ) : (
                <><Zap className="mr-2 h-5 w-5" /> Pay {estimatedSats.toLocaleString()} sats</>
              )}
            </Button>
            {!formValid && (
              <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
                <Check className="h-3 w-3" /> Fill name, WhatsApp and delivery address to continue
              </p>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
