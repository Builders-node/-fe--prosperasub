import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldAlert, Sparkles, UtensilsCrossed, Car, Waves } from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const API_URL = (import.meta.env.VITE_API_URL as string)?.trim() || "https://api.prosperasub.com";

type AccessStatus = "active" | "trial" | "pending" | "expired" | "canceled";

interface Subscription {
  id: string;
  service: "cleaning" | "food" | "beach_club" | "car_rental";
  name: string;
  status: AccessStatus;
  expires_at: string | null;
}

interface VerifyResult {
  ok: boolean;
  allowed: boolean;
  reason: string;
  user: { id: string; name: string; avatar_url: string | null } | null;
  subscriptions: Subscription[];
}

const SERVICE_ICON: Record<Subscription["service"], typeof Sparkles> = {
  cleaning: Sparkles,
  food: UtensilsCrossed,
  beach_club: Waves,
  car_rental: Car,
};

const SERVICE_LABEL: Record<Subscription["service"], string> = {
  cleaning: "Cleaning",
  food: "Food",
  beach_club: "Beach Club",
  car_rental: "Car Rental",
};

const STATUS_STYLE: Record<AccessStatus, { dot: string; text: string; label: string }> = {
  active: { dot: "bg-emerald-500", text: "text-emerald-600", label: "Active" },
  trial: { dot: "bg-amber-500", text: "text-amber-600", label: "Trial" },
  pending: { dot: "bg-sky-500", text: "text-sky-600", label: "Pending" },
  expired: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Expired" },
  canceled: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Canceled" },
};

export default function VerifyAccess() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token) {
        setFailed(true);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/verify-access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as VerifyResult;
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return <PageLoader />;

  // Network failure / missing token.
  if (failed || !result) {
    return (
      <Shell>
        <StatusBanner allowed={false} invalid title="Invalid QR code" subtitle="This code is missing or could not be read." />
      </Shell>
    );
  }

  const invalid = !result.ok && !result.user;
  const allowed = result.allowed;

  return (
    <Shell>
      <StatusBanner
        allowed={allowed}
        invalid={invalid}
        title={invalid ? "Invalid QR code" : allowed ? "Access granted" : "No access"}
        subtitle={result.reason}
      />

      {result.user && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <Avatar name={result.user.name} src={result.user.avatar_url} />
          <p className="text-xl font-black text-foreground">{result.user.name}</p>
        </div>
      )}

      {result.user && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Subscriptions · {result.subscriptions.length}
          </p>
          {result.subscriptions.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No subscriptions on file
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border/60">
              {result.subscriptions.map((s) => {
                const Icon = SERVICE_ICON[s.service];
                const style = STATUS_STYLE[s.status];
                return (
                  <div key={`${s.service}-${s.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {SERVICE_LABEL[s.service]}
                        {s.expires_at && s.status !== "pending" && (
                          <> · {s.status === "expired" || s.status === "canceled" ? "Ended" : "Until"} {new Date(s.expires_at).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                    <span className={cn("flex shrink-0 items-center gap-1.5 text-xs font-bold", style.text)}>
                      <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                      {style.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [broken, setBroken] = useState(false);
  const initials = name.charAt(0).toUpperCase();
  if (!src || broken) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-2xl font-black text-muted-foreground">
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-20 w-20 rounded-full object-cover"
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}

function StatusBanner({
  allowed,
  invalid,
  title,
  subtitle,
}: {
  allowed: boolean;
  invalid?: boolean;
  title: string;
  subtitle: string;
}) {
  const Icon = invalid ? ShieldAlert : allowed ? CheckCircle2 : XCircle;
  const tone = invalid
    ? "bg-amber-500"
    : allowed
      ? "bg-emerald-500"
      : "bg-red-500";
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-3xl px-6 py-8 text-center text-white", tone)}>
      <Icon className="h-16 w-16" strokeWidth={2.2} />
      <p className="text-2xl font-black uppercase tracking-tight">{title}</p>
      <p className="text-sm font-medium text-white/90">{subtitle}</p>
    </div>
  );
}
