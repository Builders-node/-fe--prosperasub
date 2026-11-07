import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { accountApi, adminApi, supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { QueryError } from "@/components/patterns/QueryError";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The confirmation for every money action on this panel. They were
 * `window.confirm` — the platform's most consequential clicks answered by the
 * browser's own grey box, on a codebase that already replaced that pattern
 * everywhere else (see CleaningPlans). Same question, asked in the product's
 * own dialog.
 */
function ConfirmMoneyDialog({ open, onOpenChange, title, description, actionLabel, onConfirm, destructive }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : undefined} onClick={onConfirm}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Recording money sent to a provider.
 *
 * The counterpart of the provider's own Money tab: what an admin writes here is
 * exactly what a provider reads there, and "owed" is earned minus these rows.
 * Nothing else on the platform writes them — there is no automatic settlement,
 * and pretending otherwise by inferring payouts from payments would produce a
 * number nobody had actually sent.
 *
 * The tab is built around one question — who do we owe — so the owed table
 * comes first and is always there, empty or not. Recording a payment starts
 * from a row of it, with the amount already filled in.
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

interface PayoutProvider {
  id: string;
  name: string;
  archetype_key: string | null;
  status: string | null;
}

/** Every query a payout write can change — one list, so no write forgets one. */
const PAYOUT_KEYS = [
  ["admin-provider-payouts"],
  ["provider-payouts"],
  ["admin-payout-outstanding"],
  ["admin-payout-requests"],
  ["provider-payout-available"],
] as const;

export function ProviderPayoutsPanel() {
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState("");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [method, setMethod] = useState("lightning");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const invalidateAll = () => PAYOUT_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] }));

  // Every business, inactive ones included: switching a business off does not
  // cancel what it is owed, and the money still has to be recorded somewhere.
  const { data: providers = [] } = useQuery({
    queryKey: ["payout-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, archetype_key, status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PayoutProvider[];
    },
  });

  const { data: payouts = [], isLoading, isError, error, refetch } = useQuery({
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

  /** From a row of the owed table: pick the business, fill the amount, go to the form. */
  const startRecord = (id: string, owedCents: number) => {
    setProviderId(id);
    setAmount((owedCents / 100).toFixed(2));
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      amountRef.current?.focus({ preventScroll: true });
    });
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
      invalidateAll();
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
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't remove the payout"),
  });

  // Deleting a ledger row hands that amount back to the business's balance —
  // they could withdraw it again. That is a question, not a click.
  const [removeTarget, setRemoveTarget] = useState<PayoutRow | null>(null);

  const total = payouts.reduce((s, p) => s + Number(p.amount_cents || 0), 0);
  const selected = providers.find((p) => p.id === providerId);

  return (
    <div className="space-y-space-4">
      <OwedBalances onRecord={startRecord} />
      <PayoutRequestQueue providers={providers} />

      <div ref={formRef} className="scroll-mt-space-4 rounded-radius-lg bg-card p-space-4">
        <h3 className="text-panel-title">Record a payout</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          For money sent outside the platform's own Send button — a bank transfer, cash, a hand-made
          Lightning payment. Pick the business to see its ledger.
        </p>
        <Label htmlFor="payout-business" className="mt-space-3 block">Business</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger id="payout-business" className="mt-1.5 max-w-md"><SelectValue placeholder="Pick a business" /></SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.archetype_key ? ` · ${p.archetype_key}` : ""}{p.status !== "active" ? " · inactive" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {providerId && (
        <>
          <div className="grid gap-space-4 rounded-radius-lg bg-card p-space-4 md:grid-cols-3">
            <div>
              <Label htmlFor="payout-amount">Amount (USD)</Label>
              <Input id="payout-amount" ref={amountRef} inputMode="decimal" placeholder="0.00"
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
                {create.isPending ? "Recording…" : `Record payout${selected ? ` to ${selected.name}` : ""}`}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                This records money that already left — nothing is sent. Leave the period empty for an
                ad-hoc transfer. The provider sees it immediately, and it stops counting against what
                they're owed.
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
            ) : isError ? (
              /* This is a payment history. "Nothing paid yet" when the request
                 failed is not a blank screen, it is a wrong statement about
                 money — and the next decision made here is whether to pay
                 again. */
              <div className="mt-3">
                <QueryError
                  compact
                  title="Couldn't load payouts"
                  error={error as Error}
                  onRetry={() => void refetch()}
                />
              </div>
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
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Delete the ${formatUSD(p.amount_cents)} payout record`}
                      title="Delete this record"
                      onClick={() => setRemoveTarget(p)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ConfirmMoneyDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title={removeTarget ? `Delete the ${formatUSD(removeTarget.amount_cents)} payout record?` : ""}
        description={
          "This removes the record only — no money moves back.\n" +
          "The amount returns to the business's balance, so they could withdraw it again. " +
          "Delete it only if it was recorded by mistake."
        }
        actionLabel="Delete record"
        destructive
        onConfirm={() => {
          if (removeTarget) remove.mutate(removeTarget.id);
          setRemoveTarget(null);
        }}
      />
    </div>
  );
}


interface OwedRow {
  providerId: string;
  name: string;
  /** Authoritative: what /admin/payouts/outstanding says the business may withdraw. */
  owedCents: number;
  commissionPct: number;
  /** Its share of all-time revenue, after commission. Null if the figure couldn't be read. */
  earnedCents: number | null;
  /** Paid, plus requests approved or in flight — everything that counts against earned. */
  paidCents: number | null;
}

/**
 * Who do we owe, and how much.
 *
 * Always on screen, and first on the tab. It used to be a card that hid itself
 * when nothing was outstanding — which looks exactly like a card that never
 * loaded, on the one screen where the difference matters.
 *
 * "Owed" is the server's figure — earned minus everything paid, requested or
 * in flight, the same cap the provider's own Withdraw button is held to. The
 * Earned and Paid columns come from that same calculation, per business, so
 * the three always add up.
 *
 * Two ways to clear a row:
 *   • **Record payout** — opens the form below with the owed amount filled in,
 *     for a payment already made by hand (any amount, any method).
 *   • **Record full balance** — the settlement: one paid row for exactly what
 *     is owed, marked as settled outside the platform. For history paid before
 *     the platform could pay, or a business paid in cash.
 * Neither sends money. Sending is the request queue's job.
 */
function OwedBalances({ onRecord }: { onRecord: (providerId: string, owedCents: number) => void }) {
  const qc = useQueryClient();

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-payout-outstanding"],
    staleTime: 60_000,
    queryFn: async (): Promise<OwedRow[]> => {
      const { data, error } = await adminApi("/admin/payouts/outstanding");
      if (error) throw new Error(String(error));
      // The server lists every business — inactive ones too — with anything owed.
      const owed = (Array.isArray(data) ? data : []) as Array<{
        providerId: string; name: string; availableCents: number; commissionPct: number;
      }>;
      // Earned and paid, from the same summary the provider's Money tab reads.
      // A super admin may read any business's. A failure there only blanks the
      // two context columns — "owed" above is already the server's answer.
      return Promise.all(owed.map(async (r) => {
        let earnedCents: number | null = null;
        let paidCents: number | null = null;
        try {
          const { data: s, error: sErr } = await accountApi(`/account/providers/${r.providerId}/payouts/available`);
          if (!sErr && s) {
            earnedCents = Number((s as any).earnedCents);
            paidCents = Number((s as any).committedCents);
            if (!Number.isFinite(earnedCents)) earnedCents = null;
            if (!Number.isFinite(paidCents)) paidCents = null;
          }
        } catch { /* context only */ }
        return {
          providerId: r.providerId,
          name: r.name,
          owedCents: Number(r.availableCents) || 0,
          commissionPct: Number(r.commissionPct) || 0,
          earnedCents,
          paidCents,
        };
      }));
    },
  });

  const settle = useMutation({
    mutationFn: async (providerId: string) => {
      const { data, error } = await adminApi(`/admin/providers/${providerId}/payouts/settle`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (error) throw new Error(String(error));
      return data;
    },
    onSuccess: () => {
      toast.success("Recorded — the balance starts from here");
      PAYOUT_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] }));
    },
    onError: (e: any) => toast.error(e?.message || "Could not record the balance"),
  });

  const [settleTarget, setSettleTarget] = useState<OwedRow | null>(null);

  const total = rows.reduce((s, r) => s + r.owedCents, 0);
  const sum = (pick: (r: OwedRow) => number | null) =>
    rows.some((r) => pick(r) == null) ? null : rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
  const money = (v: number | null) => (v == null ? "—" : formatUSD(v));

  return (
    <section className="rounded-radius-lg bg-card p-space-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-panel-title">Owed to businesses</h3>
        {!isLoading && !isError && (
          <span className="text-base font-black tabular-nums text-foreground">{formatUSD(total)}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        What each business could withdraw right now: its share of revenue after commission, minus
        everything already paid or on its way.
      </p>

      {isError ? (
        // Hiding on failure would make money that is owed read as money that
        // is not. Say the figures could not be fetched.
        <div className="mt-space-3">
          <QueryError
            compact
            title="Couldn't load what is owed"
            error={error}
            onRetry={() => void refetch()}
          />
        </div>
      ) : isLoading ? (
        <p className="mt-space-3 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-space-3 rounded-radius-md bg-[hsl(var(--app-control))] p-space-6 text-center text-muted-foreground">
          Nothing is owed — every business has been paid everything it has earned.
        </p>
      ) : (
        <div className="mt-space-3 overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead className="py-2 pr-4">Business</TableHead>
                <TableHead className="px-3 py-2 text-right">Earned</TableHead>
                <TableHead className="px-3 py-2 text-right" title="Paid, plus requests approved or in flight">Paid</TableHead>
                <TableHead className="px-3 py-2 text-right">Owed</TableHead>
                <TableHead className="pl-3 py-2 text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.providerId} className="border-b border-border/40">
                  <TableCell className="py-2.5 pr-4">
                    <p className="font-semibold text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">after {r.commissionPct}% commission</p>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.earnedCents)}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.paidCents)}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground">{formatUSD(r.owedCents)}</TableCell>
                  <TableCell className="pl-3 py-2.5">
                    <div className="flex justify-end gap-space-2">
                      <Button size="sm" variant="secondary" onClick={() => onRecord(r.providerId, r.owedCents)}>
                        Record payout
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={settle.isPending}
                        // A ledger write, not a transfer — but it changes what a
                        // provider can ask for, so it asks before it happens.
                        onClick={() => setSettleTarget(r)}
                      >
                        Record full balance
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="border-t border-border text-foreground">
                <TableCell className="py-2.5 pr-4 font-bold">Total</TableCell>
                <TableCell className="px-3 py-2.5 text-right font-bold tabular-nums">{money(sum((r) => r.earnedCents))}</TableCell>
                <TableCell className="px-3 py-2.5 text-right font-bold tabular-nums">{money(sum((r) => r.paidCents))}</TableCell>
                <TableCell className="px-3 py-2.5 text-right font-black tabular-nums text-primary">{formatUSD(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
          <p className="mt-space-2 text-xs text-muted-foreground">
            Paid includes requests approved or still settling. Recording does not send money — the
            Send button on a payout request does.
          </p>
        </div>
      )}

      <ConfirmMoneyDialog
        open={!!settleTarget}
        onOpenChange={(open) => { if (!open) setSettleTarget(null); }}
        title={settleTarget ? `Record ${formatUSD(settleTarget.owedCents)} paid to ${settleTarget.name}?` : ""}
        description={
          "No money moves. This records the whole balance as already paid outside the platform, " +
          "so what they can withdraw drops to zero and grows again only from new revenue."
        }
        actionLabel="Record full balance"
        onConfirm={() => {
          if (settleTarget) settle.mutate(settleTarget.providerId);
          setSettleTarget(null);
        }}
      />
    </section>
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

  const { data: requests = [], isLoading, isError, error, refetch } = useQuery({
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
      if (error) return { blinkSendEnabled: false, walletBalanceCents: null };
      return (data ?? { blinkSendEnabled: false, walletBalanceCents: null }) as {
        blinkSendEnabled: boolean; walletBalanceCents: number | null;
      };
    },
  });
  const canSend = !!config?.blinkSendEnabled;
  const walletCents = config?.walletBalanceCents ?? null;

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
      PAYOUT_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] }));
    },
    onError: (e: any) => toast.error(e?.message || "Could not send the payout"),
  });

  // Irreversible, so it is a question and not a click. The amount and the
  // destination are in the question because those are the two things that
  // cannot be taken back if they are wrong.
  const [sendTarget, setSendTarget] = useState<PayoutRow | null>(null);
  const confirmSend = (r: PayoutRow) => setSendTarget(r);

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
      PAYOUT_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] }));
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the request"),
  });

  if (isError) {
    return (
      <QueryError
        compact
        title="Couldn't load payout requests"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }
  if (isLoading || requests.length === 0) return null;

  return (
    <div className="rounded-radius-lg bg-card p-space-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Payout requests ({requests.length})
        </p>
        {/* Payouts leave the USD wallet, and on-chain receipts land in the BTC
            one beside it — so this can run dry on a healthy week. Better an
            admin sees it here than a provider finds it at the button. */}
        {canSend && walletCents !== null && (
          <p className="text-xs text-muted-foreground">
            Wallet: <span className="font-semibold tabular-nums text-foreground">{formatUSD(walletCents)}</span>
          </p>
        )}
      </div>
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
                  <Button size="sm" variant="outline"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, decision: "rejected" })}>
                    Reject
                  </Button>
                  <Button size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, decision: "approved" })}>
                    Approve
                  </Button>
                </>
              )}
              {r.status === "approved" && (
                <>
                  {canSend && (
                    <Button size="sm" className="gap-1.5"
                      disabled={send.isPending}
                      onClick={() => confirmSend(r)}>
                      <Zap className="h-3.5 w-3.5" /> {send.isPending ? "Sending…" : "Send now"}
                    </Button>
                  )}
                  <Button size="sm" variant={canSend ? "outline" : "default"}
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, decision: "paid" })}>
                    Mark sent
                  </Button>
                </>
              )}
              {/* In flight at Blink. Not payable again — the server refuses a
                  second send — so there is nothing to press. */}
              {r.status === "sending" && (
                <span className="text-xs font-semibold text-attention">Settling…</span>
              )}
              {/* A failure put the money back in the provider's balance, so the
                  way forward is a fresh request with a destination that works,
                  not a retry of this row. */}
              {r.status === "failed" && (
                <Button size="sm" variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, decision: "rejected" })}>
                  Close it
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmMoneyDialog
        open={!!sendTarget}
        onOpenChange={(open) => { if (!open) setSendTarget(null); }}
        title={sendTarget ? `Send ${formatUSD(sendTarget.amount_cents)} to ${sendTarget.destination}?` : ""}
        description={"This pays from the platform's Blink wallet now and cannot be undone."}
        actionLabel="Send now"
        onConfirm={() => {
          if (sendTarget) send.mutate(sendTarget.id);
          setSendTarget(null);
        }}
      />
    </div>
  );
}
