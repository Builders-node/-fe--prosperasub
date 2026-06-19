import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Waves, Plus } from "lucide-react";
import { addMonths, format } from "date-fns";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PaymentMethodBadge, PaymentReference } from "@/components/admin/PaymentMethodBadge";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";

interface BeachSub {
  id: string;
  plan_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  people: number;
  start_date: string | null;
  end_date: string | null;
  total_cents: number | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  status: string;
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
  customer_name: "",
  customer_email: "",
  people: 1,
  start_date: format(new Date(), "yyyy-MM-dd"),
  payment_method: "manual" as string,
  payment_status: "paid" as string,
  payment_reference: "",
  status: "active" as string,
};

export default function BeachClubSubscriptions() {
  const qc = useQueryClient();
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
      const end = addMonths(new Date(`${form.start_date}T00:00:00`), 1);
      const { error } = await supabaseDb.from("beach_club_subscriptions").insert({
        plan_id: selectedPlan.id,
        plan_name: selectedPlan.name,
        customer_name: form.customer_name.trim() || null,
        customer_email: form.customer_email.trim() || null,
        people: form.people,
        start_date: form.start_date,
        end_date: format(end, "yyyy-MM-dd"),
        price_per_person_cents: selectedPlan.price_per_person_cents,
        total_cents: newTotalCents,
        payment_method: form.payment_method,
        payment_status: form.payment_status,
        payment_reference: form.payment_reference.trim() || null,
        status: form.status,
      });
      if (error) throw error;
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
      return (data ?? []) as BeachSub[];
    },
  });

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
    return <SuperAdminLayout title="Beach Club Subscriptions"><PageLoader /></SuperAdminLayout>;
  }

  const activeCount = subs.filter((s) => s.status === "active").length;

  return (
    <SuperAdminLayout title="Beach Club Subscriptions" subtitle="Paid memberships from the Beach Club page">
      <div className="mb-space-4 flex flex-wrap items-center justify-between gap-space-3">
        <div className="flex gap-space-3 text-sm text-muted-foreground">
          <span>{subs.length} total</span>
          <span>·</span>
          <span>{activeCount} active</span>
        </div>
        <Button onClick={() => { setForm(emptyForm); setOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add subscription
        </Button>
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
            {subs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Waves className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No subscriptions yet.
                </TableCell>
              </TableRow>
            ) : subs.map((s) => (
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
                </TableCell>
                <TableCell className="text-right">
                  <Button size="iconSm" variant="ghost" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title="Delete" onClick={() => deleteMutation.mutate(s.id)}>
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
                      <SelectItem key={m} value={m} className="capitalize">{m === "infinita" ? "LIVES (Infinita)" : m}</SelectItem>
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
    </SuperAdminLayout>
  );
}
