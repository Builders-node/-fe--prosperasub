import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Zap } from "lucide-react";
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
  status?: "requested" | "approved" | "sending" | "paid" | "failed" | "rejected";
  send_error?: string | null;
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
 * A request is a claim, not a transfer. Approving says the platform agrees it
 * is owed; a second, separate action says money moved. Keeping them apart is
 * what lets an admin approve today and pay later without the provider's screen
 * claiming they have been paid in the meantime.
 *
 * There are two ways to pay, and which one shows depends on how the platform
 * is configured:
 *
 *   • **Send now** — the platform pays it from the Blink USD wallet, over
 *     Lightning or on-chain. Real money leaves when this is pressed, so it
 *     asks first and says the amount and the destination in the question.
 *   • **Mark sent** — the bookkeeping stamp for a transfer made by hand. It is
 *     the only option when Blink sending is off, and stays available as the
 *     escape hatch when it is on.
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

  // Whether this deployment can pay from the wallet at all. A key without the
  // write scope cannot, and offering a button that answers with a config error
  // is worse than not offering it.
  const { data: config } = useQuery({
    queryKey: ["admin-payout-config"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/payouts/config");
      if (error) return { blinkSendEnabled: false };
      return (data ?? { blinkSendEnabled: false }) as { blinkSendEnabled: boolean };
    },
  });
  const canSend = !!config?.blinkSendEnabled;

  const send = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await adminApi(`/admin/payouts/${id}/send`, { method: "POST" });
      if (error) throw new Error(String(error));
      return data as PayoutRow;
    },
    onSuccess: (row) => {
      if (row?.status === "paid") toast.success("Sent");
      else if (row?.status === "sending") toast.success("Sent — still settling at Blink");
      else toast.error(row?.send_error || "Blink refused the payment");
      qc.invalidateQueries({ queryKey: ["admin-payout-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-provider-payouts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not send the payout"),
  });

  const confirmSend = (r: PayoutRow) => {
    // Irreversible, so it is a question and not a click. The amount and the
    // destination are in the question because those are the two things that
    // cannot be taken back if they are wrong.
    const ok = window.confirm(
      `Send ${formatUSD(r.amount_cents)} to ${r.destination}?\n\n` +
      `This pays from the platform's Blink wallet now and cannot be undone.`,
    );
    if (ok) send.mutate(r.id);
  };

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
              {r.send_error && <p className="text-xs text-destructive">{r.send_error}</p>}
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
                <>
                  {canSend && (
                    <Button size="sm" className="gap-1.5 rounded-full"
                      disabled={send.isPending}
                      onClick={() => confirmSend(r)}>
                      <Zap className="h-3.5 w-3.5" /> {send.isPending ? "Sending…" : "Send now"}
                    </Button>
                  )}
                  <Button size="sm" variant={canSend ? "outline" : "default"} className="rounded-full"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, decision: "paid" })}>
                    Mark sent
                  </Button>
                </>
              )}
              {/* In flight at Blink. Not payable again — the server refuses a
                  second send — so there is nothing to press. */}
              {r.status === "sending" && (
                <span className="text-xs font-semibold text-amber-500">Settling…</span>
              )}
              {/* A failure put the money back in the provider's balance, so the
                  way forward is a fresh request with a destination that works,
                  not a retry of this row. */}
              {r.status === "failed" && (
                <Button size="sm" variant="outline" className="rounded-full"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, decision: "rejected" })}>
                  Close it
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
