import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Waves, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { YdHero, YdIllustration, YdEmptyState } from "@/components/yd/YdPrimitives";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";

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
  const { openAuthModal } = useAuthModal();

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

  const inquire = async (plan: BeachPlan) => {
    if (!isAuthenticated) {
      openAuthModal("login", "/beach-club");
      return;
    }
    try {
      const { error } = await supabaseDb.from("beach_club_inquiries").insert({
        plan_id: plan.id,
        plan_name: plan.name,
        user_id: userData?.id ?? null,
        name: userData?.name || userData?.display_name || null,
        email: userData?.email || null,
        status: "new",
      });
      if (error) throw error;
      toast.success(`Thanks! Our Beach Club team will reach out about the ${plan.name}.`);
    } catch {
      toast.error("Could not send your inquiry. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Beach Club" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-space-4 md:py-space-8">
        <YdHero
          accent="sky"
          badge="Beach Club"
          badgeIcon={Waves}
          title="Membership at the Beach Club"
          subtitle="Monthly access to the gym, pools, water park and sports courts — per person, for you or your group."
          illustration={<YdIllustration icon={Waves} accent="sky" size="lg" />}
        />

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
                  plan.featured ? "border-sky-500/50" : "border-border bg-card"
                }`}
              >
                {plan.featured && (
                  <span className="mb-3 self-start rounded-full bg-sky-500 px-2.5 py-0.5 text-xs font-bold text-white">
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
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
                        <Check className="h-3.5 w-3.5 text-sky-500" />
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
                  className="mt-5 w-full rounded-full bg-sky-500 text-white hover:bg-sky-600"
                  onClick={() => inquire(plan)}
                >
                  Inquire
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
            <li>• Ideal for groups — we coordinate how to identify guests so visits are invoiced correctly and our staff can welcome them.</li>
            <li>• Tap <span className="font-semibold text-foreground">Inquire</span> and the Beach Club team will follow up.</li>
          </ul>
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default BeachClub;
