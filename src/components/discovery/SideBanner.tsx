import { Link } from "react-router-dom";
import { ChevronRight, Store } from "lucide-react";
import { BusinessCenterIcon } from "@/components/icons/FigmaIcons";
import { useI18n } from "@/i18n";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

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
        eyebrow: tr("Your business"),
        title: t("discovery.myBusiness"),
        body: tr("Plans, bookings and payouts in one place."),
        cta: tr("Open"),
        Icon: BusinessCenterIcon,
      }
    : {
        to: "/for-business",
        eyebrow: tr("For business"),
        title: tr("Sell subscriptions on EverySub"),
        body: tr("Turn one-off customers into regulars with monthly plans."),
        cta: tr("Start selling"),
        Icon: Store,
      };
  const { Icon } = content;
  // Built from the site's own parts: the plain card surface, the orange icon
  // disc the catalog uses, and the primary button. No decoration of its own.
  return (
    <Link
      to={content.to}
      className="group flex h-full flex-col rounded-radius-lg bg-card p-4 shadow-figma transition-colors hover:bg-muted"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-meta font-semibold text-primary">{content.eyebrow}</p>
      <p className="mt-1 text-heading font-semibold leading-tight text-foreground">{content.title}</p>
      <p className="mt-2 text-meta text-muted-foreground">{content.body}</p>
      <span className={cn(buttonVariants({ size: "sm" }), "mt-auto w-full")}>
        {content.cta} <ChevronRight />
      </span>
    </Link>
  );
}
