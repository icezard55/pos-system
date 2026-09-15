"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ShopRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  trial_ends_at: string | null;
  paid_until: string | null;
  created_at: string;
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function statusOf(s: ShopRow): { label: string; className: string } {
  if (s.trial_ends_at === null && s.paid_until === null) {
    return { label: "ไม่จำกัด (ร้านภายใน)", className: "bg-gray-100 text-gray-700" };
  }
  const now = Date.now();
  const paidOk = s.paid_until && new Date(s.paid_until).getTime() > now;
  const trialOk = s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now;
  if (paidOk) return { label: "จ่ายแล้ว (ใช้งานได้)", className: "bg-green-100 text-green-700" };
  if (trialOk) return { label: "ทดลองใช้", className: "bg-blue-100 text-blue-700" };
  return { label: "หมดอายุ / ถูกล็อก", className: "bg-red-100 text-red-700" };
}

export default function SuperAdminClient({ initialShops }: { initialShops: ShopRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [shops, setShops] = useState<ShopRow[]>(initialShops);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [months, setMonths] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const { data } = await supabase.rpc("list_shops_for_owner");
    setShops((data as ShopRow[]) ?? []);
  }

  async function handleExtend(shopId: string) {
    const m = Number(months[shopId] || "1") || 1;
    if (!confirm(`ยืนยันว่าได้รับเงินแล้ว และต่ออายุร้านนี้อีก ${m} เดือน?`)) return;
    setBusyId(shopId);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc("extend_shop_subscription", {
        p_shop_id: shopId,
        p_months: m,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setMsg(`ต่ออายุสำเร็จ ใช้งานได้ถึง ${formatDate(row?.new_paid_until)}`);
      await refresh();
      router.refresh();
    } catch (err: any) {
      setMsg(err.message ?? "ต่ออายุไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">จัดการร้าน SaaS</h1>
      <p className="mb-4 text-sm text-gray-500">
        ดูสถานะทดลองใช้/การชำระเงินของแต่ละร้าน และกดยืนยันต่ออายุหลังเช็คว่าลูกค้าโอนเงินมาแล้ว
      </p>
      {msg && <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{msg}</div>}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">ร้าน</th>
              <th className="px-4 py-3">ลิงก์ร้านค้าออนไลน์</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3">Trial หมดอายุ</th>
              <th className="px-4 py-3">จ่ายแล้วถึง</th>
              <th className="px-4 py-3">ต่ออายุ</th>
            </tr>
          </thead>
          <tbody>
            {shops.map((s) => {
              const st = statusOf(s);
              const isInternal = s.trial_ends_at === null && s.paid_until === null;
              return (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">/shop/{s.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3">{formatDate(s.trial_ends_at)}</td>
                  <td className="px-4 py-3">{formatDate(s.paid_until)}</td>
                  <td className="px-4 py-3">
                    {isInternal ? (
                      <span className="text-xs text-gray-400">-</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={months[s.id] ?? "1"}
                          onChange={(e) => setMonths((m) => ({ ...m, [s.id]: e.target.value }))}
                          className="w-14 rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <span className="text-xs text-gray-400">เดือน</span>
                        <button
                          onClick={() => handleExtend(s.id)}
                          disabled={busyId === s.id}
                          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {busyId === s.id ? "กำลังบันทึก..." : "✓ ยืนยันรับเงิน"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {shops.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ไม่มีข้อมูลร้านค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
