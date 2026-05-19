import { cn } from "@/lib/utils";

const logoPalettes = [
  { background: "#12A9E8", foreground: "#FFFFFF" },
  { background: "#0F5132", foreground: "#FFFFFF" },
  { background: "#31C06B", foreground: "#FFFFFF" },
  { background: "#075F34", foreground: "#FFFFFF" },
  { background: "#F1D302", foreground: "#111111" },
  { background: "#E94F37", foreground: "#FFFFFF" },
  { background: "#233D4D", foreground: "#FFFFFF" },
  { background: "#F78764", foreground: "#111111" },
];

function getPaletteIndex(name: string) {
  return [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % logoPalettes.length;
}

interface RestaurantLogoTileProps {
  name: string;
  className?: string;
  size?: "card" | "compact" | "micro";
}

const sizeClasses = {
  card: "px-space-6 md:px-space-8 text-[clamp(1rem,7.2cqw,1.85rem)]",
  compact: "px-space-3 text-lg",
  micro: "px-space-2 text-xs",
};

export function RestaurantLogoTile({ name, className, size = "card" }: RestaurantLogoTileProps) {
  const palette = logoPalettes[getPaletteIndex(name)];

  return (
    <div
      className={cn(
        "[container-type:inline-size] flex w-full items-center justify-center overflow-hidden rounded-radius-lg text-center font-display font-extrabold leading-[1.08] transition-transform duration-300",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: palette.background, color: palette.foreground }}
      aria-label={name}
    >
      <span className="line-clamp-2 max-w-full text-balance break-normal">{name}</span>
    </div>
  );
}
