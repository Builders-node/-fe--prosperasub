import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Store } from "lucide-react";
import { toast } from "sonner";

import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { accountApi } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { tr, trx, DATE_LOCALE } from "@/lib/tr";

/**
 * `/redeem/:providerId` — what opens when a subscriber scans a business's
 * till QR (components/provider/TillQrCard).
 *
 * Only that business: the person's active subscriptions there, what each
 * includes today and how much is left, and a Get button per item. The server
 * (Edge routes/redeem.ts) re-checks everything; a press records a collection
 * the business sees on its Schedule. After a press the screen is a big tick
 * with the time — something to show the cashier.
 */

interface Item { key: string; label: string; remaining: number | null; total: number | null; available: boolean; note: string | null }
interface Sub { table: string; id: string; planName: string; endDate: string | null; items: Item[] }
interface Info { business: { id: string; name: string; avatar: string | null }; day: string; subscriptions: Sub[] }
interface Collected { label: string; planName: string; business: string; at: string }

const timeHN = (iso: string) =>
  new Date(iso).toLocaleTimeString(DATE_LOCALE, { hour: "numeric", minute: "2-digit", timeZone: "America/Tegucigalpa" });

export default function Redeem() {
  const { providerId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [done, setDone] = useState<Collected | null>(null);
  const here = `/redeem/${providerId}`;

  const infoQ = useQuery({
    queryKey: ["redeem", providerId],
    enabled: !!user && !!providerId,
    retry: false,
    queryFn: async (): Promise<Info> => {
      const { data, error } = await accountApi(`/redeem/${encodeURIComponent(providerId)}`);
      if (error) throw error;
      return data as Info;
    },
  });

  const get = useMutation({
    mutationFn: async (v: { table: string; subscriptionId: string; itemKey: string }) => {
      const { data, error } = await accountApi(`/redeem/${encodeURIComponent(providerId)}`, {
        method: "POST", body: JSON.stringify(v),
      });
      if (error) throw error;
      return data as Collected;
    },
    onSuccess: (r) => { setDone(r); void qc.invalidateQueries({ queryKey: ["redeem", providerId] }); },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : tr("Could not collect it"));
      void qc.invalidateQueries({ queryKey: ["redeem", providerId] });
    },
  });

  const info = infoQ.data;
  let body: React.ReactNode;
  if (authLoading) {
    body = <PageLoader />;
  } else if (!user) {
    body = (
      <section className="space-y-4 rounded-radius-lg bg-card p-4 text-center">
        <Store className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="text-title font-semibold text-foreground">{tr("Log in to collect")}</p>
        <p className="text-body text-muted-foreground">{tr("We'll show what your subscription here includes today.")}</p>
        <Button size="lg" className="w-full" onClick={() => openAuthModal("login", here)}>{tr("Log in")}</Button>
      </section>
    );
  } else if (infoQ.isLoading) {
    body = <PageLoader />;
  } else if (infoQ.isError || !info) {
    body = (
      <section className="rounded-radius-lg bg-card p-6 text-center">
        <p className="text-title font-semibold text-foreground">{tr("This code doesn't work")}</p>
        <p className="mt-1 text-body text-muted-foreground">
          {infoQ.error instanceof Error ? infoQ.error.message : tr("Ask the staff for help.")}
        </p>
      </section>
    );
  } else if (done) {
    body = (
      <section className="space-y-3 rounded-radius-lg bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-positive" />
        <p className="text-[28px] font-semibold leading-[34px] text-foreground">{done.label}</p>
        <p className="text-body text-muted-foreground">{done.planName} · {done.business}</p>
        <p className="text-title font-semibold tabular-nums text-foreground">{trx("Collected at {timeHN}", { timeHN: timeHN(done.at) })}</p>
        <p className="text-meta text-muted-foreground">{tr("Show this screen at the till.")}</p>
        <Button variant="secondary" className="w-full" onClick={() => setDone(null)}>{tr("Done")}</Button>
      </section>
    );
  } else if (info.subscriptions.length === 0) {
    body = (
      <section className="space-y-3 rounded-radius-lg bg-card p-6 text-center">
        <p className="text-title font-semibold text-foreground">{trx("No active subscription at {name}", { name: info.business.name })}</p>
        <p className="text-body text-muted-foreground">{tr("If you paid for one, check My subscriptions — it may still be pending.")}</p>
        <Button variant="secondary" className="w-full" onClick={() => navigate("/my-subscriptions")}>{tr("My subscriptions")}</Button>
      </section>
    );
  } else {
    body = (
      <div className="space-y-2">
        {info.subscriptions.map((s) => (
          <section key={`${s.table}:${s.id}`} className="space-y-3 rounded-radius-lg bg-card p-4">
            <div>
              <p className="text-title font-semibold text-foreground">{s.planName}</p>
              {s.endDate && <p className="text-meta text-muted-foreground">{trx("Active until {endDate}", { endDate: s.endDate })}</p>}
            </div>
            <ul className="space-y-2">
              {s.items.map((i) => (
                <li key={i.key} className={cn("flex items-center gap-3 rounded-radius-md bg-inset p-3", !i.available && "opacity-70")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold text-foreground">{i.label}</span>
                    <span className="block text-meta text-muted-foreground">
                      {i.note ?? (i.remaining != null && i.total != null && i.total > 1 ? `${i.remaining} of ${i.total} left` : tr("Ready to collect"))}
                    </span>
                  </span>
                  {i.key !== "none" && !i.available && i.note === "Collected" ? (
                    // Already taken today: a tick, not a dead button.
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-positive" aria-label={tr("Collected")} />
                  ) : i.key !== "none" && (
                    <Button
                      className="shrink-0"
                      disabled={!i.available || get.isPending}
                      loading={get.isPending && get.variables?.itemKey === i.key && get.variables?.subscriptionId === s.id}
                      onClick={() => get.mutate({ table: s.table, subscriptionId: s.id, itemKey: i.key })}
                    >{tr("Get")}</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <UserLayout title={info ? info.business.name : tr("Collect")} allowGuest showBottomNav={false}>
      <div className="mx-auto max-w-[480px] py-4">{body}</div>
    </UserLayout>
  );
}
