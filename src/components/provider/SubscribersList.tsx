import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { StatusPill } from "@/components/patterns/StatusPill";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment } from "@/lib/subscriptionApprove";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { WorkspaceCard, WorkspaceEmpty, WorkspaceSection } from "@/components/provider/WorkspaceUI";

/**
 * Who is subscribed to this business.
 *
 * The three services answered this question with three different screens: two
 * compact card lists written for the workspace, and — for the beach club — a
 * whole admin page with a data table, its own search and its own pagination
 * mounted inside a tab. Same question, same tab, colossally different answer
 * depending on which business an admin happened to open.
 *
 * This is the card list, for the services whose rows need no service-specific
 * verbs. Cleaning and food keep their own for now because theirs carry pause,
 * resume and cancel, which mean different things in each.
 */

export interface SubscriberRow {
  id: string;
  /** What they bought. */
  plan: string;
  customerName: string | null;
  customerEmail: string | null;
  start: string | null;
  end: string | null;
  amountCents: number;
  status: string;
  paymentStatus: string | null;
  /** One line of whatever this service cares about — a headcount, an address. */
  detail?: string | null;
}

export function SubscribersList({ providerId, sourceKey }: {
  providerId: string;
  sourceKey: string;
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [q, setQ] = useState("");
  const KEY = ["provider-subscribers", providerId, sourceKey] as const;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: !!providerId,
    queryFn: () => fetchSubscribers(providerId, sourceKey),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.customerName, r.customerEmail, r.plan].some((v) => (v ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const active = filtered.filter((r) => r.status === "active");
  const rest = filtered.filter((r) => r.status !== "active");

  const approve = async (row: SubscriberRow) => {
    try {
      await approvePayment("beach", row.id, { adminUserId: userData?.id });
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error((e as Error).message || "Could not mark it paid");
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title="Subscribers"
        subtitle={`${rows.length} in total · ${rows.filter((r) => r.status === "active").length} active`}
        action={
          <div className="relative w-[200px] shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="h-9 pl-9"
            />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <WorkspaceCard>
          <WorkspaceEmpty>
            {rows.length === 0 ? "Nobody has subscribed yet." : "Nobody matches that."}
          </WorkspaceEmpty>
        </WorkspaceCard>
      ) : (
        [...active, ...rest].map((r) => (
          <article key={r.id} className="flex items-center gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-semibold leading-[22px] text-foreground">
                  {r.customerName || r.customerEmail || "Customer"}
                </span>
                <StatusPill status={r.status} />
                {isPendingPayment({ payment_status: r.paymentStatus }) && (
                  <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-[12px]"
                    onClick={() => approve(r)}>
                    Mark paid
                  </Button>
                )}
              </div>
              <p className="mt-0.5 text-[14px] leading-[18px] text-muted-foreground">
                {r.plan}
                {r.start && r.end && ` · ${formatDateHN(r.start)} → ${formatDateHN(r.end)}`}
              </p>
              {r.detail && (
                <p className="mt-0.5 text-[14px] leading-[18px] text-muted-foreground">{r.detail}</p>
              )}
            </div>
            <span className="shrink-0 text-[16px] font-semibold tabular-nums text-foreground">
              {formatUSD(r.amountCents)}
            </span>
          </article>
        ))
      )}
    </div>
  );
}

/**
 * Where the subscriptions are. Beach memberships and universal plans both live
 * on `provider_subscriptions`; the difference is only which rows belong to
 * this business.
 */
async function fetchSubscribers(providerId: string, sourceKey: string): Promise<SubscriberRow[]> {
  const isBeach = sourceKey === "beach" || sourceKey === "beach_club";
  let query = supabaseDb
    .from("provider_subscriptions")
    .select("id, user_id, status, payment_status, start_date, end_date, price_cents, metadata, provider_plans(name)")
    .eq("provider_id", providerId)
    .order("start_date", { ascending: false });
  query = isBeach
    ? query.eq("source_service_key", "beach")
    // A universal-only business has no source at all; the rows that carry one
    // belong to a legacy service and are that service's business.
    : query.is("source_service_key", null);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const users = await fetchUsersByIds(rows.map((r) => r.user_id).filter(Boolean));

  return rows.map((r) => {
    const meta = r.metadata ?? {};
    const user = users.get(String(r.user_id));
    const people = Number(meta.people) || 0;
    return {
      id: r.id,
      plan: meta.plan_name ?? r.provider_plans?.name ?? "Subscription",
      customerName: meta.customer_name ?? user?.display_name ?? user?.name ?? null,
      customerEmail: meta.customer_email ?? user?.email ?? null,
      start: r.start_date ?? null,
      end: r.end_date ?? null,
      amountCents: r.price_cents ?? 0,
      status: String(r.status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: people > 1 ? `${people} people` : people === 1 ? "1 person" : null,
    };
  });
}
