import { useState } from "react";
import { Check, Copy, Gift, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { QueryError } from "@/components/patterns/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { useReferrals, useClaimReferral, referralLinkFor } from "@/hooks/useReferrals";
import { useI18n, type TranslationKey } from "@/i18n";

/**
 * "Bring a neighbour" — the account screen for it.
 *
 * Próspera is a village: twenty-five people have bought something and they all
 * know each other. The share button therefore leads with WhatsApp rather than a
 * copy field, because that is where the conversation is already happening.
 *
 * The credit shown here is granted by the database when an invited friend's
 * first order is paid, so this screen never has to reason about whether an
 * invite "counts" — it reports a number somebody else already decided.
 */

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The server answers a refused claim with a reason, not a sentence — so the
 * wording (and its Spanish) stays here, where the rest of the wording is.
 */
const REFUSAL_KEYS: Record<string, TranslationKey> = {
  "unknown-code":      "referral.refusedUnknownCode",
  "self":              "referral.refusedSelf",
  "already-referred":  "referral.refusedAlreadyReferred",
  "already-a-customer":"referral.refusedAlreadyCustomer",
  "disabled":          "referral.refusedDisabled",
};

export function ReferralPanel() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useReferrals();
  const claim = useClaimReferral();
  const [copied, setCopied] = useState(false);
  const [enteredCode, setEnteredCode] = useState("");

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  // The reward half lives in the database and is already live; this screen
  // needs the API. Saying so beats an empty card that looks like "no invites".
  if (isError || !data) {
    return <QueryError onRetry={() => void refetch()} />;
  }

  if (!data.enabled || !data.code) {
    return (
      <YdEmptyState
        icon={Gift}
        title={t("referral.offTitle")}
        subtitle={t("referral.offDescription")}
      />
    );
  }

  const link = referralLinkFor(data.code);
  const invitedCount = data.invited.length;
  const joinedCount = data.invited.filter((i) => i.status === "qualified").length;

  /**
   * Referrals can run without paying anything: the amounts are settings and
   * both are zero right now. Invitations are still attributed and a friend's
   * first order still counts — the platform is learning who brings whom before
   * deciding what that is worth. So the screen must not promise money it is
   * not going to hand over.
   */
  const paysOut = data.rewardCents > 0 || data.welcomeCents > 0;
  const hasCredit = data.balanceCents !== 0;

  const share = async () => {
    const text = paysOut
      ? t("referral.shareText", { amount: usd(data.welcomeCents), link })
      : t("referral.shareTextPlain", { link });
    // The OS sheet when there is one — it puts WhatsApp first on the phones
    // these customers actually use. Clipboard is the desktop fallback.
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Dismissing the share sheet is a decision, not a failure.
        return;
      }
    }
    void copy(text);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success(t("referral.copied"));
    } catch {
      toast.error(t("referral.copyFailed"));
    }
  };

  const submitCode = () => {
    claim.mutate(enteredCode, {
      onSuccess: (result) => {
        if (result.claimed) {
          setEnteredCode("");
          toast.success(t(paysOut ? "referral.claimAccepted" : "referral.claimAcceptedPlain"));
        } else {
          toast.error(t(REFUSAL_KEYS[result.reason ?? ""] ?? "referral.refusedUnknownCode"));
        }
      },
      onError: () => toast.error(t("referral.claimFailed")),
    });
  };

  return (
    <div className="space-y-2">
      {/* The offer, said once, in money. */}
      <section className="rounded-radius-md bg-card p-5 text-center shadow-figma">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-radius-md bg-inset">
          <Gift className="h-6 w-6 text-primary" />
        </span>
        <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">
          {paysOut
            ? t("referral.headline", { amount: usd(data.rewardCents) })
            : t("referral.headlinePlain")}
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {paysOut
            ? t("referral.subhead", {
                friendAmount: usd(data.welcomeCents),
                yourAmount: usd(data.rewardCents),
              })
            : t("referral.subheadPlain")}
        </p>

        <div className="mt-4 rounded-radius-md bg-inset p-4">
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground">
            {t("referral.yourCode")}
          </p>
          <p className="mt-1 font-mono text-[28px] font-black tracking-[0.18em] text-foreground">
            {data.code}
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => void share()}>
            <Share2 className="mr-1.5 h-4 w-4" />
            {t("referral.share")}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => void copy(link)}>
            {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
            {t("referral.copyLink")}
          </Button>
        </div>
      </section>

      {/*
        The credit figure only earns its half of the row when there is credit to
        show — either the programme pays, or this person is holding a balance
        from when it did. Otherwise "$0.00" is a promise the screen is not
        keeping, and the count of friends takes the full width.
      */}
      <section className={(paysOut || hasCredit) ? "grid grid-cols-2 gap-2" : "grid grid-cols-1"}>
        <Stat label={t("referral.friendsJoined")} value={`${joinedCount}`} sub={
          invitedCount > joinedCount
            ? t("referral.pendingCount", { n: invitedCount - joinedCount })
            : undefined
        } />
        {(paysOut || hasCredit) && (
          <Stat label={t("referral.creditBalance")} value={usd(data.balanceCents)} sub={
            data.earnedCents > 0
              ? t("referral.earnedTotal", { amount: usd(data.earnedCents) })
              : undefined
          } />
        )}
      </section>

      {data.invited.length > 0 && (
        <section className="rounded-radius-md bg-card shadow-figma">
          <h3 className="px-4 pt-4 text-[12px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {t("referral.invitedTitle")}
          </h3>
          <ul className="divide-y divide-border/60 p-1.5">
            {data.invited.map((person, i) => (
              <li key={`${person.name}-${i}`} className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inset">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
                  {person.name}
                </span>
                <span className={
                  person.status === "qualified"
                    ? "shrink-0 text-[13px] font-semibold text-emerald-500"
                    : "shrink-0 text-[13px] text-muted-foreground"
                }>
                  {person.status !== "qualified"
                    ? t("referral.waitingFirstOrder")
                    : paysOut
                      ? `+${usd(data.rewardCents)}`
                      : t("referral.joinedAndBought")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        Someone who was told a code verbally, or who signed in on a different
        device than the one that opened the link. The server refuses it if they
        have already bought something, so this cannot be used to backdate a
        customer the platform already had.
      */}
      <section className="rounded-radius-md bg-card p-4 shadow-figma">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {t("referral.haveACode")}
        </h3>
        <div className="mt-2 flex gap-2">
          <Input
            id="referral-code"
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
            placeholder="9C37UX"
            className="font-mono tracking-[0.14em]"
            maxLength={12}
          />
          <Button
            variant="secondary"
            onClick={submitCode}
            loading={claim.isPending}
            disabled={enteredCode.trim().length < 4 || claim.isPending}
          >
            {t("referral.apply")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-radius-md bg-card p-4 shadow-figma">
      <p className="text-[12px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[24px] font-black tabular-nums tracking-[-0.5px] text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
