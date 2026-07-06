import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, Pause, Play, X } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { UserPicker } from "@/components/UserPicker";
import { PaymentMethodBadge } from "@/components/admin/PaymentMethodBadge";
import { formatUSD } from "@/lib/pricing";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";

interface Provider { id: string; name: string; }
interface Plan { id: string; provider_id: string; name: string; price_cents: number; }
interface Sub {
  id: string; user_id: string; provider_id: string; plan_id: string | null; status: string;
  price_cents: number; customer_name: string | null; customer_whatsapp: string | null;
  payment_status: string | null; payment_method: string | null; started_at: string | null; created_at: string;
}
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-orange-500/15 text-orange-400", active: "bg-green-500/15 text-green-400",
  paused: "bg-yellow-500/15 text-yellow-400", cancelled: "bg-muted text-muted-foreground",
};
const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" }, { value: "lightning", label: "Lightning" },
  { value: "onchain", label: "On-chain BTC" }, { value: "crypto", label: "LIVES" }, { value: "paypal", label: "PayPal" },
];
const EMPTY = { user_id: "", customer_name: "", customer_whatsapp: "", provider_id: "", plan_id: "", price_cents: 0, status: "active", payment_status: "paid", payment_method: "cash", started_at: new Date().toISOString().split("T")[0] };

