import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPicker } from "@/components/patterns/UserPicker";
import { TermPills } from "@/components/checkout/OrderSize";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { formatUSD } from "@/lib/pricing";
import { todayHN, formatDateHN } from "@/lib/timezone";
import { resolveCheckoutPlan, totalFor } from "@/lib/checkout/planCheckoutModel";
import { buildSubscriptionWrite, endDateOf } from "@/lib/checkout/subscriptionWriter";
import { orderShape } from "@/lib/checkout/orderShape";
import { format } from "date-fns";

/**
 * "New subscription" for a cleaning business — a customer who paid outside
 * the platform (cash, transfer, a deal on WhatsApp) gets a real subscription,
 * not just a loose visit.
 *
 * Before this the Schedule tab could only add a BOOKING; food and the beach
 * club had their own "new subscription" dialogs, cleaning did not, so an
 * off-platform customer existed only as visits with nothing behind them — no
 * period, no renewal reminder, no line in the money.
 *
 * The row is written by the SAME writer the checkout uses
 * (`buildSubscriptionWrite`), so its shape cannot drift from a paid online
 * order; only the payment is different: paid, method `manual`. After saving,
 * the visits are the next step, so the caller opens the booking dialog with
 * this subscription already picked.
 */
export function NewCleaningSubscriptionDialog({
  providerId, onCreated, trigger,
}: {
  /** Legacy cleaning provider id — scopes the plan picker and is stamped on the row. */
  providerId: string;
  /** The new subscription's id — used to go straight on to scheduling its visits. */
  onCreated?: (subscriptionId: string) => void;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [packageId, setPackageId] = useState("");
  const [months, setMonths] = useState(1);
  const [priceDollars, setPriceDollars] = useState("");
  const [startDate, setStartDate] = useState(todayHN());
  const [where, setWhere] = useState("");
  const [phone, setPhone] = useState("");

  const { data: packages = [], isLoading: packagesLoading } = useQuery({
    queryKey: ["new-cleaning-sub-packages", providerId],
    enabled: open && !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_packages")
        .select("id,name,status,is_active,deleted_at,sort_order")
        .eq("provider_id", providerId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // Only what is on sale — a draft is one tap from being sold otherwise.
      return (data ?? []).filter((p: any) => p.is_active !== false && (p.status ?? "active") === "active") as Array<{ id: string; name: string }>;
    },
  });

  // The plan as the checkout sees it: price, period, terms.
  const { data: plan, isFetching: planLoading } = useQuery({
    queryKey: ["new-cleaning-sub-plan", packageId],
    enabled: !!packageId,
    queryFn: () => resolveCheckoutPlan(packageId),
  });

  const shape = plan ? orderShape(plan) : null;
  useEffect(() => {
    if (!plan) return;
    setPriceDollars((plan.unitCents / 100).toFixed(2));
    setMonths((m) => (shape?.termOptions.includes(m) ? m : shape?.termOptions[0] ?? 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.universalId]);

  const unitCents = Math.round((parseFloat(priceDollars) || 0) * 100);
  const priced = useMemo(() => (plan ? { ...plan, unitCents } : null), [plan, unitCents]);
  const totalCents = priced ? totalFor(priced, months, 1) : 0;
  const endDate = priced && startDate ? format(endDateOf(priced, startDate, months), "yyyy-MM-dd") : null;

  const reset = () => {
    setOpen(false);
    setUserId(""); setCustomerName(""); setPackageId(""); setMonths(1);
    setPriceDollars(""); setStartDate(todayHN()); setWhere(""); setPhone("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Pick a customer");
      if (!priced) throw new Error("Pick a plan");
      if (unitCents <= 0) throw new Error("The price must be more than $0");
      const { table, row } = buildSubscriptionWrite(priced, {
        userId,
        userUuid: userId,
        startDate,
        periods: months,
        people: 1,
        totalCents,
        chargedCents: totalCents,
        paymentMethod: "manual",
        phone: phone.trim(),
        notes: "",
        customerName: customerName || null,
        customerEmail: null,
        address: where.trim(),
        area: "",
        selections: [],
      }, {
        // Paid off the platform, running from the start date. Its visits are
        // booked next; until then the Customers list flags it.
        provider_id: providerId,
        payment_status: "paid",
        payment_method: "manual",
        subscription_status: "active",
        is_active: true,
      });
      const { data, error } = await supabaseDb.from(table).insert(row).select("id").single();
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "create", "cleaning_subscription", data?.id ?? null, row);
      return String(data?.id ?? "");
    },
    onSuccess: (id) => {
      toast.success("Subscription added — now book its visits");
      qc.invalidateQueries({ queryKey: ["provider-subscribers"] });
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      reset();
      if (id) onCreated?.(id);
    },
    onError: (e: Error) => toast.error(e.message || "Could not add the subscription"),
  });

  return (
    <>
      {trigger
        ? <span onClick={() => setOpen(true)}>{trigger}</span>
        : (
          <Button variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New subscription
          </Button>
        )}

      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => { if (!o && !create.isPending) reset(); }}
        title="New subscription"
        description="For a customer who paid outside the platform. It counts as paid and runs from the start date."
        footer={
          <div className="flex w-full gap-2">
            <Button variant="secondary" className="flex-1" onClick={reset} disabled={create.isPending}>Cancel</Button>
            <Button className="flex-1" onClick={() => create.mutate()} loading={create.isPending}
              disabled={create.isPending || !userId || !priced || unitCents <= 0}>
              {totalCents > 0 ? `Add · ${formatUSD(totalCents)}` : "Add subscription"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <UserPicker
              value={userId}
              onSelect={(u) => {
                setUserId(u?.id ?? "");
                setCustomerName(u ? (u.display_name || u.name || u.email || "") : "");
              }}
              placeholder="Pick a platform user…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger>
                <SelectValue placeholder={packagesLoading ? "Loading…" : "Pick a plan"} />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {packageId && planLoading && !plan && <p className="text-meta text-muted-foreground">Loading the plan…</p>}

          {plan && shape && (
            <>
              {shape.termOptions.length > 1 && (
                <div className="space-y-1.5">
                  <Label>How long</Label>
                  <TermPills options={shape.termOptions} value={months} onChange={setMonths} noun={shape.periodNoun} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={`Price per ${shape.periodNoun || "period"} ($)`}
                  inputMode="decimal"
                  value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <Input label="Starts" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              {endDate && (
                <p className="text-meta text-muted-foreground">
                  Runs {formatDateHN(startDate)} → {formatDateHN(endDate)} · {formatUSD(totalCents)} in total
                </p>
              )}
            </>
          )}

          <Input label="Where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Apartment, building" />
          <Input label="WhatsApp" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+504 1234 5678" />
        </div>
      </ResponsiveDialog>
    </>
  );
}
