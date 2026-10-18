"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DashboardClient, { type DashboardData } from "@/app/(app)/dashboard/DashboardClient";

const KEY = (t: string) => `share-pw-${t}`;

export default function ShareClient({ token }: { token: string }) {
  const supabase = createClient();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<{ shop_name: string; data: DashboardData } | null>(null);

  async function unlock(password: string, silent = false) {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("get_shared_dashboard", { p_token: token, p_password: password });
    setBusy(false);
    if (error || !data) {
      if (!silent) setErr("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
      return;
    }
    if (data.ok) {
      try { sessionStorage.setItem(KEY(token), password); } catch {}
      setView({ shop_name: data.shop_name, data: data.data });
    } else {
      try { sessionStorage.removeItem(KEY(token)); } catch {}
      if (silent) return;
      setErr(
        data.error === "locked" ? "ใส่รหัสผิดหลายครั้ง ล็อกชั่วคราว 15 นาที" :
        data.error === "not_found" ? "ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว" :
        "รหัสผ่านไม่ถูกต้อง"
      );
    }
  }

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY(token));
      if (saved) unlock(saved, true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (view) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          <DashboardClient data={view.data} shopName={view.shop_name} readOnly />
          <div className="mt-6 flex items-center justify-between text-xs text-gray-400">
            <span>มุมมองแชร์ (อ่านอย่างเดียว) · ข้อมูล ณ เวลาที่เปิดหน้านี้</span>
            <button onClick={() => unlock(sessionStorage.getItem(KEY(token)) ?? "", true)} className="rounded-lg border bg-white px-3 py-1.5 text-gray-600 hover:bg-gray-50">🔄 รีเฟรชข้อมูล</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (pw) unlock(pw); }}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-lg"
      >
        <div className="text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-1 text-lg font-bold text-gray-800">แดชบอร์ดที่แชร์</h1>
          <p className="text-xs text-gray-500">กรุณาใส่รหัสผ่านที่ได้รับจากเจ้าของร้านเพื่อดูข้อมูล</p>
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="รหัสผ่าน"
          className="w-full rounded-lg border px-3 py-2.5 text-sm"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy || !pw} className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
          {busy ? "กำลังตรวจสอบ..." : "เข้าดูแดชบอร์ด"}
        </button>
      </form>
    </div>
  );
}
