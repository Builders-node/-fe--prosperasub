import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Waves, Plus, Search, RefreshCcw, Bell, MoreHorizontal, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment } from "@/lib/subscriptionApprove";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { todayHN, addDaysISO, addMonthsISO } from "@/lib/timezone";
import { effectiveBeachStatus } from "@/lib/subscriptionLifecycle";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserPicker } from "@/components/UserPicker";
import { Label } from "@/components/ui/label";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PaymentMethodBadge, PaymentReference } from "@/components/admin/PaymentMethodBadge";
import { supabaseDb, adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";

interface BeachSub {
  id: string;
  user_id: string | null;
  plan_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp?: string | null;
  people: number;
  start_date: string | null;
  end_date: string | null;
  total_cents: number | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  status: string;
  /** end-date-aware — "active" flips to "expired" without waiting for the daily cron */
  effective_status?: string;
  created_at: string;
}

const STATUSES = ["active", "pending", "cancelled"] as const;

const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : "—");

interface BeachPlanOption {
  id: string;
  name: string;
  price_per_person_cents: number;
}

const PAYMENT_METHODS = ["manual", "lightning", "onchain", "infinita", "paypal"] as const;

const emptyForm = {
  plan_id: "",
  user_id: "",
  customer_name: "",
  customer_email: "",
  people: 1,
  start_date: todayHN(),
  payment_method: "manual" as string,
  payment_status: "paid" as string,
  payment_reference: "",
  status: "active" as string,
};

