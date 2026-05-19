import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AppDropdownContentProps = React.ComponentPropsWithoutRef<typeof DropdownMenuContent>;

const AppDropdownContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuContent>,
  AppDropdownContentProps
>(({ className, sideOffset = 14, ...props }, ref) => (
  <DropdownMenuContent
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "w-[min(340px,calc(100vw-32px))] rounded-radius-xl bg-card p-space-3 text-card-foreground shadow-xl",
      className,
    )}
    {...props}
  />
));
AppDropdownContent.displayName = "AppDropdownContent";

type AppDropdownItemProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  to?: string;
  onSelect?: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  endIcon?: boolean;
  className?: string;
};

function AppDropdownItem({
  icon: Icon,
  title,
  subtitle,
  to,
  onSelect,
  active = false,
  disabled = false,
  danger = false,
  endIcon = false,
  className,
}: AppDropdownItemProps) {
  const content = (
    <>
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-data-[highlighted]:text-foreground",
          active && "text-foreground",
          danger && "text-destructive group-hover:text-destructive group-data-[highlighted]:text-destructive",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[0.95rem] font-bold leading-tight text-foreground",
            danger && "text-destructive",
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-space-1 block text-sm font-medium leading-snug text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {endIcon && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </>
  );

  const itemClassName = cn(
    "group flex min-h-12 w-full cursor-pointer items-center gap-space-4 rounded-radius-lg px-space-4 py-space-3 text-left outline-none transition-colors",
    "hover:bg-muted/70 focus:bg-muted/70 data-[highlighted]:bg-muted/70 data-[highlighted]:text-foreground",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    active && "bg-muted/70",
    danger && "text-destructive hover:bg-destructive/10 focus:bg-destructive/10 data-[highlighted]:bg-destructive/10",
    className,
  );

  if (to) {
    return (
      <DropdownMenuItem asChild disabled={disabled} className={itemClassName}>
        <Link to={to}>{content}</Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem disabled={disabled} onSelect={onSelect} className={itemClassName}>
      {content}
    </DropdownMenuItem>
  );
}

type AppDropdownProfileProps = {
  title: string;
  subtitle: string;
  onSelect?: () => void;
};

function AppDropdownProfile({ title, subtitle, onSelect }: AppDropdownProfileProps) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="group mb-space-2 flex cursor-pointer flex-col items-start rounded-radius-lg px-space-4 py-space-4 outline-none transition-colors hover:bg-muted/70 focus:bg-muted/70 data-[highlighted]:bg-muted/70"
    >
      <span className="block max-w-full truncate text-[1.85rem] font-black leading-none text-foreground">
        {title}
      </span>
      <span className="mt-space-2 flex items-center gap-space-2 text-[0.95rem] font-bold text-muted-foreground">
        {subtitle}
        <ChevronRight className="h-4 w-4" />
      </span>
    </DropdownMenuItem>
  );
}

function AppDropdownSeparator({ className }: { className?: string }) {
  return <DropdownMenuSeparator className={cn("mx-0 my-space-3 bg-border", className)} />;
}

export {
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownProfile,
  AppDropdownSeparator,
};
