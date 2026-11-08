import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { accountApi } from "@/integrations/supabase/client";
import { FEEDBACK_SERVICES, LEAVE_REASONS, isLeaveReason, type LeaveReason } from "@/lib/subscriptions/leaveReasons";
import { cn } from "@/lib/utils";

/**
 * `/feedback/leaving?service=&sub=&reason=` — where the "Not coming back? One
 * tap tells us why" links in the reminder emails land.
 *
 * The tap in the email IS the answer: with a reason in the link it is recorded
 * on arrival and the page only says thank you. Without one (or after an error)
 * the answers are offered here. The endpoint checks the subscription is the
 * caller's, so the page sits behind the login.
 */
export default function LeavingFeedback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const service = params.get("service") ?? "";
  const subId = params.get("sub") ?? "";
  const fromLink = params.get("reason");
  const valid = (FEEDBACK_SERVICES as readonly string[]).includes(service) && /^[0-9a-zA-Z-]{1,64}$/.test(subId);

  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [picked, setPicked] = useState<LeaveReason | null>(isLeaveReason(fromLink) ? fromLink : null);
  const sentRef = useRef(false);

  const send = async (reason: LeaveReason) => {
    setPicked(reason);
    setState("sending");
    const { error } = await accountApi(`/account/${service}/subscriptions/${subId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ reason, source: fromLink ? "email" : "app" }),
    });
    setState(error ? "error" : "done");
  };

  useEffect(() => {
    if (!valid || sentRef.current || !isLeaveReason(fromLink)) return;
    sentRef.current = true;
    void send(fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, fromLink]);

  return (
    <UserLayout title="Your feedback" showBackButton backTo="/my-subscriptions" showBottomNav={false}>
      <div className="mx-auto max-w-xl space-y-4 py-space-6">
        {!valid ? (
          <section className="rounded-radius-lg bg-card p-6 text-center">
            <p className="text-title font-semibold text-foreground">This link isn't complete</p>
            <p className="mt-1 text-body text-muted-foreground">Open it again from the email, or tell us from My subscriptions.</p>
          </section>
        ) : state === "done" ? (
          <section className="space-y-4 rounded-radius-lg bg-card p-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive/15 text-positive">
              <Check className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-heading font-semibold text-foreground">Thank you — that helps</h1>
              <p className="mt-1 text-body text-muted-foreground">
                {picked === "forgot"
                  ? "Renewing takes a minute, and your details are already filled in."
                  : "We read every answer. If anything changes, everything is one tap away."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => navigate("/my-subscriptions")}>
                {picked === "forgot" ? "Renew now" : "My subscriptions"}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/discovery")}>Browse services</Button>
            </div>
          </section>
        ) : (
          <section className="space-y-4 rounded-radius-lg bg-card p-6">
            <div>
              <h1 className="text-heading font-semibold text-foreground">Why did you stop?</h1>
              <p className="mt-1 text-body text-muted-foreground">One tap. It tells the business what to fix.</p>
            </div>
            {state === "error" && (
              <p className="rounded-radius-md bg-destructive/10 px-3 py-2 text-body text-destructive">
                We couldn't save that just now. Try again?
              </p>
            )}
            <div className="grid gap-2">
              {LEAVE_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  disabled={state === "sending"}
                  onClick={() => void send(r.key)}
                  className={cn(
                    "flex h-12 items-center justify-between rounded-radius-md px-4 text-left text-body font-medium transition-colors",
                    picked === r.key ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/80",
                  )}
                >
                  {r.label}
                  {state === "sending" && picked === r.key && <Spinner size="sm" />}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </UserLayout>
  );
}
