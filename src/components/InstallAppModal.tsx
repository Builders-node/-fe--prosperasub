import { useEffect, useState } from "react";
import { Share, SquarePlus, Plus, MoreVertical } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/i18n";

const DISMISS_FOREVER_KEY = "prospera_install_prompt_dismissed";
const DISMISS_SESSION_KEY = "prospera_install_prompt_session";

type Platform = "ios" | "android" | "other";

/** True when the app is already running as an installed PWA (home-screen / standalone). */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

// Bilingual copy kept local — these strings don't belong in the typed app dictionary.
const COPY = {
  en: {
    title: "Install App",
    ios: [
      ['Tap the ', 'Share', ' button in the toolbar'],
      ['Tap ', '"Add to Home Screen"', ''],
      ['Tap ', '"Add"', ' to confirm'],
    ],
    android: [
      ['Tap the ', 'menu', ' button in the toolbar'],
      ['Tap ', '"Add to Home screen"', ''],
      ['Tap ', '"Install"', ' to confirm'],
    ],
    close: "Close",
    dontShow: "Don't show again",
  },
  es: {
    title: "Instalar app",
    ios: [
      ['Toca el botón ', 'Compartir', ' en la barra'],
      ['Toca ', '"Agregar a inicio"', ''],
      ['Toca ', '"Agregar"', ' para confirmar'],
    ],
    android: [
      ['Toca el botón de ', 'menú', ' en la barra'],
      ['Toca ', '"Agregar a pantalla de inicio"', ''],
      ['Toca ', '"Instalar"', ' para confirmar'],
    ],
    close: "Cerrar",
    dontShow: "No volver a mostrar",
  },
} as const;

export default function InstallAppModal() {
  const isMobile = useIsMobile();
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    // Never prompt when already installed, on desktop, or after the user dismissed it.
    if (isStandalone()) return;
    if (!isMobile) return;
    if (localStorage.getItem(DISMISS_FOREVER_KEY)) return;
    if (sessionStorage.getItem(DISMISS_SESSION_KEY)) return;

    const p = detectPlatform();
    if (p === "other") return; // only iOS / Android have the home-screen install flow

    setPlatform(p);
    const timer = window.setTimeout(() => setOpen(true), 2500);
    return () => window.clearTimeout(timer);
  }, [isMobile]);

  const handleClose = () => {
    // "Close" hides it for this browser session only — it may reappear on a later visit.
    sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
    setOpen(false);
  };

  const handleDontShowAgain = () => {
    localStorage.setItem(DISMISS_FOREVER_KEY, "1");
    setOpen(false);
  };

  const copy = COPY[language] ?? COPY.en;
  const steps = platform === "android" ? copy.android : copy.ios;
  const StepIcon = platform === "android" ? MoreVertical : Share;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center gap-space-5 pt-2">
          <h2 className="text-panel-title text-center">{copy.title}</h2>

          {/* Phone mock — highlights the toolbar control the user needs to tap */}
          <div className="relative w-44 rounded-[2rem] border-[6px] border-foreground/85 bg-foreground/[0.03] p-2">
            <div className="aspect-[9/19] w-full rounded-[1.4rem] bg-gradient-to-b from-muted to-muted/40" />
            {/* notch */}
            <div className="absolute left-1/2 top-3 h-4 w-16 -translate-x-1/2 rounded-full bg-foreground/85" />
            {/* mock toolbar with the target control highlighted */}
            <div className="absolute inset-x-3 bottom-4 flex items-center justify-around rounded-full bg-background/90 px-2 py-2 backdrop-blur">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-primary/25">
                <StepIcon className="h-4 w-4" />
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
              </div>
              <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
            </div>
          </div>

          {/* Steps */}
          <ol className="w-full space-y-space-3">
            {steps.map(([before, bold, after], i) => (
              <li key={i} className="flex items-start gap-space-3">
                <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-body text-foreground">
                  {before}
                  <span className="font-semibold">{bold}</span>
                  {after}
                  {i === 1 && (
                    <span className="ml-1 inline-flex translate-y-0.5 text-primary">
                      {platform === "android" ? <Plus className="h-4 w-4" /> : <SquarePlus className="h-4 w-4" />}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          <div className="flex w-full flex-col gap-space-2">
            <Button className="w-full rounded-full" variant="secondary" onClick={handleClose}>
              {copy.close}
            </Button>
            <button
              type="button"
              onClick={handleDontShowAgain}
              className="text-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              {copy.dontShow}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
