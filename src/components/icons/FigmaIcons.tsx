import type { SVGProps } from "react";

/**
 * The icon set from the Figma home screen, exported from the design.
 *
 * Material Symbols, taken as the exact path data the design exported rather
 * than redrawn — the assets Figma hands back are cropped vectors with the
 * colour baked in (#F7A21B on the active tab, #7D7D7D elsewhere), which is
 * fine for one state and useless for two. The geometry is verbatim; only the
 * fill is `currentColor`, so one glyph serves both the selected and the
 * unselected tab and follows the theme.
 *
 * Every icon is a 24x24 box, because that is the box the design draws them
 * in. Figma exports each glyph cropped to its own bounding box — search comes
 * back 17.49 wide, the chevron 7.41 — and using that crop as the viewBox
 * silently blows the drawing up to fill 24px: the chevron rendered at exactly
 * twice its intended size. The crop is kept as the path data and put back
 * where it belongs with a translate, so 24px on the wrapper means 24px of
 * frame with the glyph the size the designer drew it.
 */

type IconProps = SVGProps<SVGSVGElement>;


export function BusinessCenterIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(2, 3)">
      <path d="M18 4H14V2L12 0H8L6 2V4H2C0.9 4 0 4.9 0 6V11C0 11.75 0.4 12.38 1 12.73V16C1 17.11 1.89 18 3 18H17C18.11 18 19 17.11 19 16V12.72C19.59 12.37 20 11.73 20 11V6C20 4.9 19.1 4 18 4ZM8 2H12V4H8V2ZM2 6H18V11H13V8H7V11H2V6ZM11 12H9V10H11V12ZM17 16H3V13H7V14H13V13H17V16Z" />
    </g>
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(2, 3.5)">
      <path d="M10 2.69L15 7.19V15H13V9H7V15H5V7.19L10 2.69ZM10 0L0 9H3V17H9V11H11V17H17V9H20L10 0Z" />
    </g>
    </svg>
  );
}

export function Inventory2Icon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(2, 2)">
      <path d="M18 0H2C1 0 0 0.9 0 2V5.01C0 5.73 0.43 6.35 1 6.7V18C1 19.1 2.1 20 3 20H17C17.9 20 19 19.1 19 18V6.7C19.57 6.35 20 5.73 20 5.01V2C20 0.9 19 0 18 0ZM17 18H3V7H17V18ZM18 5H2V2H18V5Z" />
      <path d="M13 10H7V12H13V10Z" />
    </g>
    </svg>
  );
}

export function LocationOnIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(5, 2)">
      <path d="M7 0C3.13 0 0 3.13 0 7C0 12.25 7 20 7 20C7 20 14 12.25 14 7C14 3.13 10.87 0 7 0ZM2 7C2 4.24 4.24 2 7 2C9.76 2 12 4.24 12 7C12 9.88 9.12 14.19 7 16.88C4.92 14.21 2 9.85 2 7Z" />
      <path d="M7 9.5C8.38071 9.5 9.5 8.38071 9.5 7C9.5 5.61929 8.38071 4.5 7 4.5C5.61929 4.5 4.5 5.61929 4.5 7C4.5 8.38071 5.61929 9.5 7 9.5Z" />
    </g>
    </svg>
  );
}

export function NotificationsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(4, 2.25)">
      <path d="M8 19.5C9.1 19.5 10 18.6 10 17.5H6C6 18.6 6.9 19.5 8 19.5ZM14 13.5V8.5C14 5.43 12.37 2.86 9.5 2.18V1.5C9.5 0.67 8.83 0 8 0C7.17 0 6.5 0.67 6.5 1.5V2.18C3.64 2.86 2 5.42 2 8.5V13.5L0 15.5V16.5H16V15.5L14 13.5ZM12 14.5H4V8.5C4 6.02 5.51 4 8 4C10.49 4 12 6.02 12 8.5V14.5Z" />
    </g>
    </svg>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(4, 4)">
      <path d="M8 2C9.1 2 10 2.9 10 4C10 5.1 9.1 6 8 6C6.9 6 6 5.1 6 4C6 2.9 6.9 2 8 2ZM8 12C10.7 12 13.8 13.29 14 14H2C2.23 13.28 5.31 12 8 12ZM8 0C5.79 0 4 1.79 4 4C4 6.21 5.79 8 8 8C10.21 8 12 6.21 12 4C12 1.79 10.21 0 8 0ZM8 10C5.33 10 0 11.34 0 14V16H16V14C16 11.34 10.67 10 8 10Z" />
    </g>
    </svg>
  );
}

export function QrCodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(3, 3)">
      <path d="M0 8H8V0H0V8ZM2 2H6V6H2V2Z" />
      <path d="M0 18H8V10H0V18ZM2 12H6V16H2V12Z" />
      <path d="M10 0V8H18V0H10ZM16 6H12V2H16V6Z" />
      <path d="M18 16H16V18H18V16Z" />
      <path d="M12 10H10V12H12V10Z" />
      <path d="M14 12H12V14H14V12Z" />
      <path d="M12 14H10V16H12V14Z" />
      <path d="M14 16H12V18H14V16Z" />
      <path d="M16 14H14V16H16V14Z" />
      <path d="M16 10H14V12H16V10Z" />
      <path d="M18 12H16V14H18V12Z" />
    </g>
    </svg>
  );
}

export function ShoppingBagIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(4, 2)">
      <path d="M14 4H12C12 1.79 10.21 0 8 0C5.79 0 4 1.79 4 4H2C0.9 4 0 4.9 0 6V18C0 19.1 0.9 20 2 20H14C15.1 20 16 19.1 16 18V6C16 4.9 15.1 4 14 4ZM6 8C6 8.55 5.55 9 5 9C4.45 9 4 8.55 4 8V6H6V8ZM8 2C9.1 2 10 2.9 10 4H6C6 2.9 6.9 2 8 2ZM12 8C12 8.55 11.55 9 11 9C10.45 9 10 8.55 10 8V6H12V8Z" />
    </g>
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(3.26, 3.25)">
      <path d="M12.5 11H11.71L11.43 10.73C12.41 9.59 13 8.11 13 6.5C13 2.91 10.09 0 6.5 0C2.91 0 0 2.91 0 6.5C0 10.09 2.91 13 6.5 13C8.11 13 9.59 12.41 10.73 11.43L11 11.71V12.5L16 17.49L17.49 16L12.5 11ZM6.5 11C4.01 11 2 8.99 2 6.5C2 4.01 4.01 2 6.5 2C8.99 2 11 4.01 11 6.5C11 8.99 8.99 11 6.5 11Z" />
    </g>
    </svg>
  );
}

export function KeyboardArrowRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
    <g transform="translate(8.29, 6)">
      <path d="M0 10.59L4.58 6L0 1.41L1.41 0L7.41 6L1.41 12L0 10.59Z" />
    </g>
    </svg>
  );
}
