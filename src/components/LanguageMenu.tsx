import { Check, Globe2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";
import { languages, useI18n } from "@/i18n";

export function LanguageMenu() {
  const { language, setLanguage, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("language.choose")}
          className={HEADER_ACTION_CLASS}
        >
          <Globe2 className={HEADER_ACTION_ICON_CLASS} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-56 rounded-radius-xl border-border bg-card p-space-2 text-card-foreground shadow-xl"
      >
        {languages.map((item) => (
          <DropdownMenuItem
            key={item.code}
            onClick={() => setLanguage(item.code)}
            className={cn(
              "mt-space-1 flex cursor-pointer items-center justify-between rounded-radius-lg px-space-4 py-space-3 text-control",
              language === item.code
                ? "bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground"
                : "text-foreground focus:bg-secondary focus:text-foreground"
            )}
          >
            <span>
              {t(item.labelKey)}
              <span className={cn(
                "ml-2 font-semibold",
                language === item.code ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                {t(item.nativeLabelKey)}
              </span>
            </span>
            {language === item.code && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
