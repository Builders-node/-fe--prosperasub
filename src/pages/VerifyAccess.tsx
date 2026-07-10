import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldAlert, Sparkles, UtensilsCrossed, Car, Waves } from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { useI18n } from "@/i18n";
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
  const { t } = useI18n();

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
        <StatusBanner allowed={false} invalid title={t("verify.invalidTitle")} subtitle={t("verify.invalidSubtitle")} />
        <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{t("verify.whatToDo")}</p>
          <ul className="mt-2 space-y-1.5 list-disc pl-5">
            <li>{t("verify.hintRefresh")}</li>
            <li>{t("verify.hintSignIn")}</li>
          </ul>
          <a
            href="/discovery"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90"
          >
            {t("verify.openApp")}
          </a>
        </div>
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
        title={invalid ? t("verify.invalidTitle") : allowed ? t("verify.granted") : t("verify.denied")}
        subtitle={result.reason}
      />

      {result.user && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <Avatar name={result.user.name} src={result.user.avatar_url} />
          <p className="text-xl font-black text-foreground">{result.user.name}</p>
        </div>
      )}

      {result.user && <AccessBreakdown subscriptions={result.subscriptions} />}
    </Shell>
  );
}

/**
 * Access-focused breakdown: what services does this person have RIGHT NOW.
 * We group by service (archetype) and show one row per service where the user
 * has an active/trial sub. Expired/canceled subs are hidden — they don't grant
 * access. Pending subs collapse into a small footer note.
 */
function AccessBreakdown({ subscriptions }: { subscriptions: Subscription[] }) {
  const { t } = useI18n();
  const granting = subscriptions.filter((s) => s.status === "active" || s.status === "trial");
  const pendingCount = subscriptions.filter((s) => s.status === "pending").length;

  // One row per service — pick the sub whose expiry is furthest in the future
  // so the row shows the longest-lasting access the user has for that service.
  const byService = new Map<Subscription["service"], Subscription>();
  for (const sub of granting) {
    const existing = byService.get(sub.service);
    if (!existing) { byService.set(sub.service, sub); continue; }
    const a = existing.expires_at ? new Date(existing.expires_at).getTime() : Infinity;
    const b = sub.expires_at      ? new Date(sub.expires_at).getTime()      : Infinity;
    if (b > a) byService.set(sub.service, sub);
  }
  const rows = Array.from(byService.values());

  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {t("verify.noActive")}
        </div>
        {pendingCount > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {pendingCount} pending — payment not yet confirmed
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {t("verify.activeAccess")} · {rows.length}
      </p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border/60">
        {rows.map((s) => {
          const Icon = SERVICE_ICON[s.service];
          const style = STATUS_STYLE[s.status];
          return (
            <div key={s.service} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <Icon className="h-5 w-5 text-emerald-500" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{SERVICE_LABEL[s.service]}</p>
                <p className="text-xs text-muted-foreground">
                  {s.name}
                  {s.expires_at && <> · Until {new Date(s.expires_at).toLocaleDateString()}</>}
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
      {pendingCount > 0 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          + {pendingCount} pending — payment not yet confirmed
        </p>
      )}
    </div>
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
