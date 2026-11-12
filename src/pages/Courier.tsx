import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { MapPin, MessageCircle, Navigation, Package, Store } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { AppContainer } from "@/components/layout/AppContainer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/patterns/Skeleton";
import { QueryError } from "@/components/patterns/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { accountApi } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * /courier — a platform courier's day, on their phone.
 *
 * What is assigned to them (Admin → Delivery → Deliveries), oldest first:
 * where to collect it, where it goes, who to call, and two buttons — "Picked
 * up" (the customer is told it is on the way) and "Delivered". Delivered and
 * failed ones from the last day and a half sit below. Edge routes/delivery.ts
 * only answers for a signed-in account linked to an active courier.
 */

interface Job {
  id: string;
  delivery_status: string;
  delivery_point: { lat: number; lng: number; line?: string; details?: string | null } | null;
  delivered_at: string | null;
  customer_whatsapp: string | null;
  notes: string | null;
  metadata: { plan_name?: string; customer_name?: string } | null;
  created_at: string;
  providers: { name: string; location: string | null; contact_phone: string | null } | null;
  delivery_zones: { name: string } | null;
}

const KEY = ["courier-deliveries"];
const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
const mapsLink = (p: { lat: number; lng: number }) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

export default function Courier() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await accountApi("/courier/deliveries");
      if (error) throw error;
      return data as { courier: { name: string }; open: Job[]; done: Job[] };
    },
    retry: false,
  });
  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await accountApi(`/courier/deliveries/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(v.status === "on_the_way" ? "The customer knows it's on the way" : v.status === "delivered" ? "Delivered" : "Marked as not delivered");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update it"),
  });

  const notCourier = q.isError && /not_a_courier|403/i.test(String((q.error as Error)?.message));

  return (
    <UserLayout title="Deliveries">
      <AppContainer className="max-w-[720px] space-y-3 py-4">
        {q.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
        ) : notCourier ? (
          <YdEmptyState icon={Package} title="This account isn't a courier"
            subtitle="Ask EverySub to link your account in Admin → Delivery → Couriers." />
        ) : q.isError ? (
          <QueryError title="Couldn't load your deliveries" error={q.error as Error} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <p className="text-body text-muted-foreground">
              Hi {q.data!.courier.name} — {q.data!.open.length ? `${q.data!.open.length} to deliver` : "nothing to deliver right now"}.
            </p>
            {q.data!.open.map((j) => (
              <JobCard key={j.id} job={j} busy={move.isPending && move.variables?.id === j.id}
                onMove={(status) => move.mutate({ id: j.id, status })} />
            ))}
            {q.data!.done.length > 0 && (
              <>
                <h2 className="pt-3 text-title font-semibold text-foreground">Done</h2>
                {q.data!.done.map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-3 rounded-radius-md bg-card p-3">
                    <span className="min-w-0 truncate text-body text-foreground">{j.metadata?.plan_name ?? "Order"} · {j.delivery_point?.line ?? "—"}</span>
                    <span className={cn("shrink-0 text-meta font-semibold", j.delivery_status === "failed" ? "text-negative" : "text-positive")}>
                      {j.delivery_status === "failed" ? "Not delivered" : j.delivered_at ? format(new Date(j.delivered_at), "HH:mm") : "Delivered"}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </AppContainer>
    </UserLayout>
  );
}

function JobCard({ job, busy, onMove }: { job: Job; busy: boolean; onMove: (status: string) => void }) {
  const p = job.delivery_point;
  const onTheWay = job.delivery_status === "on_the_way";
  return (
    <section className="space-y-3 rounded-radius-lg bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-title font-semibold text-foreground">{job.metadata?.plan_name ?? "Order"}</p>
          <p className="text-meta text-muted-foreground">
            {[job.delivery_zones?.name, format(new Date(job.created_at), "MMM d, HH:mm")].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold",
          onTheWay ? "bg-primary text-primary-foreground" : "bg-inset text-muted-foreground")}>
          {onTheWay ? "On the way" : "To pick up"}
        </span>
      </div>

      {/* 1 — where to collect it. */}
      <div className="flex items-start gap-3 rounded-radius-md bg-inset p-3">
        <Store className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-body">
          <p className="font-semibold text-foreground">{job.providers?.name ?? "Business"}</p>
          {job.providers?.location && <p className="text-meta text-muted-foreground">{job.providers.location}</p>}
        </div>
        {job.providers?.contact_phone && (
          <a href={waLink(job.providers.contact_phone)} target="_blank" rel="noreferrer" aria-label="Message the business"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-foreground">
            <MessageCircle className="h-5 w-5" />
          </a>
        )}
      </div>

      {/* 2 — where it goes. */}
      <div className="flex items-start gap-3 rounded-radius-md bg-inset p-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-body">
          <p className="font-semibold text-foreground">{p?.line ?? "Pinned location"}</p>
          {p?.details && <p className="text-meta text-foreground">{p.details}</p>}
          <p className="text-meta text-muted-foreground">
            {[job.metadata?.customer_name, job.customer_whatsapp].filter(Boolean).join(" · ")}
          </p>
          {job.notes && <p className="text-meta text-muted-foreground">Note: {job.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {p && (
            <a href={mapsLink(p)} target="_blank" rel="noreferrer" aria-label="Directions"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground">
              <Navigation className="h-5 w-5 fill-current" strokeWidth={0} />
            </a>
          )}
          {job.customer_whatsapp && (
            <a href={waLink(job.customer_whatsapp)} target="_blank" rel="noreferrer" aria-label="Message the customer"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground">
              <MessageCircle className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {onTheWay ? (
          <>
            <Button size="lg" className="flex-1" disabled={busy} onClick={() => onMove("delivered")}>
              {busy && <Spinner size="sm" className="mr-2" />}Delivered
            </Button>
            <Button size="lg" variant="secondary" disabled={busy}
              onClick={() => { if (window.confirm("Mark it as not delivered?")) onMove("failed"); }}>
              Couldn't deliver
            </Button>
          </>
        ) : (
          <Button size="lg" className="flex-1" disabled={busy} onClick={() => onMove("on_the_way")}>
            {busy && <Spinner size="sm" className="mr-2" />}Picked up — on my way
          </Button>
        )}
      </div>
    </section>
  );
}