export default function BeachClubSubscriptions({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-beach-club-plan-options"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_plans")
        .select("id, name, price_per_person_cents")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BeachPlanOption[];
    },
  });

  const selectedPlan = plans.find((p) => p.id === form.plan_id);
  const newTotalCents = (selectedPlan?.price_per_person_cents ?? 0) * form.people;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlan) throw new Error("Choose a plan");
      const { error } = await supabaseDb.from("beach_club_subscriptions").insert({
        plan_id: selectedPlan.id,
        plan_name: selectedPlan.name,
        user_id: form.user_id || null,
        customer_name: form.customer_name.trim() || null,
        customer_email: form.customer_email.trim() || null,
        people: form.people,
        start_date: form.start_date,
        end_date: addMonthsISO(form.start_date, 1),
        price_per_person_cents: selectedPlan.price_per_person_cents,
        total_cents: newTotalCents,
        payment_method: form.payment_method,
        payment_status: form.payment_status,
        payment_reference: form.payment_reference.trim() || null,
        status: form.status,
      });
      if (error) throw error;
      // Period history is recorded automatically by a DB trigger.
    },
    onSuccess: () => {
      toast.success("Subscription added");
      qc.invalidateQueries({ queryKey: ["admin-beach-club-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin-beach-club-analytics"] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-beach-club-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Keep raw DB `status` for the Select trigger — shadcn's Select shows a
      // blank if `value` isn't in <SelectItem>s, and "expired" isn't a user-
      // settable state. Effective status lives on `effective_status` for the
      // display badge.
      const today = todayHN();
      return (data ?? []).map((s: BeachSub) => ({
        ...s,
        effective_status: effectiveBeachStatus(s, today),
      })) as BeachSub[];
    },
  });

  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filteredSubs = q
    ? subs.filter((s) => [s.customer_name, s.customer_email, s.customer_whatsapp].some((v) => (v ?? "").toLowerCase().includes(q)))
    : subs;
  const subsPager = usePagination(filteredSubs, 20);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabaseDb
        .from("beach_club_subscriptions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-beach-club-subscriptions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Approve = record an off-platform paid capture WITHOUT sliding end_date.
  // Renew (below) is a different verb — it approves AND extends the period.
  const approveMutation = useMutation({
    mutationFn: async (s: BeachSub) => {
      await approvePayment("beach", s.id, { adminUserId: userData?.id });
    },
    onSuccess: () => {
      toast.success("Payment approved");
      qc.invalidateQueries({ queryKey: ["admin-beach-club-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin-beach-club-analytics"] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renewMutation = useMutation({
    mutationFn: async (s: BeachSub) => {
      // Record an off-platform paid renewal: extend the membership by one month
      // (continuing from the current end date), mark Paid + Manual + active.
      const today = todayHN();
      const prevEnd = (s.end_date || "").slice(0, 10);
      const start = prevEnd && prevEnd >= today ? addDaysISO(prevEnd, 1) : today;
      const end = addMonthsISO(start, 1);
      const { error } = await supabaseDb.from("beach_club_subscriptions")
        .update({
          start_date: start, end_date: end, status: "active",
          payment_status: "paid", payment_method: "manual",
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id);
      if (error) throw error;
      // Period history is recorded automatically by a DB trigger.
    },
    onSuccess: () => {
      toast.success("Renewed — payment recorded");
      qc.invalidateQueries({ queryKey: ["admin-beach-club-subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reminderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await adminApi(`/admin/beach-club/subscriptions/${id}/payment-reminder`, { method: "POST" });
      if (error) throw error;
      return data as { ok: boolean; methods?: string[]; reason?: string };
    },
    onSuccess: (res) => {
      if (res?.ok) toast.success(`Reminder sent${res.methods?.length ? ` (${res.methods.join(", ")})` : ""}`);
      else if (res?.reason === "already_paid") toast.info("Already paid — no reminder needed");
      else if (res?.reason === "no_channel") toast.error("No email/account on file to notify this member");
      else toast.error("Could not send reminder");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remindAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi(`/admin/beach-club/payment-reminders/remind-unpaid`, { method: "POST", body: JSON.stringify({}) });
      if (error) throw error;
      return data as { total: number; sent: number; skipped: number };
    },
    onSuccess: (r) => toast.success(`Reminders: ${r.sent} sent${r.skipped ? `, ${r.skipped} skipped` : ""} (of ${r.total} unpaid)`),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("beach_club_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription removed");
      qc.invalidateQueries({ queryKey: ["admin-beach-club-subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    if (embedded) return <PageLoader />;
    return <SuperAdminLayout title="Beach Club Subscriptions"><PageLoader /></SuperAdminLayout>;
  }

  const activeCount = subs.filter((s) => s.status === "active").length;
  const unpaidCount = subs.filter((s) => s.payment_status !== "paid" && s.status !== "cancelled").length;

  const body = (
    <>
      <div className="mb-space-4 flex flex-wrap items-center justify-between gap-space-3">
        <div className="flex items-center gap-space-3">
          <div className="relative w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="h-9 rounded-full pl-9" />
          </div>
          <div className="hidden gap-space-3 text-sm text-muted-foreground sm:flex">
            <span>{subs.length} total</span>
            <span>·</span>
            <span>{activeCount} active</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unpaidCount > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => remindAllMutation.mutate()} disabled={remindAllMutation.isPending}>
              <Bell className="h-4 w-4" /> Remind unpaid ({unpaidCount})
            </Button>
          )}
          <Button onClick={() => { setForm(emptyForm); setOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add subscription
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--app-divider))]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>People</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSubs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Waves className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {subs.length === 0 ? "No subscriptions yet." : "No members match your search."}
                </TableCell>
              </TableRow>
            ) : subsPager.paged.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <p className="font-bold text-foreground">{s.customer_name || "—"}</p>
                  {s.customer_email && <p className="text-xs text-muted-foreground">{s.customer_email}</p>}
                </TableCell>
                <TableCell className="text-sm">{s.plan_name || "—"}</TableCell>
                <TableCell className="tabular-nums">{s.people}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(s.start_date)} — {fmtDate(s.end_date)}
                </TableCell>
                <TableCell className="font-mono">{formatUSD(s.total_cents ?? 0)}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={s.payment_status === "paid" ? "default" : "secondary"} className="text-xs">
                      {s.payment_status || "—"}
                    </Badge>
                    <PaymentMethodBadge method={s.payment_method} />
                    <PaymentReference method={s.payment_method} reference={s.payment_reference} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Select value={s.status} onValueChange={(status) => statusMutation.mutate({ id: s.id, status })}>
                      <SelectTrigger className="h-8 w-[120px] text-xs font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((st) => (
                          <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {s.effective_status === "expired" && (
                      <Badge className="rounded-full text-[10px] bg-destructive/15 text-destructive">Expired</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="iconSm" variant="ghost" aria-label="More actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {isPendingPayment(s) && s.status !== "cancelled" && (
                          <DropdownMenuItem
                            onSelect={() => approveMutation.mutate(s)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Mark as paid
                          </DropdownMenuItem>
                        )}
                        {isPendingPayment(s) && s.status !== "cancelled" && (
                          <DropdownMenuItem
                            onSelect={() => reminderMutation.mutate(s.id)}
                            disabled={reminderMutation.isPending}
                          >
                            <Bell className="h-4 w-4" /> Send reminder
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => renewMutation.mutate(s)}>
                          <RefreshCcw className="h-4 w-4" /> Renew (payment received)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => deleteMutation.mutate(s.id)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...subsPager} onPage={subsPager.setPage} />
      </div>

      {/* Add subscription dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plan *</Label>
              <Select value={form.plan_id} onValueChange={(v) => setForm((f) => ({ ...f, plan_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatUSD(p.price_per_person_cents)}/person
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Platform user</Label>
              <UserPicker
                value={form.user_id}
                onSelect={(u) => setForm((f) => ({
                  ...f,
                  user_id: u?.id ?? "",
                  customer_name: u ? (u.display_name || u.name || u.email || f.customer_name) : f.customer_name,
                  customer_email: u ? (u.email || f.customer_email) : f.customer_email,
                }))}
                placeholder="Select an existing user…"
                allowClear
                clearLabel="No linked user (manual entry)"
              />
              <p className="mt-1 text-xs text-muted-foreground">Pick a user, or leave unset and type the name below.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Member name</Label>
                <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} placeholder="Full name" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.customer_email} onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))} placeholder="name@email.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>People</Label>
                <Input type="number" min={1} value={form.people}
                  onChange={(e) => setForm((f) => ({ ...f, people: Math.max(1, parseInt(e.target.value || "1")) }))} />
              </div>
              <div>
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Payment method</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m === "infinita" ? "LIVES" : m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment status</Label>
                <Select value={form.payment_status} onValueChange={(v) => setForm((f) => ({ ...f, payment_status: v, status: v === "paid" ? "active" : "pending" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Payment reference (optional)</Label>
              <Input value={form.payment_reference} onChange={(e) => setForm((f) => ({ ...f, payment_reference: e.target.value }))} placeholder="Tx hash / invoice id" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-black tabular-nums text-foreground">{formatUSD(newTotalCents)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.plan_id || createMutation.isPending}>
              {createMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Beach Club Subscriptions" subtitle="Paid memberships from the Beach Club page">
      {body}
    </SuperAdminLayout>
  );
}
