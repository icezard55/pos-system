// ธีมหน้าร้านค้าออนไลน์ — แต่ละร้านเลือกได้ในหน้า "ตั้งค่าร้าน"
// สีทั้งหมดเป็นค่า RGB (คั่นด้วยช่องว่าง) เพื่อใช้กับ Tailwind แบบ bg-sf-primary / bg-sf-primary/10
import type { CSSProperties } from "react";

export type StorefrontThemeId = "modern" | "minimal" | "warm" | "fresh" | "luxury" | "playful";

export interface StorefrontTheme {
  id: StorefrontThemeId;
  label: string;
  description: string;
  vars: {
    primary: string;
    primaryDark: string;
    onPrimary: string;
    accent: string;
    price: string;
    bg: string;
    surface: string;
    ink: string;
    muted: string;
    line: string;
    soft: string;
    heroFrom: string;
    heroTo: string;
    heroInk: string;
    radius: string; // การ์ดสินค้า/กล่อง
    btnRadius: string; // ปุ่ม
  };
  layout: {
    heroAlign: "left" | "center";
    cardStyle: "shadow" | "border" | "flat";
    imageAspect: "square" | "portrait";
    grid: string; // คลาส grid columns
    upperTitle: boolean; // หัวข้อตัวพิมพ์ใหญ่ห่างๆ (สไตล์บูติก)
  };
}

export const STOREFRONT_THEMES: StorefrontTheme[] = [
  {
    id: "modern",
    label: "โมเดิร์น",
    description: "สีม่วงน้ำเงินไล่เฉด ทันสมัย เหมาะกับทุกร้าน",
    vars: {
      primary: "79 70 229", primaryDark: "67 56 202", onPrimary: "255 255 255", accent: "244 63 94", price: "67 56 202",
      bg: "248 250 252", surface: "255 255 255", ink: "17 24 39", muted: "107 114 128", line: "229 231 235", soft: "238 242 255",
      heroFrom: "79 70 229", heroTo: "124 58 237", heroInk: "255 255 255", radius: "1rem", btnRadius: "9999px",
    },
    layout: { heroAlign: "left", cardStyle: "shadow", imageAspect: "square", grid: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5", upperTitle: false },
  },
  {
    id: "minimal",
    label: "มินิมอล",
    description: "ขาว-ดำ เรียบหรู เน้นรูปสินค้า สไตล์แบรนด์แฟชั่น",
    vars: {
      primary: "17 17 17", primaryDark: "0 0 0", onPrimary: "255 255 255", accent: "220 38 38", price: "17 17 17",
      bg: "255 255 255", surface: "255 255 255", ink: "17 17 17", muted: "115 115 115", line: "229 229 229", soft: "245 245 245",
      heroFrom: "245 245 245", heroTo: "245 245 245", heroInk: "17 17 17", radius: "0.25rem", btnRadius: "0.25rem",
    },
    layout: { heroAlign: "center", cardStyle: "flat", imageAspect: "portrait", grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4", upperTitle: true },
  },
  {
    id: "warm",
    label: "อบอุ่น",
    description: "โทนส้ม-น้ำตาล ครีม เหมาะกับร้านอาหาร คาเฟ่ ของฝาก",
    vars: {
      primary: "217 119 6", primaryDark: "180 83 9", onPrimary: "255 255 255", accent: "190 18 60", price: "154 52 18",
      bg: "253 248 240", surface: "255 255 255", ink: "68 39 20", muted: "146 112 86", line: "238 224 204", soft: "254 243 224",
      heroFrom: "234 88 12", heroTo: "217 119 6", heroInk: "255 255 255", radius: "1.25rem", btnRadius: "9999px",
    },
    layout: { heroAlign: "left", cardStyle: "border", imageAspect: "square", grid: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4", upperTitle: false },
  },
  {
    id: "fresh",
    label: "สดชื่น",
    description: "เขียวมิ้นต์ สะอาดตา เหมาะกับสินค้าสุขภาพ ผักผลไม้ ของใช้",
    vars: {
      primary: "5 150 105", primaryDark: "4 120 87", onPrimary: "255 255 255", accent: "234 88 12", price: "4 120 87",
      bg: "240 253 248", surface: "255 255 255", ink: "6 47 37", muted: "75 115 100", line: "209 236 225", soft: "220 252 238",
      heroFrom: "16 185 129", heroTo: "13 148 136", heroInk: "255 255 255", radius: "0.875rem", btnRadius: "0.75rem",
    },
    layout: { heroAlign: "left", cardStyle: "shadow", imageAspect: "square", grid: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5", upperTitle: false },
  },
  {
    id: "luxury",
    label: "หรูหรา",
    description: "พื้นดำ ทอง พรีเมียม เหมาะกับเครื่องประดับ น้ำหอม สินค้าราคาสูง",
    vars: {
      primary: "212 175 55", primaryDark: "184 148 34", onPrimary: "17 17 17", accent: "212 175 55", price: "232 199 102",
      bg: "12 12 14", surface: "24 24 28", ink: "245 240 228", muted: "161 154 140", line: "52 50 46", soft: "38 35 28",
      heroFrom: "24 24 28", heroTo: "46 38 20", heroInk: "245 240 228", radius: "0.375rem", btnRadius: "0.25rem",
    },
    layout: { heroAlign: "center", cardStyle: "border", imageAspect: "portrait", grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4", upperTitle: true },
  },
  {
    id: "playful",
    label: "สดใส",
    description: "ชมพู-ส้ม สนุก น่ารัก เหมาะกับของเล่น เครื่องสำอาง ของขวัญ",
    vars: {
      primary: "236 72 153", primaryDark: "219 39 119", onPrimary: "255 255 255", accent: "249 115 22", price: "219 39 119",
      bg: "253 242 248", surface: "255 255 255", ink: "80 7 36", muted: "157 92 122", line: "251 207 232", soft: "252 231 243",
      heroFrom: "236 72 153", heroTo: "249 115 22", heroInk: "255 255 255", radius: "1.5rem", btnRadius: "9999px",
    },
    layout: { heroAlign: "center", cardStyle: "shadow", imageAspect: "square", grid: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4", upperTitle: false },
  },
];

export function getStorefrontTheme(id: string | null | undefined): StorefrontTheme {
  return STOREFRONT_THEMES.find((t) => t.id === id) ?? STOREFRONT_THEMES[0];
}

export function storefrontThemeStyle(theme: StorefrontTheme): CSSProperties {
  const v = theme.vars;
  return {
    ["--sf-primary" as any]: v.primary,
    ["--sf-primary-dark" as any]: v.primaryDark,
    ["--sf-on-primary" as any]: v.onPrimary,
    ["--sf-accent" as any]: v.accent,
    ["--sf-price" as any]: v.price,
    ["--sf-bg" as any]: v.bg,
    ["--sf-surface" as any]: v.surface,
    ["--sf-ink" as any]: v.ink,
    ["--sf-muted" as any]: v.muted,
    ["--sf-line" as any]: v.line,
    ["--sf-soft" as any]: v.soft,
    ["--sf-hero-from" as any]: v.heroFrom,
    ["--sf-hero-to" as any]: v.heroTo,
    ["--sf-hero-ink" as any]: v.heroInk,
    ["--sf-radius" as any]: v.radius,
    ["--sf-btn-radius" as any]: v.btnRadius,
  };
}
