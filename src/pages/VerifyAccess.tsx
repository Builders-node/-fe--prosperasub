import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldAlert, Sparkles, UtensilsCrossed, Store, Waves, MapPin } from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatDateHN, formatTimestampHN } from "@/lib/timezone";

const API_URL = (import.meta.env.VITE_API_URL as string)?.trim() || "https://api.prosperasub.com";

type AccessStatus = "active" | "trial" | "pending" | "expired" | "canceled";

interface Subscription {
  id: string;
  // Keys the Membership ACL emits (legacy-subscriptions.acl.ts). `plan` is the
  // universal service — a provider with no legacy table of its own.
  service: "cleaning" | "food" | "beach_club" | "plan";
  name: string;
  status: AccessStatus;
  expires_at: string | null;
  provider_name?: string | null;
  image_url?: string | null;
}

interface UpcomingBooking {
  id: string;
  resource_name: string | null;
  start_at: string;
  end_at: string;
  status: string;
}

interface VerifyResult {
  ok: boolean;
  allowed: boolean;
  reason: string;
  user: { id: string; name: string; avatar_url: string | null } | null;
  subscriptions: Subscription[];
  bookings?: UpcomingBooking[];
}

const SERVICE_ICON: Record<Subscription["service"], typeof Sparkles> = {
  cleaning: Sparkles,
  food: UtensilsCrossed,
  beach_club: Waves,
  plan: Store,
};

const SERVICE_LABEL: Record<Subscription["service"], string> = {
  cleaning: "Cleaning",
  food: "Food",
  beach_club: "Beach Club",
  plan: "Subscription",
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
        <div className="rounded-radius-lg bg-card p-4 text-sm text-muted-foreground shadow-figma">
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
  const granting = result.subscriptions.filter((s) => s.status === "active" || s.status === "trial");
  const pendingCount = result.subscriptions.filter((s) => s.status === "pending").length;

  return (
    <Shell>
      {/* No banner when access is granted — the person's card and their active
          plans say it. The loud banner is kept only for refusal, where the
          door staff need it to be unmistakable. */}
      {!allowed && (
        <StatusBanner
          allowed={allowed}
          invalid={invalid}
          title={invalid ? t("verify.invalidTitle") : t("verify.denied")}
          subtitle={result.reason}
        />
      )}

      {result.user && <HeaderCard name={result.user.name} avatar={result.user.avatar_url} count={granting.length} />}
      {result.user && <BookedCard bookings={result.bookings ?? []} />}
      {result.user && (
        <AccessCard subscriptions={granting} pendingCount={pendingCount} emptyLabel={t("verify.noActive")} />
      )}
    </Shell>
  );
}

/**
 * The person, up top — avatar, name, and how many plans grant them access.
 * Its own card so the identity reads clearly before the list of what they hold.
 */
function HeaderCard({ name, avatar, count }: { name: string; avatar: string | null; count: number }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-b-radius-lg bg-card p-4 pt-8 shadow-figma">
      <Avatar name={name} src={avatar} />
      <div className="w-full text-center">
        <p className="text-[20px] font-semibold leading-none tracking-[-0.4px] text-foreground">{name}</p>
        <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
          {count} {count === 1 ? "Subscription" : "Subscriptions"}
        </p>
      </div>
    </div>
  );
}

/**
 * The court hours this person still has ahead of them — what turns "you may
 * enter" into "and you are on Tennis Court 2 at 4pm". Renders nothing when they
 * booked no time, so a food-only member sees no empty card.
 */
function BookedCard({ bookings }: { bookings: UpcomingBooking[] }) {
  if (!bookings.length) return null;

  // "Aug 18 6:00 PM - 7:00 PM" — same day, so the date is said once and the
  // times bracket the hour.
  const timeOnly: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };

  return (
    <div className="flex flex-col gap-3 rounded-radius-lg bg-card p-4 shadow-figma">
      <p className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">Booked</p>
      <div className="flex flex-col gap-2">
        {bookings.map((b) => (
          <div key={b.id} className="flex items-center gap-3">
            <div className="flex shrink-0 items-center justify-center rounded-lg bg-muted p-3">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                {b.resource_name ?? "Court"}
              </p>
              <p className="text-[12px] tracking-[-0.24px] text-muted-foreground">
                {formatDateHN(b.start_at, { month: "short", day: "numeric" })}{" "}
                {formatTimestampHN(b.start_at, timeOnly)} - {formatTimestampHN(b.end_at, timeOnly)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Active Access — every plan the customer holds RIGHT NOW, by tariff name, with
 * the business and validity beneath and a photo of the provider. Grouped by
 * service, longest-lasting first, so the strongest access reads at the top.
 */
function AccessCard({
  subscriptions,
  pendingCount,
  emptyLabel,
}: {
  subscriptions: Subscription[];
  pendingCount: number;
  emptyLabel: string;
}) {
  const rows = [...subscriptions].sort((a, b) => {
    const sa = SERVICE_LABEL[a.service] ?? a.service;
    const sb = SERVICE_LABEL[b.service] ?? b.service;
    if (sa !== sb) return sa.localeCompare(sb);
    const ea = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
    const eb = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
    return eb - ea;
  });

  return (
    <div className="flex flex-col gap-3 rounded-radius-lg bg-card p-4 shadow-figma">
      <p className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">Active Access</p>

      {rows.length === 0 ? (
        <p className="rounded-radius-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((s) => {
            const category = SERVICE_LABEL[s.service] ?? "Subscription";
            return (
              <div key={s.id} className="flex h-20 items-center gap-4 rounded-radius-md bg-muted py-2 pl-2 pr-4">
                <Thumbnail image={s.image_url ?? null} service={s.service} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">{s.name}</p>
                  <div className="flex flex-col gap-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
                    <p className="truncate">{s.provider_name ? `${s.provider_name} · ${category}` : category}</p>
                    {s.expires_at && <p className="truncate">Until {formatDateHN(s.expires_at)}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingCount > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          + {pendingCount} pending — payment not yet confirmed
        </p>
      )}
    </div>
  );
}

/** The provider photo, or a service-icon tile when there is none. 64×64. */
function Thumbnail({ image, service }: { image: string | null; service: Subscription["service"] }) {
  const [broken, setBroken] = useState(false);
  const Icon = SERVICE_ICON[service] ?? Store;
  if (image && !broken) {
    return (
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-16 w-16 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-card">
      <Icon className="h-7 w-7 text-muted-foreground" />
    </div>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [broken, setBroken] = useState(false);
  const initials = name.charAt(0).toUpperCase();
  if (!src || broken) {
    return (
      <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
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
      className="h-[88px] w-[88px] rounded-full object-cover"
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Full-bleed cards, exactly like the design — no side padding. The cards span
  // edge to edge and carry their own 16px inner padding; the only breathing
  // room is the small vertical gap between them and a little at the bottom.
  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-2">{children}</div>
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
  const tone = invalid ? "bg-amber-500" : allowed ? "bg-emerald-500" : "bg-red-500";
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-radius-lg px-6 py-8 text-center text-white", tone)}>
      <Icon className="h-16 w-16" strokeWidth={2.2} />
      <p className="text-2xl font-semibold uppercase tracking-tight">{title}</p>
      <p className="text-sm font-medium text-white/90">{subtitle}</p>
    </div>
  );
}
