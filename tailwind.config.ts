import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        lightning: "hsl(var(--lightning))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        "radius-xs": "var(--radius-xs)",
        "radius-sm": "var(--radius-sm)",
        "radius-md": "var(--radius-md)",
        "radius-lg": "var(--radius-lg)",
        "radius-xl": "var(--radius-xl)",
        "radius-full": "var(--radius-full)",
        xl: "var(--radius-md)",
        "2xl": "var(--radius-lg)",
        "3xl": "var(--radius-lg)",
        "4xl": "var(--radius-xl)",
      },
      fontFamily: {
        /* Primary — use 'font-inter' or 'font-sans' anywhere */
        inter:   ["var(--font-inter)", { fontFeatureSettings: "'cv02','cv03','cv04','tnum','lnum'" }],
        sans:    ["var(--font-inter)", { fontFeatureSettings: "'cv02','cv03','cv04','tnum','lnum'" }],
        /* Legacy aliases */
        display: ["var(--font-inter)"],
        body:    ["var(--font-inter)"],
        /* Monospace for code / amounts */
        mono:    ["var(--font-family-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        /* Primitives */
        "2xs": ["var(--fs-2xs)", { lineHeight: "1rem" }],
        "xs":  ["var(--fs-xs)",  { lineHeight: "1rem" }],
        "sm":  ["var(--fs-sm)",  { lineHeight: "1.25rem" }],
        "base":["var(--fs-md)",  { lineHeight: "1.5rem" }],
        "lg":  ["var(--fs-lg)",  { lineHeight: "1.625rem" }],
        "xl":  ["var(--fs-xl)",  { lineHeight: "1.75rem" }],
        "2xl": ["var(--fs-2xl)", { lineHeight: "1.75rem" }],
        "3xl": ["var(--fs-3xl)", { lineHeight: "1.875rem" }],
        "4xl": ["var(--fs-4xl)", { lineHeight: "2.25rem" }],
        "5xl": ["var(--fs-5xl)", { lineHeight: "1" }],
        "6xl": ["var(--fs-6xl)", { lineHeight: "1" }],
        /* Legacy alias */
        "font-size-2xs": ["var(--fs-2xs)", { lineHeight: "0.875rem" }],
        caption: [
          "var(--type-caption-size)",
          {
            lineHeight: "var(--type-caption-line-height)",
            fontWeight: "var(--type-caption-weight)",
            letterSpacing: "var(--letter-spacing-normal)",
          },
        ],
        label: [
          "var(--type-label-size)",
          {
            lineHeight: "var(--type-label-line-height)",
            fontWeight: "var(--type-label-weight)",
            letterSpacing: "var(--letter-spacing-normal)",
          },
        ],
        control: [
          "var(--type-control-size)",
          {
            lineHeight: "var(--type-control-line-height)",
            fontWeight: "var(--type-control-weight)",
            letterSpacing: "var(--letter-spacing-normal)",
          },
        ],
        body: [
          "var(--type-body-size)",
          {
            lineHeight: "var(--type-body-line-height)",
            fontWeight: "var(--type-body-weight)",
            letterSpacing: "var(--letter-spacing-normal)",
          },
        ],
        "body-lg": [
          "var(--type-body-large-size)",
          {
            lineHeight: "var(--type-body-large-line-height)",
            fontWeight: "var(--type-body-large-weight)",
            letterSpacing: "var(--letter-spacing-normal)",
          },
        ],
        "card-title": [
          "var(--type-card-title-size)",
          {
            lineHeight: "var(--type-card-title-line-height)",
            fontWeight: "var(--type-card-title-weight)",
            letterSpacing: "var(--letter-spacing-tight)",
          },
        ],
        "panel-title": [
          "var(--type-panel-title-size)",
          {
            lineHeight: "var(--type-panel-title-line-height)",
            fontWeight: "var(--type-panel-title-weight)",
            letterSpacing: "var(--letter-spacing-tight)",
          },
        ],
        "section-title": [
          "var(--type-section-title-size)",
          {
            lineHeight: "var(--type-section-title-line-height)",
            fontWeight: "var(--type-section-title-weight)",
            letterSpacing: "var(--letter-spacing-tight)",
          },
        ],
        "page-title": [
          "var(--type-page-title-size)",
          {
            lineHeight: "var(--type-page-title-line-height)",
            fontWeight: "var(--type-page-title-weight)",
            letterSpacing: "var(--letter-spacing-tight)",
          },
        ],
      },
      spacing: {
        "space-1": "var(--space-1)",
        "space-2": "var(--space-2)",
        "space-3": "var(--space-3)",
        "space-4": "var(--space-4)",
        "space-5": "var(--space-5)",
        "space-6": "var(--space-6)",
        "space-8": "var(--space-8)",
        "space-10": "var(--space-10)",
        "space-12": "var(--space-12)",
        "space-16": "var(--space-16)",
        "space-20": "var(--space-20)",
        "space-24": "var(--space-24)",
        "18": "4.5rem",
        "22": "5.5rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        bounce: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 3s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-in-up": "fade-in-up 0.4s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        pulse: "pulse 2s ease-in-out infinite",
        bounce: "bounce 1s ease-in-out infinite",
      },
      boxShadow: {
        "card": "0 2px 8px -2px rgba(0, 0, 0, 0.1), 0 4px 12px -4px rgba(0, 0, 0, 0.08)",
        "card-hover": "0 8px 24px -4px rgba(0, 0, 0, 0.12), 0 12px 32px -8px rgba(0, 0, 0, 0.08)",
        "button": "0 2px 4px 0 rgba(0, 0, 0, 0.1)",
        "button-hover": "0 4px 8px 0 rgba(0, 0, 0, 0.15)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
