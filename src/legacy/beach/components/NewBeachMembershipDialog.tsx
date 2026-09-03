import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Waves } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPicker } from "@/components/patterns/UserPicker";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { todayHN } from "@/lib/timezone";
import { formatUSD, centsToInput } from "@/lib/pricing";

/**
 * Admin "issue a Beach Club membership to a customer" dialog — mounted on the
 * Schedule tab of the beach provider workspace, mirroring NewFoodSubscriptionDialog.
 * Pick a customer, pick a membership plan, choose headcount + months + start,
 * submit → a single `provider_subscriptions` insert (source_service_key='beach')
 * marked paid/manual so it shows up as an active member immediately. A DB
 * trigger mirrors the legacy `beach_club_subscriptions` row, exactly as checkout
 * does — so nothing here writes the legacy table directly.
 */

interface Props {
  /** Universal providers.id for the beach club — scopes the plan picker + owns the row. */
  providerUniversalId: string;
  trigger?: React.ReactNode;
}

interface PlanOption {
  id: string;
  name: string;
  price_cents: number;
  period: string | null;
  pricing_mode: string | null;
  provider_name: string | null;
}

export function NewBeachMembershipDialog({ providerUniversalId, trigger }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [planId, setPlanId] = useState("");
  const [unitCents, setUnitCents] = useState(0);
  const [people, setPeople] = useState(1);
  const [months, setMonths] = useState(1);
  const [startDate, setStartDate] = useState(todayHN());
  const [notes, setNotes] = useState("");

  const { data: plans = [], isLoading: plansLoading } = useQuery<PlanOption[]>({
    queryKey: ["admin-new-beach-plans", providerUniversalId],
    enabled: open && !!providerUniversalId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id,name,price_cents,period,pricing_mode,providers(name)")
        .eq("provider_id", providerUniversalId)
        .neq("status", "archived")
        .order("price_cents", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id, name: p.name, price_cents: p.price_cents,
        period: p.period, pricing_mode: p.pricing_mode,
        provider_name: p.providers?.name ?? null,
      }));
    },
  });

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const perPerson = selectedPlan?.pricing_mode === "per_person";

  // Seed the price from the chosen plan; admin can still override for an
  // off-platform deal, same as the food dialog.
  useEffect(() => {
    if (selectedPlan) setUnitCents(selectedPlan.price_cents);
  }, [selectedPlan]);

  const headcount = perPerson ? Math.max(1, people) : 1;
  const totalCents = unitCents * headcount * Math.max(1, months);
  const endDate = format(addMonths(parseISO(startDate), Math.max(1, months)), "yyyy-MM-dd");

  const create = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Pick a customer");
      if (!planId || !selectedPlan) throw new Error("Pick a membership plan");
      if (!startDate) throw new Error("Pick a start date");
      if (unitCents <= 0) throw new Error("Price must be greater than 0");

      const payload = {
        provider_id: providerUniversalId,
        plan_id: planId,
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
        price_cents: totalCents,
        periods_paid: Math.max(1, months),
        payment_status: "paid",
        payment_method: "manual",
        status: "active",
        source_service_key: "beach",
        customer_whatsapp: customerWhatsapp.trim() || null,
        notes: notes.trim() || null,
        // The mirror trigger reads these to fill the legacy row's own columns.
        metadata: {
          plan_name: selectedPlan.name,
          provider_name: selectedPlan.provider_name,
          period: selectedPlan.period,
          periods: Math.max(1, months),
          people: headcount,
          customer_name: customerName.trim() || null,
          customer_email: customerEmail.trim() || null,
          surcharge_cents: 0,
        },
      };

      const { data, error } = await supabaseDb
        .from("provider_subscriptions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      if (userData?.id) {
        await logAuditEvent(userData.id, "create", "beach_subscription", data?.id ?? null, payload);
      }
      return data?.id;
    },
    onSuccess: () => {
      toast.success("Membership issued");
      qc.invalidateQueries({ queryKey: ["provider-subscribers"] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
      resetAndClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not issue membership"),
  });

  const resetAndClose = () => {
    setOpen(false);
    setUserId(""); setCustomerName(""); setCustomerEmail(""); setCustomerWhatsapp("");
    setPlanId(""); setUnitCents(0); setPeople(1); setMonths(1);
    setStartDate(todayHN()); setNotes("");
  };

  const defaultTrigger = (
    <Button variant="secondary" onClick={() => setOpen(true)} className="gap-2 rounded-full">
      <Plus className="h-4 w-4" /> New membership
    </Button>
  );

  return (
    <>
      {trigger ? <span onClick={() => setOpen(true)}>{trigger}</span> : defaultTrigger}

      <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-primary" /> New membership
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <UserPicker
                value={userId}
                onSelect={(u) => {
                  setUserId(u?.id ?? "");
                  if (u) {
                    setCustomerName(u.display_name || u.name || u.email || "");
                    setCustomerEmail(u.email || "");
                  }
                }}
                placeholder="Pick a platform user…"
              />
            </div>

            <div>
              <Label>Membership plan *</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder={plansLoading ? "Loading…" : "Pick a plan"} />
                </SelectTrigger>
                <SelectContent>
                  {plans.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {plansLoading ? "Loading plans…" : "This club has no plans yet."}
                    </div>
                  )}
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatUSD(p.price_cents)}{p.pricing_mode === "per_person" ? "/person" : ""}/{p.period ?? "month"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>{perPerson ? "Price / person ($)" : "Price ($)"}</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={centsToInput(unitCents)}
                  onChange={(e) => setUnitCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                />
              </div>
              <div>
                <Label>People</Label>
                <Input
                  type="number" min={1}
                  value={people}
                  disabled={!perPerson}
                  onChange={(e) => setPeople(Math.max(1, parseInt(e.target.value || "1", 10)))}
                />
              </div>
              <div>
                <Label>Months *</Label>
                <Input
                  type="number" min={1}
                  value={months}
                  onChange={(e) => setMonths(Math.max(1, parseInt(e.target.value || "1", 10)))}
                />
              </div>
            </div>

            <div>
              <Label>Start date *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Ends {endDate} · Total <b>{formatUSD(totalCents)}</b>
              </p>
            </div>

            <div>
              <Label>WhatsApp (optional)</Label>
              <Input
                type="tel" value={customerWhatsapp}
                onChange={(e) => setCustomerWhatsapp(e.target.value)}
                placeholder="+504 1234 5678"
              />
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!userId || !planId || unitCents <= 0 || create.isPending}
            >
              {create.isPending && <Spinner size="sm" className="mr-2" />}
              Issue membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
