"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: "📊", roles: ["admin", "cashier"] },
  { href: "/pos", label: "บันทึกการขาย", icon: "🛒", roles: ["admin", "cashier"] },
  { href: "/shift", label: "เปิด-ปิดกะ", icon: "💰", roles: ["admin", "cashier"] },
  { href: "/sales", label: "ประวัติการขาย", icon: "🧾", roles: ["admin", "cashier"] },
  { href: "/customers", label: "ลูกค้า/สมาชิก", icon: "🧑‍🤝‍🧑", roles: ["admin", "cashier"] },
  { href: "/products", label: "จัดการสต๊อกสินค้า", icon: "📦", roles: ["admin"] },
  { href: "/stock-adjustments", label: "ปรับสต๊อก", icon: "🛠️", roles: ["admin"] },
  { href: "/purchase-orders", label: "ใบสั่งซื้อ", icon: "📥", roles: ["admin"] },
  { href: "/suppliers", label: "ผู้จัดจำหน่าย", icon: "🚚", roles: ["admin"] },
  { href: "/reports", label: "รายงาน", icon: "📈", roles: ["admin"] },
  { href: "/users", label: "จัดการผู้ใช้", icon: "👥", roles: ["admin"] },
  { href: "/audit-log", label: "ประวัติการดำเนินการ", icon: "🔍", roles: ["admin"] },
  { href: "/settings", label: "ตั้งค่าร้าน", icon: "⚙️", roles: ["admin"] },
];

export default function NavClient({
  email,
  fullName,
  role,
}: {
  email: string;
  fullName: string;
  role: "admin" | "cashier";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="no-print flex w-64 shrink-0 flex-col bg-gray-900 text-white">
      <div className="border-b border-gray-700 p-5">
        <p className="text-sm font-semibold">ระบบขาย &amp; สต๊อกสินค้า</p>
        <p className="mt-1 truncate text-xs text-gray-400">{fullName || email}</p>
        <span className="mt-1 inline-block rounded bg-brand px-2 py-0.5 text-[10px] uppercase">
          {role === "admin" ? "ผู้ดูแลระบบ" : "พนักงานขาย"}
        </span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {links
          .filter((l) => l.roles.includes(role))
          .map((l) => (
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
  );
}
