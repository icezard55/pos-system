import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

export default async function AccountSuspendedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accessRows } = await supabase.rpc("my_access_status");
  const access = Array.isArray(accessRows) ? accessRows[0] : accessRows;

  // ถ้าจริงๆ แล้วยังใช้งานได้ (เช่น เพิ่งต่ออายุ) ก็เด้งกลับเข้าระบบตามปกติ
  if (access && access.is_active !== false) {
    redirect("/dashboard");
  }

  const trialEnded = access?.trial_ends_at ? formatDate(access.trial_ends_at) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mb-3 text-4xl">⏰</div>
        <h1 className="mb-2 text-lg font-bold text-gray-800">ระบบหยุดให้บริการชั่วคราว</h1>
        <p className="mb-1 text-sm text-gray-600">
          {trialEnded
            ? `ช่วงทดลองใช้ฟรีของร้าน "${access?.shop_name ?? ""}" สิ้นสุดเมื่อวันที่ ${trialEnded} แล้ว`
            : "บัญชีของร้านนี้ยังไม่ได้ชำระค่าบริการ หรือหมดอายุการใช้งาน"}
        </p>
        <p className="mb-6 text-sm text-gray-600">กรุณาติดต่อผู้ดูแลระบบเพื่อชำระเงินและเปิดใช้งานต่อ</p>
        <a
          href="/login"
          className="inline-block rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </a>
      </div>
    </div>
  );
}
