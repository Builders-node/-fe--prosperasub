import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Waves, Check, ArrowRight, LandPlot } from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { YdHero, YdIllustration, YdEmptyState } from "@/components/yd/YdPrimitives";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { todayHN } from "@/lib/timezone";

interface BeachPlan {
  id: string;
  name: string;
  tagline: string | null;
  price_per_person_cents: number;
  amenities: string[];
  featured: boolean;
}

const BeachClub = () => {
  const navigate = useNavigate();
  const { isAuthenticated, userData } = useAuth();
  const userUuid = useUserUuid();

  // Active membership → unlock court booking.
  const { data: hasMembership } = useQuery({
    queryKey: ["my-beach-membership", userUuid, userData?.id],
    queryFn: async () => {
      const ids = [userUuid, userData?.id].filter(Boolean) as string[];
      if (!ids.length) return false;
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .select("id, status, end_date")
        .in("user_id", ids)
        .eq("status", "active");
      if (error) return false;
      const today = todayHN();
      return (data ?? []).some((s: any) => !s.end_date || s.end_date >= today);
    },
    enabled: isAuthenticated && (!!userUuid || !!userData?.id),
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["beach-club-plans-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BeachPlan[];
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Beach Club" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-space-4 md:py-space-8">
        <YdHero
          accent="amber"
          badge="Beach Club"
          badgeIcon={Waves}
          title="Membership at the Beach Club"
          subtitle="Monthly access to the gym, pools, water park and sports courts — per person, for you or your group."
          illustration={<YdIllustration icon={Waves} accent="amber" size="lg" />}
        />

        {hasMembership && (
          <button
            type="button"
            onClick={() => navigate("/beach-club/courts")}
            className="mb-6 flex w-full items-center gap-4 rounded-3xl border border-primary/40 bg-primary/10 p-5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-black shadow-sm">
              <LandPlot className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-foreground">Book a court</p>
              <p className="mt-0.5 text-sm text-muted-foreground">You're a member — reserve a tennis or pickleball court any time.</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-primary" />
          </button>
        )}

        <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Plans</h2>

        {isLoading ? (
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            {[1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
          </div>
        ) : plans.length === 0 ? (
          <YdEmptyState icon={Waves} title="No plans available" subtitle="Membership plans are being set up — check back soon." />
        ) : (
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`flex flex-col rounded-3xl border p-6 transition-colors ${
                  plan.featured ? "border-primary/50" : "border-border bg-card"
                }`}
              >
                {plan.featured && (
                  <span className="mb-3 self-start rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-black">
                    Most Popular
                  </span>
                )}

                <h3 className="text-lg font-black tracking-tight text-foreground">{plan.name}</h3>
                {plan.tagline && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>
                )}

                <ul className="mt-4 space-y-2">
                  {(plan.amenities ?? []).map((a, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-foreground">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </span>
                      {a}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-black tabular-nums text-foreground">
                    {formatUSD(plan.price_per_person_cents)}
                  </span>
                  <span className="text-sm text-muted-foreground">/ person · month</span>
                </div>

                <Button
                  className="mt-5 w-full rounded-full bg-primary text-black hover:bg-[hsl(var(--brand-accent-hover))]"
                  onClick={() => navigate(`/beach-club/checkout/${plan.id}`)}
                >
                  Subscribe
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </article>
            ))}
          </div>
        )}

        <section className="mt-space-6 rounded-3xl bg-muted/40 p-5">
          <p className="font-bold text-foreground">How memberships work</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>• Pricing is per person and billed monthly (up to one month; longer-term pricing available on request).</li>
            <li>• Ideal for groups — choose how many people and pay for everyone at once.</li>
            <li>• Tap <span className="font-semibold text-foreground">Subscribe</span> to pay with Lightning, on-chain, LIVES or PayPal and activate your membership.</li>
          </ul>
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default BeachClub;
