import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The single, platform-wide responsive container.
 *
 * One container for every page — screens, layouts, forms, dashboards, tables,
 * settings and marketing. It owns the page's horizontal rhythm so all content
 * aligns identically across mobile, tablet, laptop and desktop:
 *
 *   width 100% · max-width 1280px · centered · padding clamp(16px, 4vw, 24px)
 *
 * The spec lives in the `.app-container` utility (frontend/src/index.css); this
 * component is the canonical React API for it. Pass `as` to render a different
 * element (e.g. `as="main"`), and `className` for vertical spacing only — never
 * re-declare width or horizontal padding here.
 */
type AppContainerProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function AppContainer<T extends ElementType = "div">({
  as,
  className,
  children,
  ...props
}: AppContainerProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={cn("app-container", className)} {...props}>
      {children}
    </Tag>
  );
}
