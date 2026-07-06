import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { HeartPulse, Clock, MapPin, CalendarDays } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { PayBox } from "@/components/payment/PayBox";
import { LocationPicker } from "@/components/account/SavedLocations";
import { formatUSD } from "@/lib/pricing";
import { todayHN } from "@/lib/timezone";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useResidences } from "@/hooks/useResidences";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { toast } from "sonner";

interface Provider { id: string; name: string; description: string | null; location: string | null; working_hours: string | null; }
interface Plan { id: string; provider_id: string; name: string; description: string | null; price_cents: number; duration_minutes: number; sessions_per_period: number; }
interface Slot { id: string; provider_id: string; date: string; start_time: string; end_time: string; capacity: number; current_bookings: number; }
const fmtTime = (t: string) => t?.slice(0, 5);
const todayStr = () => new Date().toISOString().split("T")[0];

const MassageListing = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAuthenticated, userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  const userUuid = useUserUuid();

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["massage-providers-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("massage_providers").select("*").eq("status", "active").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Provider[];
    },
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["massage-plans-public"],
    queryFn: async () => {
      const { data } = await supabaseDb.from("massage_plans").select("*").eq("status", "active").order("sort_order");
      return (data ?? []) as Plan[];
    },
  });

  // ─── Location filter ───────────────────────────────────────────────────────
  const { residence } = useSelectedResidence();
  const { data: residences = [] } = useResidences();
  const selectedResidenceId = residence ? (residences.find((r) => r.name === residence)?.id ?? null) : null;
  const { data: provLinks = [] } = useQuery({
    queryKey: ["massage-provider-residences"],
    queryFn: async () => {
      const { data } = await supabaseDb.from("massage_provider_residences").select("provider_id, residence_id");
      return (data ?? []) as { provider_id: string; residence_id: string }[];
    },
  });
  const provResidences: Record<string, string[]> = {};
  provLinks.forEach((l) => { (provResidences[l.provider_id] ??= []).push(l.residence_id); });
  const servesHere = (pid: string) => !selectedResidenceId || (provResidences[pid]?.length ?? 0) === 0 || provResidences[pid].includes(selectedResidenceId);
  const visibleProviders = providers.filter((p) => servesHere(p.id));

  // ─── Subscribe checkout (with payment) ─────────────────────────────────────
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState({ customer_name: "", customer_whatsapp: "", residence: "", location: "" });

  const onSubscribe = (plan: Plan) => {
    if (!isAuthenticated) { openAuthModal("login", "/massage"); return; }
    setForm({
      customer_name: userData?.name ?? userData?.display_name ?? "",
      customer_whatsapp: "", residence: residence || "", location: "",
    });
    setCheckoutPlan(plan);
  };

  const checkoutValid = !!form.customer_name.trim() && !!form.customer_whatsapp.trim();

  const createPaidSub = async (paymentRef: string, method: string, pending: boolean) => {
    if (!checkoutPlan) return;
    const today = todayHN();
    const { error } = await supabaseDb.from("massage_subscriptions").insert({
      user_id: userUuid ?? userData!.id, provider_id: checkoutPlan.provider_id, plan_id: checkoutPlan.id,
      price_cents: checkoutPlan.price_cents, status: pending ? "pending" : "active",
      payment_status: pending ? "pending" : "paid", payment_method: method, payment_reference: paymentRef || null,
      customer_name: form.customer_name.trim(), customer_whatsapp: form.customer_whatsapp.trim() || null,
      residence: form.residence.trim() || null, location: form.location.trim() || null,
      started_at: today, periods_paid: 1,
    });
    if (error) throw new Error(error.message);
    toast.success("Subscription active! Book your sessions from My Subscriptions.");
    qc.invalidateQueries({ queryKey: ["my-massage-subscriptions"] });
    setCheckoutPlan(null);
  };

  // ─── Booking ───────────────────────────────────────────────────────────────
  const [bookProvider, setBookProvider] = useState<Provider | null>(null);
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["massage-slots", bookProvider?.id],
    enabled: !!bookProvider,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("massage_slots").select("*")
        .eq("provider_id", bookProvider!.id).eq("status", "open").gte("date", todayStr())
        .order("date").order("start_time");
      if (error) throw error;
      return ((data ?? []) as Slot[]).filter((s) => s.current_bookings < s.capacity);
    },
  });

  const book = useMutation({
    mutationFn: async (slot: Slot) => {
      // Re-check capacity, then book + bump the counter.
      const { data: fresh } = await supabaseDb.from("massage_slots").select("capacity, current_bookings").eq("id", slot.id).single();
      if (fresh && fresh.current_bookings >= fresh.capacity) throw new Error("This slot was just filled. Pick another.");
      const { error } = await supabaseDb.from("massage_bookings").insert({
        user_id: userUuid ?? userData!.id, provider_id: slot.provider_id, slot_id: slot.id,
        status: "booked", customer_name: userData?.name ?? userData?.display_name ?? null,
      });
      if (error) throw error;
      await supabaseDb.from("massage_slots").update({ current_bookings: (fresh?.current_bookings ?? slot.current_bookings) + 1 }).eq("id", slot.id);
    },
    onSuccess: () => {
      toast.success("Session booked! See it in My Subscriptions.");
      qc.invalidateQueries({ queryKey: ["massage-slots", bookProvider?.id] });
      qc.invalidateQueries({ queryKey: ["my-massage-bookings"] });
      setBookProvider(null);
    },
    onError: (e: any) => toast.error(e?.message || "Could not book"),
  });

  const onBook = (p: Provider) => {
    if (!isAuthenticated) { openAuthModal("login", "/massage"); return; }
    setBookProvider(p);
  };

  const slotsByDate: Record<string, Slot[]> = {};
  slots.forEach((s) => { (slotsByDate[s.date] ??= []).push(s); });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Massage" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />
      <main className="market-content py-space-4 md:py-space-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">Massage</h1>
            <p className="mt-1 text-sm text-muted-foreground">Book recurring massage sessions with our providers.</p>
          </div>
          {selectedResidenceId && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <MapPin className="h-3.5 w-3.5" /> {residence}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{[1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-3xl bg-muted" />)}</div>
        ) : visibleProviders.length === 0 ? (
          <YdEmptyState icon={HeartPulse} title={selectedResidenceId ? `No providers in ${residence}` : "No providers yet"} subtitle={selectedResidenceId ? "Try another location or check back soon." : "Massage providers are being set up — check back soon."} />
        ) : (
          <div className="space-y-6">
            {visibleProviders.map((p) => {
              const pPlans = plans.filter((pl) => pl.provider_id === p.id);
              return (
                <section key={p.id} className="rounded-3xl border border-border bg-card p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10">
                      <HeartPulse className="h-6 w-6 text-rose-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-black tracking-tight text-foreground">{p.name}</h2>
                      {p.description && <p className="mt-0.5 text-sm text-muted-foreground">{p.description}</p>}
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {p.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.location}</span>}
                        {p.working_hours && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {p.working_hours}</span>}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full" onClick={() => onBook(p)}>
                      <CalendarDays className="h-4 w-4" /> Book a session
                    </Button>
                  </div>

                  {pPlans.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {pPlans.map((pl) => (
                        <div key={pl.id} className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">{pl.name}</p>
                            <p className="text-xs text-muted-foreground">{pl.duration_minutes} min · {pl.sessions_per_period} session{pl.sessions_per_period !== 1 ? "s" : ""}/period{pl.description ? ` · ${pl.description}` : ""}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-black text-rose-400">{formatUSD(pl.price_cents)}</p>
                          </div>
                          <Button size="sm" className="shrink-0 rounded-full" onClick={() => onSubscribe(pl)}>
                            {"Subscribe"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Subscribe checkout dialog */}
      <Dialog open={!!checkoutPlan} onOpenChange={(o) => { if (!o) setCheckoutPlan(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Subscribe — {checkoutPlan?.name}</DialogTitle></DialogHeader>
          {checkoutPlan && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl bg-muted/50 p-3">
                <span className="text-sm text-muted-foreground">{checkoutPlan.duration_minutes} min · {checkoutPlan.sessions_per_period} session{checkoutPlan.sessions_per_period !== 1 ? "s" : ""}/period</span>
                <span className="text-lg font-black text-rose-400">{formatUSD(checkoutPlan.price_cents)}</span>
              </div>
              <div><Label className="mb-1.5">Full name *</Label><Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} placeholder="Your full name" /></div>
              <div><Label className="mb-1.5">WhatsApp *</Label><Input type="tel" value={form.customer_whatsapp} onChange={(e) => setForm((f) => ({ ...f, customer_whatsapp: e.target.value }))} placeholder="+504 1234 5678" /></div>
              {residences.length > 0 && (
                <div><Label className="mb-1.5">Residence</Label>
                  <Select value={form.residence || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, residence: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Other / not listed" /></SelectTrigger>
                    <SelectContent><SelectItem value="_none">Other / not listed</SelectItem>{residences.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label className="mb-1.5">Address / unit</Label>
                <LocationPicker userId={userData?.id} onPick={(line) => setForm((f) => ({ ...f, location: line }))} />
                <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Apartment / unit (optional)" />
              </div>
              {!checkoutValid && <p className="text-xs text-muted-foreground">Fill name and WhatsApp to continue.</p>}
              <PayBox
                amountCents={checkoutPlan.price_cents}
                serviceName="Massage Subscription" context="massage_subscription"
                externalIdPrefix={`massage-sub-${checkoutPlan.id}`}
                adminUrl={`${window.location.origin}/admin/massage/subscriptions`}
                clientName={form.customer_name} clientPhone={form.customer_whatsapp}
                disabled={!checkoutValid} payLabelPrefix="Subscribe"
                onPaid={({ method, paymentRef, pending }) => createPaidSub(paymentRef, method, pending)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Booking dialog */}
      <Dialog open={!!bookProvider} onOpenChange={(o) => { if (!o) setBookProvider(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Book a session — {bookProvider?.name}</DialogTitle></DialogHeader>
          {slotsLoading ? (
            <div className="py-8 text-center"><Spinner /></div>
          ) : slots.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarDays className="mx-auto mb-2 h-9 w-9 text-muted-foreground/30" />
              <p className="font-semibold text-foreground">No open slots</p>
              <p className="mt-1 text-sm text-muted-foreground">This provider has no available times right now.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(slotsByDate).map(([date, daySlots]) => (
                <div key={date}>
                  <p className="mb-2 text-sm font-bold text-foreground">{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => (
                      <Button key={s.id} variant="outline" size="sm" className="rounded-full" disabled={book.isPending} onClick={() => book.mutate(s)}>
                        {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default MassageListing;
