import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavClient from "./NavClient";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_platform_owner")
    .eq("id", user.id)
    .single();

  // เช็คสถานะ trial/การชำระเงินของร้าน — เป็นชั้น UX เท่านั้น ตัวบังคับจริงอยู่ที่ current_shop_id()
  // ใน RLS ระดับฐานข้อมูล (คืนค่า null เมื่อหมดอายุ ทำให้เข้าถึงข้อมูลไม่ได้อยู่แล้วแม้พลาดหน้านี้ไป)
  const { data: accessRows } = await supabase.rpc("my_access_status");
  const access = Array.isArray(accessRows) ? accessRows[0] : accessRows;
  if (access && access.is_active === false) {
    redirect("/account-suspended");
  }

  return (
    <div className="flex min-h-screen">
      <NavClient
        email={user.email ?? ""}
        fullName={profile?.full_name ?? ""}
        role={(profile?.role as "admin" | "cashier") ?? "cashier"}
        isPlatformOwner={profile?.is_platform_owner ?? false}
      />
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
