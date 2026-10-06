"use client";
import { useEffect } from "react";
import { STOREFRONT_THEMES, storefrontThemeStyle } from "@/lib/storefrontThemes";

// ดูตัวอย่างธีมโดยไม่เปลี่ยนค่าจริงของร้าน: เปิดหน้าร้านด้วย ?theme=minimal เป็นต้น
export default function ThemePreview() {
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("theme");
    const t = STOREFRONT_THEMES.find((x) => x.id === id);
    const root = document.querySelector<HTMLElement>(".sf-root");
    if (!t || !root) return;
    const vars = storefrontThemeStyle(t) as Record<string, string>;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.theme = t.id;
  }, []);
  return null;
}
