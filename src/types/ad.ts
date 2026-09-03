export interface Ad {
  id: string;
  title: string;
  label: string;
  badge_text: string | null;
  cta_text: string | null;
  link_url: string;
  placement: string;
  gradient_from: string;
  gradient_via: string;
  gradient_to: string;
  text_color: string;
  badge_bg: string;
  badge_text_color: string;
  is_active: boolean;
  dismissible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const AD_PLACEMENTS = [
  // Desktop shows this strip on every customer-facing page (SiteAdBanner);
  // phones show it on the home screen only. The value stays `home_top` —
  // it's what every existing row carries.
  { value: "home_top", label: "Top banner — site-wide on desktop, home on mobile" },
] as const;

export const EMPTY_AD = {
  title: "",
  label: "",
  badge_text: "",
  cta_text: "",
  link_url: "",
  placement: "home_top",
  gradient_from: "#6d28d9",
  gradient_via: "#9333ea",
  gradient_to: "#d946ef",
  text_color: "#ffffff",
  badge_bg: "#fde047",
  badge_text_color: "#581c87",
  is_active: true,
  dismissible: true,
  sort_order: 0,
};
