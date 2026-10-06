import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      borderRadius: {
        sf: "var(--sf-radius)",
        "sf-btn": "var(--sf-btn-radius)",
      },
      backgroundImage: {
        "sf-hero": "linear-gradient(135deg, rgb(var(--sf-hero-from)), rgb(var(--sf-hero-to)))",
      },
      colors: {
        brand: { DEFAULT: "#2563eb", dark: "#1d4ed8" },
        // สีธีมหน้าร้านค้าออนไลน์ (กำหนดค่าจริงผ่าน CSS variables ใน src/lib/storefrontThemes.ts)
        sf: {
          primary: "rgb(var(--sf-primary) / <alpha-value>)",
          "primary-dark": "rgb(var(--sf-primary-dark) / <alpha-value>)",
          "on-primary": "rgb(var(--sf-on-primary) / <alpha-value>)",
          accent: "rgb(var(--sf-accent) / <alpha-value>)",
          price: "rgb(var(--sf-price) / <alpha-value>)",
          bg: "rgb(var(--sf-bg) / <alpha-value>)",
          surface: "rgb(var(--sf-surface) / <alpha-value>)",
          ink: "rgb(var(--sf-ink) / <alpha-value>)",
          muted: "rgb(var(--sf-muted) / <alpha-value>)",
          line: "rgb(var(--sf-line) / <alpha-value>)",
          soft: "rgb(var(--sf-soft) / <alpha-value>)",
          "hero-ink": "rgb(var(--sf-hero-ink) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
