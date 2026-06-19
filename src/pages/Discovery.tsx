import { Link } from "react-router-dom";
import {
  SparklesIcon, Car, UtensilsCrossed,
  Users, ChevronRight, ChefHat, Waves,
} from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { AdBanner } from "@/components/AdBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBusinesses } from "@/hooks/useMyBusinesses";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ─── Static content ───────────────────────────────────────────────────────────
interface Service {
  to: string;
  title: string;
  icon: LucideIcon;
  tint: string;      // card background tint
  chip: string;      // icon chip background
  badge?: string;
}

const SERVICES: Service[] = [
  { to: "/cleaning",         title: "Cleaning",        icon: SparklesIcon,     tint: "bg-sky-50 dark:bg-sky-950/40",        chip: "bg-sky-500" },
  { to: "/cars",             title: "Car Rental",      icon: Car,              tint: "bg-orange-50 dark:bg-orange-950/40",  chip: "bg-orange-500" },
  { to: "/food",             title: "Food",            icon: UtensilsCrossed,  tint: "bg-emerald-50 dark:bg-emerald-950/40", chip: "bg-emerald-500" },
  { to: "/beach-club",       title: "Beach Club",      icon: Waves,            tint: "bg-cyan-50 dark:bg-cyan-950/40",      chip: "bg-cyan-500", badge: "NEW" },
  { to: "/my-subscriptions", title: "My Subs", icon: Users,           tint: "bg-violet-50 dark:bg-violet-950/40",  chip: "bg-violet-500" },
];


const Discovery = () => {
  const { userData } = useAuth();
  const { hasAny: managesBusiness } = useMyBusinesses();

  const firstName = userData?.name?.split(" ")[0] || userData?.display_name?.split(" ")[0];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <AdBanner placement="home_top" />
      <HomeHeader title="Services" />
      <DesktopHeader />

      <main className="market-content space-y-6 py-space-4 md:space-y-8 md:py-space-8">

        {/* ─── Greeting ──────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
            Prospera Village
          </p>
          <h1 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-foreground">
            {firstName ? `Hi, ${firstName}` : "What can we do for you?"}
          </h1>
        </div>

        {/* ─── Manage your business (owners/managers only) ───────────── */}
        {managesBusiness && (
          <Link
            to="/my-business"
            aria-label="My Business"
            className="group flex items-center gap-4 overflow-hidden rounded-2xl bg-amber-50 p-4 transition-transform active:scale-[0.99] dark:bg-amber-950/40"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm transition-transform group-hover:scale-110">
              <ChefHat className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight text-foreground">My Business</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Manage your restaurants & car rentals</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" aria-hidden />
          </Link>
        )}

        {/* ─── Services ──────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Our services" scrollable={false} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SERVICES.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                aria-label={s.title}
                className={cn(
                  "group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl p-4 transition-transform active:scale-[0.98]",
                  s.tint,
                )}
              >
                {s.badge && (
                  <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black tracking-wider text-emerald-950">
                    {s.badge}
                  </span>
                )}
                <p className="max-w-[80%] text-[15px] font-bold leading-tight text-foreground">
                  {s.title}
                </p>
                <div className="mt-3 flex items-end justify-end">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-110", s.chip)}>
                    <s.icon className="h-5 w-5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>


      </main>

      <BottomNav />
    </div>
  );
};

// ─── Section header with optional "see all" affordance ────────────────────────
function SectionHeader({ title, scrollable = true }: { title: string; scrollable?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground">{title}</h2>
      {scrollable && <ChevronRight className="h-5 w-5 text-muted-foreground/40 md:hidden" aria-hidden />}
    </div>
  );
}

export default Discovery;
