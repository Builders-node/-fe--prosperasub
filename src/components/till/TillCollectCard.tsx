import { useEffect, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrlFor } from "@/integrations/supabase/config";
import { cn } from "@/lib/utils";

/**
 * At the till, on the staff's phone — no sign-in.
 *
 * Staff scan the customer's subscription QR (it opens /verify). Under the
 * green "who this is" card this shows what that subscription includes today;
 * staff press Get, type the business's till PIN, and the collection is
 * recorded against the business (Edge routes/redeem.ts → /till/*), marked
 * "at the till". The PIN is checked on the server and locks after 5 misses.
 *
 * Renders nothing for a subscription that is not collected at a counter
 * (cleaning) or for the old account-wide code.
 */

interface Item { key: string; label: string; remaining: number | null; total: number | null; available: boolean; note: string | null }
interface Lookup {
  business: { id: string; name: string };
  customer: string;
  hasPin: boolean;
  subscription: { table: string; id: string; planName: string; items: Item[] } | null;
}
interface Done { label: string; planName: string; at: string; customer: string }

const timeHN = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Tegucigalpa" });

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrlFor(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string })?.message || "Something went wrong");
  return data as T;
}

export function TillCollectCard({ token }: { token: string }) {
  const [info, setInfo] = useState<Lookup | null>(null);
  const [picked, setPicked] = useState<Item | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const load = () => post<Lookup>("/till/lookup", { token }).then(setInfo).catch(() => setInfo(null));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info?.subscription) return null;
  const sub = info.subscription;

  const confirm = async () => {
    if (!picked) return;
    setBusy(true); setError(null);
    try {
      const r = await post<Done>("/till/redeem", { token, itemKey: picked.key, pin });
      setDone(r); setPicked(null); setPin("");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record it");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="space-y-3 rounded-radius-lg bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-positive" />
        <p className="text-[24px] font-semibold leading-[30px] text-foreground">{done.label}</p>
        <p className="text-body text-muted-foreground">{done.customer} · {done.planName}</p>
        <p className="text-title font-semibold tabular-nums text-foreground">Recorded at {timeHN(done.at)}</p>
        <Button variant="secondary" className="w-full" onClick={() => setDone(null)}>Done</Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-radius-lg bg-card p-4">
      <div>
        <p className="text-title font-semibold text-foreground">Collect at {info.business.name}</p>
        <p className="text-meta text-muted-foreground">{sub.planName} · today</p>
      </div>
      <ul className="space-y-2">
        {sub.items.map((i) => (
          <li key={i.key} className={cn("rounded-radius-md bg-inset p-3", !i.available && "opacity-70")}>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-foreground">{i.label}</span>
                <span className="block text-meta text-muted-foreground">
                  {i.note ?? (i.remaining != null && i.total != null && i.total > 1 ? `${i.remaining} of ${i.total} left` : "Ready to collect")}
                </span>
              </span>
              {i.key === "none" ? null : !i.available && i.note === "Collected" ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-positive" aria-label="Collected" />
              ) : (
                <Button className="shrink-0" disabled={!i.available || busy}
                  onClick={() => { setPicked(i); setPin(""); setError(null); }}>
                  Get
                </Button>
              )}
            </div>
            {picked?.key === i.key && (
              <div className="mt-3 space-y-2">
                {info.hasPin ? (
                  <>
                    <label htmlFor="till-pin" className="flex items-center gap-1.5 text-meta text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" /> Business PIN
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="till-pin"
                        autoFocus
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={6}
                        placeholder="••••"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) void confirm(); }}
                        className="tracking-[0.4em]"
                      />
                      <Button disabled={pin.length < 4 || busy} loading={busy} onClick={() => void confirm()}>
                        Confirm
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-meta text-muted-foreground">
                    This business hasn't set a till PIN yet — the owner sets it in the workspace under QR codes → At the till.
                  </p>
                )}
                {error && <p className="text-meta font-semibold text-destructive">{error}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
