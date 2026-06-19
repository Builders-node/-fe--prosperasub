import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Waves } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PaymentMethodBadge } from "@/components/admin/PaymentMethodBadge";
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
  status: string;
  created_at: string;
}

const STATUSES = ["active", "pending", "cancelled"] as const;

const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : "—");

export default function BeachClubSubscriptions() {
  const qc = useQueryClient();

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
      <div className="mb-space-4 flex gap-space-3 text-sm text-muted-foreground">
        <span>{subs.length} total</span>
        <span>·</span>
        <span>{activeCount} active</span>
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
    </SuperAdminLayout>
  );
}
