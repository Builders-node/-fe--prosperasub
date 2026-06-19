import { useNavigate } from "react-router-dom";
import { Waves, Dumbbell, Droplets, Trophy, Target, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { YdHero, YdIllustration } from "@/components/yd/YdPrimitives";

interface BeachPlan {
  id: string;
  name: string;
  pricePerPerson: number; // USD per person / month
  tagline: string;
  featured?: boolean;
  amenities: { icon: typeof Waves; label: string }[];
}

const PLANS: BeachPlan[] = [
  {
    id: "membership",
    name: "Beach Club Membership",
    pricePerPerson: 65,
    tagline: "Full access to Beach Club amenities, billed monthly.",
    amenities: [
      { icon: Dumbbell, label: "Gym access" },
      { icon: Droplets, label: "Pools" },
      { icon: Waves, label: "Water park" },
      { icon: Trophy, label: "Sports courts" },
    ],
  },
  {
    id: "membership-golf",
    name: "Membership + Golf",
    pricePerPerson: 75,
    tagline: "Everything in Membership, plus daily range time at Pete's.",
    featured: true,
    amenities: [
      { icon: Check, label: "All Membership amenities" },
      { icon: Target, label: "One bucket of balls daily at Pete's" },
    ],
  },
];

const BeachClub = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  const inquire = (plan: BeachPlan) => {
    if (!isAuthenticated) {
      openAuthModal("login", "/beach-club");
      return;
    }
    toast.success(`Thanks! Our Beach Club team will reach out about the ${plan.name}.`);
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

        {/* Plans */}
        <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Plans</h2>
        <div className="grid gap-3 md:gap-4 md:grid-cols-2">
          {PLANS.map((plan) => (
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
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>

              {/* Amenities */}
              <ul className="mt-4 space-y-2">
                {plan.amenities.map((a, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-foreground">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
                      <a.icon className="h-3.5 w-3.5 text-sky-500" />
                    </span>
                    {a.label}
                  </li>
                ))}
              </ul>

              {/* Price */}
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-black tabular-nums text-foreground">${plan.pricePerPerson}</span>
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

        {/* How it works */}
        <section className="mt-space-6 rounded-3xl bg-muted/40 p-5">
          <p className="font-bold text-foreground">How memberships work</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>• Pricing is per person and billed monthly (up to one month; longer-term pricing available on request).</li>
            <li>• Ideal for groups — we coordinate how to identify guests so visits are invoiced correctly and our staff can welcome them.</li>
            <li>• Tap <span className="font-semibold text-foreground">Inquire</span> and the Beach Club team will help set it up.</li>
          </ul>
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default BeachClub;
