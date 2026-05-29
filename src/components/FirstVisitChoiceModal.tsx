import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

const FIRST_VISIT_CHOICE_KEY = "prospera_first_visit_choice_seen";

export function FirstVisitChoiceModal() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();

  useEffect(() => {
    const isExcludedRoute = [
      "/auth",
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/account",
      "/dashboard",
      "/my-subscriptions",
      "/favorites",
      "/profile",
      "/subscription",
      "/checkout",
      "/admin",
      "/restaurant",
    ].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

    if (isExcludedRoute) return;

    if (!localStorage.getItem(FIRST_VISIT_CHOICE_KEY)) {
      const timer = window.setTimeout(() => setOpen(true), 350);
      return () => window.clearTimeout(timer);
    }
  }, [location.pathname]);

  const dismiss = () => {
    localStorage.setItem(FIRST_VISIT_CHOICE_KEY, "true");
    setOpen(false);
  };

  const chooseFood = () => {
    dismiss();
    navigate("/");
  };

  const chooseCleaning = () => {
    dismiss();
    navigate("/cleaning");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
        setOpen(nextOpen);
      }}
    >
      <DialogContent className="overflow-hidden border-0 bg-background p-0 shadow-2xl sm:max-w-md sm:rounded-radius-xl">
        <div className="relative min-h-44 overflow-hidden bg-[linear-gradient(135deg,#59c8f5_0%,#8a6ee8_42%,#f27aa6_72%,#ff9f1a_100%)] p-space-6 text-white">
          <div className="absolute -right-10 top-8 h-32 w-32 rotate-12 rounded-radius-lg bg-yellow-300/90" />
          <div className="absolute bottom-[-2.5rem] left-12 h-28 w-36 -rotate-12 rounded-radius-lg bg-red-500/90" />
          <div className="absolute bottom-[-2rem] right-16 h-24 w-40 rotate-6 rounded-radius-lg bg-sky-300/90" />
          <div className="relative z-10">
            <p className="text-caption uppercase tracking-[0.16em] text-white/85">{t("entryModal.eyebrow")}</p>
            <h2 className="mt-space-3 max-w-[14rem] font-display text-4xl font-black leading-none">
              {t("entryModal.title")}
            </h2>
          </div>
        </div>

        <div className="p-space-6 pt-space-5">
          <DialogHeader className="text-left">
            <DialogTitle>{t("entryModal.heading")}</DialogTitle>
            <DialogDescription>{t("entryModal.description")}</DialogDescription>
          </DialogHeader>

          <div className="mt-space-5 grid grid-cols-1 gap-space-3 sm:grid-cols-2">
            <Button type="button" size="lg" onClick={chooseFood} className="w-full">
              <Utensils className="h-5 w-5" />
              {t("entryModal.food")}
            </Button>
            <Button type="button" size="lg" variant="secondary" onClick={chooseCleaning} className="w-full">
              <Sparkles className="h-5 w-5" />
              {t("entryModal.cleaning")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