const MassageSubscriptions = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [search, setSearch] = useState("");

  const { data: providers = [] } = useQuery({ queryKey: ["admin-massage-providers-min"], queryFn: async () => { const { data } = await supabaseDb.from("massage_providers").select("id, name").order("sort_order"); return (data ?? []) as Provider[]; } });
  const { data: plans = [] } = useQuery({ queryKey: ["admin-massage-plans-all"], queryFn: async () => { const { data } = await supabaseDb.from("massage_plans").select("id, provider_id, name, price_cents"); return (data ?? []) as Plan[]; } });
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-massage-subscriptions"],
    queryFn: async () => { const { data, error } = await supabaseDb.from("massage_subscriptions").select("*").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as Sub[]; },
  });

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? "—";
  const planName = (id: string | null) => plans.find((p) => p.id === id)?.name ?? "—";
  const q = search.trim().toLowerCase();
  const visible = q ? subs.filter((s) => [s.customer_name, s.customer_whatsapp, providerName(s.provider_id), planName(s.plan_id)].some((v) => (v ?? "").toLowerCase().includes(q))) : subs;

  const plansForProvider = (pid: string) => plans.filter((p) => p.provider_id === pid);

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: form.user_id || userData!.id, provider_id: form.provider_id, plan_id: form.plan_id || null,
        customer_name: form.customer_name.trim() || null, customer_whatsapp: form.customer_whatsapp.trim() || null,
        price_cents: form.price_cents, status: form.status, payment_status: form.payment_status,
        payment_method: form.payment_method || null, started_at: form.started_at || null,
      };
      if (!payload.provider_id) throw new Error("Pick a provider");
      const { data, error } = await supabaseDb.from("massage_subscriptions").insert(payload).select("id").single();
      if (error) throw error; await logAuditEvent(userData!.id, "create", "massage_subscription", data.id, payload);
    },
    onSuccess: () => { toast.success("Subscription created"); qc.invalidateQueries({ queryKey: ["admin-massage-subscriptions"] }); setOpen(false); setForm({ ...EMPTY }); },
    onError: (e: any) => toast.error(e?.message || "Could not create"),
  });

  const action = useMutation({
    mutationFn: async ({ s, status }: { s: Sub; status: string }) => { const { error } = await supabaseDb.from("massage_subscriptions").update({ status, updated_at: new Date().toISOString() }).eq("id", s.id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-massage-subscriptions"] }); },
    onError: (e: any) => toast.error(e?.message),
  });

  const onPlan = (planId: string) => { const p = plans.find((x) => x.id === planId); setForm((f) => ({ ...f, plan_id: planId, price_cents: p?.price_cents ?? f.price_cents })); };

  return (
    <SuperAdminLayout title="Massage — Subscriptions">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-black tracking-tight">Subscriptions</h1><p className="mt-1 text-sm text-muted-foreground">Massage memberships</p></div>
          <Button onClick={() => { setForm({ ...EMPTY }); setOpen(true); }} className="gap-2 rounded-full" disabled={providers.length === 0}><Plus className="h-4 w-4" /> New Subscription</Button>
        </div>

        <AdminListShell
          search={search} onSearch={setSearch} searchPlaceholder="Search by name, provider, plan…"
          isLoading={isLoading} isEmpty={subs.length === 0} isNoResults={subs.length > 0 && visible.length === 0} count={visible.length}
          emptyTitle="No subscriptions yet" emptySubtitle="Create one manually." onClearFilters={() => setSearch("")}
        >
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Provider</TableHead><TableHead>Plan</TableHead><TableHead>Price</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {visible.map((s) => {
                  const paid = (s.payment_status ?? "paid") === "paid" && (s.status === "active" || s.status === "paused");
                  return (
                    <TableRow key={s.id} className="[&>td]:py-2.5">
                      <TableCell><p className="text-sm font-semibold text-foreground">{s.customer_name ?? s.user_id.slice(0, 8) + "…"}</p>{s.customer_whatsapp && <p className="text-xs text-muted-foreground">{s.customer_whatsapp}</p>}</TableCell>
                      <TableCell className="text-sm">{providerName(s.provider_id)}</TableCell>
                      <TableCell className="text-sm">{planName(s.plan_id)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatUSD(s.price_cents)}</TableCell>
                      <TableCell>{paid ? <div className="flex items-center gap-1.5"><span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">Paid</span><PaymentMethodBadge method={s.payment_method} /></div> : <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-400">Unpaid</span>}</TableCell>
                      <TableCell><Badge className={`rounded-full text-xs ${STATUS_COLORS[s.status] ?? ""}`}>{s.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {s.status === "pending" && <Button size="sm" className="gap-1 rounded-full bg-green-600 text-white hover:bg-green-600/90" onClick={() => action.mutate({ s, status: "active" })}><Check className="h-3.5 w-3.5" /> Approve</Button>}
                          {s.status === "active" && <Button size="sm" variant="outline" className="gap-1 rounded-full" onClick={() => action.mutate({ s, status: "paused" })}><Pause className="h-3.5 w-3.5" /> Pause</Button>}
                          {s.status === "paused" && <Button size="sm" variant="outline" className="gap-1 rounded-full" onClick={() => action.mutate({ s, status: "active" })}><Play className="h-3.5 w-3.5" /> Resume</Button>}
                          {s.status !== "cancelled" && <Button size="sm" variant="ghost" className="gap-1 rounded-full text-destructive hover:text-destructive" onClick={() => action.mutate({ s, status: "cancelled" })}><X className="h-3.5 w-3.5" /> Cancel</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </AdminListShell>

        <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Subscription</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Provider *</Label>
                <Select value={form.provider_id} onValueChange={(v) => setForm((f) => ({ ...f, provider_id: v, plan_id: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Plan</Label>
                <Select value={form.plan_id || "_none"} onValueChange={(v) => onPlan(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent><SelectItem value="_none">No specific plan</SelectItem>{plansForProvider(form.provider_id).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {formatUSD(p.price_cents)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
                <div><Label>Platform user</Label><UserPicker value={form.user_id} onSelect={(u) => setForm((f) => ({ ...f, user_id: u?.id ?? "", customer_name: u ? (u.display_name || u.name || u.email || f.customer_name) : f.customer_name }))} placeholder="Select user…" allowClear clearLabel="No linked user" /></div>
                <div><Label>Full Name</Label><Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} /></div>
                <div><Label>WhatsApp</Label><Input type="tel" value={form.customer_whatsapp} onChange={(e) => setForm((f) => ({ ...f, customer_whatsapp: e.target.value }))} placeholder="+504 1234 5678" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Price ($)</Label><Input type="number" min={0} step={0.01} value={(form.price_cents / 100).toFixed(2)} onChange={(e) => setForm((f) => ({ ...f, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))} /></div>
                <div><Label>Start date</Label><Input type="date" value={form.started_at} onChange={(e) => setForm((f) => ({ ...f, started_at: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem></SelectContent></Select></div>
                <div><Label>Payment</Label><Select value={form.payment_status} onValueChange={(v) => setForm((f) => ({ ...f, payment_status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="pending">Unpaid</SelectItem></SelectContent></Select></div>
                <div><Label>Method</Label><Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.provider_id || create.isPending}>{create.isPending && <Spinner size="sm" className="mr-2" />}Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminLayout>
  );
};

export default MassageSubscriptions;
