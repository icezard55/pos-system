"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: "📊", roles: ["admin", "cashier"] },
  { href: "/pos", label: "บันทึกการขาย", icon: "🛒", roles: ["admin", "cashier"] },
  { href: "/shift", label: "เปิด-ปิดกะ", icon: "💰", roles: ["admin", "cashier"] },
  { href: "/sales", label: "ประวัติการขาย", icon: "🧾", roles: ["admin", "cashier"] },
  { href: "/customers", label: "ลูกค้า/สมาชิก", icon: "🧑‍🤝‍🧑", roles: ["admin", "cashier"] },
  { href: "/online-orders", label: "ออเดอร์ออนไลน์", icon: "🛍️", roles: ["admin"] },
  { href: "/products", label: "จัดการสต๊อกสินค้า", icon: "📦", roles: ["admin"] },
  { href: "/stock-adjustments", label: "ปรับสต๊อก", icon: "🛠️", roles: ["admin"] },
  { href: "/purchase-orders", label: "ใบสั่งซื้อ", icon: "📥", roles: ["admin"] },
  { href: "/suppliers", label: "ผู้จัดจำหน่าย", icon: "🚚", roles: ["admin"] },
  { href: "/accounts-payable", label: "เจ้าหนี้การค้า", icon: "🏦", roles: ["admin"] },
  { href: "/discount-codes", label: "โค้ดส่วนลด", icon: "🎟️", roles: ["admin"] },
  { href: "/promotions", label: "โปรโมชั่น", icon: "🎁", roles: ["admin"] },
  { href: "/loyalty-rewards", label: "ของรางวัลแลกแต้ม", icon: "🏆", roles: ["admin"] },
  { href: "/expenses", label: "รายจ่าย", icon: "💸", roles: ["admin"] },
  { href: "/reports", label: "รายงาน", icon: "📈", roles: ["admin"] },
  { href: "/users", label: "จัดการผู้ใช้", icon: "👥", roles: ["admin"] },
  { href: "/audit-log", label: "ประวัติการดำเนินการ", icon: "🔍", roles: ["admin"] },
  { href: "/settings", label: "ตั้งค่าร้าน", icon: "⚙️", roles: ["admin"] },
];

const ownerLink = { href: "/super-admin", label: "จัดการร้าน SaaS", icon: "🏢" };

export default function NavClient({
  email,
  fullName,
  role,
  isPlatformOwner = false,
}: {
  email: string;
  fullName: string;
  role: "admin" | "cashier";
  isPlatformOwner?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const filteredLinks = links.filter((l) => l.roles.includes(role));
  const primaryLinks = filteredLinks.slice(0, 4);

  return (
    <>
      {/* เมนูด้านข้าง - จอคอมพิวเตอร์/แท็บเล็ตแนวนอน */}
      <aside className="no-print hidden bg-gray-900 text-white lg:flex lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="border-b border-gray-700 p-5">
          <p className="text-sm font-semibold">ระบบขาย &amp; สต๊อกสินค้า</p>
          <p className="mt-1 truncate text-xs text-gray-400">{fullName || email}</p>
          <span className="mt-1 inline-block rounded bg-brand px-2 py-0.5 text-[10px] uppercase">
            {role === "admin" ? "ผู้ดูแลระบบ" : "พนักงานขาย"}
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {filteredLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                pathname === l.href ? "bg-brand text-white" : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
          {isPlatformOwner && (
            <>
              <div className="my-2 border-t border-gray-700" />
              <Link
                href={ownerLink.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  pathname === ownerLink.href ? "bg-brand text-white" : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span>{ownerLink.icon}</span>
                {ownerLink.label}
              </Link>
            </>
          )}
        </nav>
        <div className="border-t border-gray-700 p-3">
          <button
            onClick={handleSignOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800"
          >
            🚪 ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* แท็บด้านล่าง - จอมือถือ */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-800 bg-gray-900 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {primaryLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setMenuOpen(false)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              pathname === l.href ? "text-brand" : "text-gray-400"
            }`}
          >
            <span className="text-lg leading-none">{l.icon}</span>
            {l.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
            menuOpen ? "text-brand" : "text-gray-400"
          }`}
        >
          <span className="text-lg leading-none">☰</span>
          เมนู
        </button>
      </nav>

      {/* เมนูแบบเต็ม - เปิดจากปุ่ม "เมนู" บนมือถือ */}
      {menuOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex flex-col justify-end bg-black/60 lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-gray-900 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-700 p-4">
              <div>
                <p className="text-sm font-semibold">{fullName || email}</p>
                <span className="mt-1 inline-block rounded bg-brand px-2 py-0.5 text-[10px] uppercase">
                  {role === "admin" ? "ผู้ดูแลระบบ" : "พนักงานขาย"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-800"
                aria-label="ปิดเมนู"
              >
                ✕
              </button>
            </div>
            <nav className="space-y-1 p-3">
              {filteredLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    pathname === l.href ? "bg-brand text-white" : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <span>{l.icon}</span>
                  {l.label}
                </Link>
              ))}
              {isPlatformOwner && (
                <>
                  <div className="my-2 border-t border-gray-700" />
                  <Link
                    href={ownerLink.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                      pathname === ownerLink.href ? "bg-brand text-white" : "text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    <span>{ownerLink.icon}</span>
                    {ownerLink.label}
                  </Link>
                </>
              )}
            </nav>
            <div className="border-t border-gray-700 p-3">
              <button
                onClick={handleSignOut}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800"
              >
                🚪 ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
