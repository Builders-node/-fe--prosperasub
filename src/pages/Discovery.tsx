import { Link } from "react-router-dom";
import { SparklesIcon, Car, ArrowRight } from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";

const services = [
  {
    id: "cleaning",
    icon: SparklesIcon,
    title: "Cleaning",
    description:
      "Professional residential cleaning on a flexible subscription. Choose your plan, pick your slots, and enjoy a spotless home every week.",
    cta: "View Service",
    href: "/cleaning",
    accent: "from-primary/10 to-primary/5",
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
  },
  {
    id: "cars",
    icon: Car,
    title: "Car Rental",
    description:
      "Explore Prospera Village and beyond with a quality rental vehicle. Daily and monthly rates available with no hidden fees.",
    cta: "View Cars",
    href: "/cars",
    accent: "from-blue-500/10 to-blue-500/5",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-400",
  },
];

const Discovery = () => {
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title="Services" />
      <DesktopHeader />

      <main className="market-content py-space-6 md:py-space-12">
        {/* Hero */}
        <section className="mb-space-10 md:mb-space-14">
          <div className="rounded-radius-xl bg-card p-space-6 md:p-space-10">
            <p className="text-caption font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Prospera Village
            </p>
            <h1 className="mt-space-3 text-page-title">Our Services</h1>
            <p className="mt-space-3 max-w-xl text-body text-muted-foreground">
              Everything you need, built for Prospera Village residents and visitors.
            </p>
          </div>
        </section>

        {/* Service cards */}
        <section className="grid gap-space-4 md:grid-cols-2">
          {services.map(({ id, icon: Icon, title, description, cta, href, accent, iconBg, iconColor }) => (
            <article
              key={id}
              className={`flex flex-col rounded-3xl border border-border bg-gradient-to-br ${accent} bg-card p-6 md:p-8`}
            >
              <div className={`mb-space-5 flex h-14 w-14 items-center justify-center rounded-2xl ${iconBg}`}>
                <Icon className={`h-7 w-7 ${iconColor}`} />
              </div>

              <h2 className="text-xl font-black tracking-tight text-foreground">{title}</h2>
              <p className="mt-space-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>

              <Link
                to={href}
                className="mt-space-6 inline-flex items-center gap-space-2 rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background transition-all hover:bg-foreground/90 active:scale-[0.98] self-start"
              >
                {cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default Discovery;
