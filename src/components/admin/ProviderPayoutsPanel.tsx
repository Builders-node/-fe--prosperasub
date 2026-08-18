import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";

/**
 * Recording money sent to a provider.
 *
 * The counterpart of the provider's own Money tab: what an admin writes here is
 * exactly what a provider reads there, and "owed" is earned minus these rows.
 * Nothing else on the platform writes them — there is no automatic settlement,
 * and pretending otherwise by inferring payouts from payments would produce a
 * number nobody had actually sent.
 *
 * Writes go through NestJS with the service role. `provider_payouts` has RLS on
 * with no policies precisely so this cannot be done from the browser's anon key
 * the way the config tables are.
 */

const METHODS = ["lightning", "onchain", "paypal", "bank", "cash", "other"];

interface PayoutRow {
  id: string;
  provider_id: string;
  amount_cents: number;
  period_start: string | null;
  period_end: string | null;
  method: string | null;
  reference: string | null;
  note: string | null;
  paid_at: string | null;
  status?: "requested" | "approved" | "paid" | "rejected";
  destination?: string | null;
  requested_at?: string | null;
  created_at?: string | null;
}

export function ProviderPayoutsPanel() {
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState("");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [method, setMethod] = useState("lightning");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const { data: providers = [] } = useQuery({
    queryKey: ["payout-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, archetype_key")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; archetype_key: string | null }>;
    },
  });

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ["admin-provider-payouts", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await adminApi(`/admin/providers/${providerId}/payouts`);
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as PayoutRow[];
    },
  });

  const reset = () => {
    setAmount(""); setReference(""); setNote("");
    setPeriodStart(""); setPeriodEnd("");
  };

  const create = useMutation({
    mutationFn: async () => {
      // Dollars in the form, cents in the table — the same convention as every
      // other price on the platform.
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Enter an amount greater than zero.");
      const { data, error } = await adminApi(`/admin/providers/${providerId}/payouts`, {
        method: "POST",
        body: JSON.stringify({
          amount_cents: cents,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          method,
          reference: reference.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Payout recorded");
      reset();
      qc.invalidateQueries({ queryKey: ["admin-provider-payouts", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-payouts", providerId] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't record the payout"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await adminApi(`/admin/payouts/${id}`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payout removed");
      qc.invalidateQueries({ queryKey: ["admin-provider-payouts", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-payouts", providerId] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't remove the payout"),
  });

  const total = payouts.reduce((s, p) => s + Number(p.amount_cents || 0), 0);

  return (
    <div className="space-y-space-4">
      <PayoutRequestQueue providers={providers} />

      <div className="rounded-radius-lg bg-card p-space-4">
        <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Business</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger className="mt-2 max-w-md"><SelectValue placeholder="Pick a provider" /></SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.archetype_key ? ` · ${p.archetype_key}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!providerId ? (
        <p className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-8 text-center text-muted-foreground">
          Pick a business to see what it has been paid and to record a new payout.
        </p>
      ) : (
        <>
          <div className="grid gap-space-4 rounded-radius-lg bg-card p-space-4 md:grid-cols-3">
            <div>
              <Label htmlFor="payout-amount">Amount (USD)</Label>
              <Input id="payout-amount" inputMode="decimal" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="payout-method">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="payout-method" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payout-ref">Reference</Label>
              <Input id="payout-ref" placeholder="txid / payment hash"
                value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="payout-from">Period from</Label>
              <Input id="payout-from" type="date" value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="payout-to">Period to</Label>
              <Input id="payout-to" type="date" value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="payout-note">Note</Label>
              <Input id="payout-note" placeholder="Optional"
                value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5" />
            </div>
            <div className="md:col-span-3">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !amount}>
                {create.isPending ? "Recording…" : "Record payout"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Leave the period empty for an ad-hoc transfer. The provider sees this immediately,
                and it stops counting against what they're owed.
              </p>
            </div>
          </div>

          <div className="rounded-radius-lg bg-card p-space-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold text-foreground">Recorded payouts</h3>
              <span className="text-sm tabular-nums text-muted-foreground">{formatUSD(total)} total</span>
            </div>
            {isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
            ) : payouts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing paid to this business yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatDateHN(p.paid_at ?? p.requested_at ?? p.created_at)} · {formatUSD(p.amount_cents)}
                        {p.method && <span className="ml-2 text-xs uppercase text-muted-foreground">{p.method}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.period_start && p.period_end ? `${p.period_start} → ${p.period_end}` : "Ad-hoc"}
                        {p.note ? ` · ${p.note}` : ""}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(p.id)} disabled={remove.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The queue of providers waiting to be paid.
 *
 * A request is a claim, not a transfer: approving says the platform agrees it
 * is owed, and "Mark sent" is the only action that says money moved — and the
 * only one that stamps the ledger date. Keeping the two apart is what lets an
 * admin approve today and pay when they are next at a wallet, without the
 * provider's screen claiming they have been paid in the meantime.
 *
 * The amount was already capped server-side when the provider asked; nothing
 * here can raise it.
 */
function PayoutRequestQueue({ providers }: { providers: Array<{ id: string; name: string }> }) {
  const qc = useQueryClient();
  const nameOf = (id: string) => providers.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin-payout-requests"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/payouts/requests");
      if (error) throw new Error(String(error));
      return (Array.isArray(data) ? data : []) as PayoutRow[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approved" | "rejected" | "paid" }) => {
      const { data, error } = await adminApi(`/admin/payouts/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      if (error) throw new Error(String(error));
      return data;
    },
    onSuccess: (_d, v) => {
      toast.success(v.decision === "paid" ? "Marked as sent" : `Request ${v.decision}`);
      qc.invalidateQueries({ queryKey: ["admin-payout-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-provider-payouts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the request"),
  });

  if (isLoading || requests.length === 0) return null;

  return (
    <div className="rounded-radius-lg bg-card p-space-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Payout requests ({requests.length})
      </p>
      <ul className="mt-space-3 divide-y divide-border/60">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-space-3 py-space-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {nameOf(r.provider_id)}
                <span className="ml-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {r.status}
                </span>
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{r.destination}</p>
              {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
            </div>
            <div className="flex items-center gap-space-2">
              <span className="text-base font-black tabular-nums text-foreground">{formatUSD(r.amount_cents)}</span>
              {r.status === "requested" && (
                <>
                  <Button size="sm" variant="outline" className="rounded-full"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, decision: "rejected" })}>
                    Reject
                  </Button>
                  <Button size="sm" className="rounded-full"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, decision: "approved" })}>
                    Approve
                  </Button>
                </>
              )}
              {r.status === "approved" && (
                <Button size="sm" className="rounded-full"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, decision: "paid" })}>
                  Mark sent
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
