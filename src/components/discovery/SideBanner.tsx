import { Link } from "react-router-dom";
import { ChevronRight, Store } from "lucide-react";
import { BusinessCenterIcon } from "@/components/icons/FigmaIcons";
import { useI18n } from "@/i18n";

/**
 * The tall banner beside the home slider on a laptop, the slot a marketplace
 * keeps for "sell with us". Someone who already runs a business here gets the
 * door into it instead — asking them to start selling would be noise, and My
 * Business no longer needs a full-width row of its own on a desktop.
 */
export function SideBanner({ managesBusiness }: { managesBusiness: boolean }) {
  const { t } = useI18n();
  const content = managesBusiness
    ? {
        to: "/my-business",
        eyebrow: "Your business",
        title: t("discovery.myBusiness"),
        body: "Plans, bookings and payouts in one place.",
        cta: "Open",
        Icon: BusinessCenterIcon,
      }
    : {
        to: "/for-business",
        eyebrow: "For business",
        title: "Sell subscriptions on EverySub",
        body: "Turn one-off customers into regulars with monthly plans.",
        cta: "Start selling",
        Icon: Store,
      };
  const { Icon } = content;
  return (
    <Link
      to={content.to}
      className="group relative flex h-full flex-col overflow-hidden rounded-radius-lg bg-[#1f1a14] p-5 text-white"
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/30" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-primary/15" />
      <span className="relative grid h-11 w-11 place-items-center rounded-radius-md bg-primary text-[#1f1a14]">
        <Icon className="h-6 w-6" />
      </span>
      <p className="relative mt-4 text-meta font-semibold text-primary">{content.eyebrow}</p>
      <p className="relative mt-1 text-heading font-bold leading-tight">{content.title}</p>
      <p className="relative mt-2 text-meta text-white/70">{content.body}</p>
      <span className="relative mt-auto inline-flex w-full items-center justify-center gap-1 rounded-radius-md bg-white py-2.5 text-title font-semibold text-[#1f1a14] transition-colors group-hover:bg-white/90">
        {content.cta} <ChevronRight className="h-5 w-5" />
      </span>
    </Link>
  );
}
