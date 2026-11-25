import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { accountApi } from "@/integrations/supabase/client";
import { formatDateHN } from "@/lib/timezone";
import { tr, trx } from "@/lib/tr";

/**
 * `/claim-business?token=…` — the other end of the admin's "Invite owner" link.
 *
 * The person sees which business it is, signs in (or signs up) if they are not,
 * and accepts; the API makes them `providers.admin_user_id` and the link is
 * spent. A link that expired, was replaced or was used says so in words, with
 * who to ask, instead of a bare error.
 */

interface InviteInfo {
  state: "open" | "claimed" | "revoked" | "expired";
  /** 'member' = a team invite: the person joins as a manager, not the owner. */
  kind?: "owner" | "member";
  business: { id: string; name: string };
  expiresAt: string;
}

export default function ClaimBusiness() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();

  const infoQ = useQuery({
    queryKey: ["owner-invite", token],
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<InviteInfo> => {
      const { data, error } = await accountApi(`/owner-invites/${encodeURIComponent(token)}`);
      if (error) throw error;
      return data as InviteInfo;
    },
  });

  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await accountApi(`/owner-invites/${encodeURIComponent(token)}/claim`, { method: "POST" });
      if (error) throw error;
      return data as { providerId: string; name: string; already: boolean; kind?: string };
    },
    onSuccess: (r) => {
      toast.success(r.kind === "member" ? tr("You're on the {name} team", { name: r.name }) : r.already ? tr("You already own {name}", { name: r.name }) : tr("{name} is yours", { name: r.name }));
      void qc.invalidateQueries();
      navigate(`/my-provider/${r.providerId}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message || tr("Could not accept the link")),
  });

  const info = infoQ.data;

  // A team invite needs no second click: whoever arrives through the link and
  // is signed in — typically someone who has just created their account from
  // it — joins at once. The link is the proof they own the address, so this
  // is still the token's decision, never an email match. Owner hand-overs keep
  // the explicit button: taking over a business is a choice to make on purpose.
  const autoClaimed = useRef(false);
  useEffect(() => {
    if (autoClaimed.current || !user || authLoading) return;
    if (info?.kind !== "member" || info.state !== "open") return;
    autoClaimed.current = true;
    claim.mutate();
  }, [user, authLoading, info, claim]);

  const here = `/claim-business?token=${encodeURIComponent(token)}`;

  let body: React.ReactNode;
  if (!token || infoQ.isError) {
    body = (
      <Message title={tr("This link doesn't work")} text={tr("Check that you opened the whole link, or ask EverySub to send a new one.")} />
    );
  } else if (infoQ.isLoading || authLoading || !info) {
    body = <PageLoader />;
  } else if (info.state !== "open") {
    body = (
      <Message
        title={info.state === "expired" ? tr("This link has expired") : tr("This link was already used")}
        text={tr("It was for {name}. Ask EverySub for a new link if you still need to take it over.", { name: info.business.name })}
      />
    );
  } else {
    body = (
      <section className="space-y-4 rounded-radius-lg bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-radius-md bg-muted">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-meta text-muted-foreground">{info.kind === "member" ? tr("You're invited to the team of") : tr("You're invited to own")}</p>
            <p className="truncate text-title font-semibold text-foreground">{info.business.name}</p>
          </div>
        </div>
        <p className="text-body text-muted-foreground">
          {info.kind === "member"
            ? tr("As a manager you see its schedule, customers and plans and help run the day. The owner keeps the money.")
            : tr("As the owner you manage its plans, schedule and team, see its money and withdraw it.")}{" "}{trx("The link works once, until {expiresAt}.", { expiresAt: formatDateHN(info.expiresAt) })}</p>
        {user ? (
          <Button size="lg" className="w-full" loading={claim.isPending} onClick={() => claim.mutate()}>
            {info.kind === "member" ? tr("Accept and join the team") : tr("Accept and open my business")}
          </Button>
        ) : info.kind === "member" ? (
          <div className="space-y-2">
            <Button size="lg" className="w-full" onClick={() => openAuthModal("signup", here)}>{tr("Create an account and join")}</Button>
            <Button size="lg" variant="ghost" className="w-full" onClick={() => openAuthModal("login", here)}>{tr("I already have an account")}</Button>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={() => openAuthModal("login", here)}>{tr("Sign in to accept")}</Button>
        )}
      </section>
    );
  }

  return (
    <UserLayout title={info?.kind === "member" ? tr("Join a team") : tr("Take over a business")} allowGuest showBottomNav={false}>
      <div className="mx-auto max-w-[480px] py-4">{body}</div>
    </UserLayout>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-radius-lg bg-card p-6 text-center">
      <p className="text-title font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-body text-muted-foreground">{text}</p>
    </section>
  );
}
