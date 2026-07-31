"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Sale } from "@/lib/types";

export default function SalesClient({
  sales,
  isAdmin,
  startDate,
  endDate,
  currentUserEmail,
}: {
  sales: Sale[];
  isAdmin: boolean;
  startDate: string;
  endDate: string;
  currentUserEmail: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reauthError, setReauthError] = useState<string | null>(null);

  const filtered = sales.filter(
    (s) => s.sale_no.toLowerCase().includes(search.toLowerCase()) || (s.customer_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const todayTotal = sales
    .filter((s) => s.status !== "void" && new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + Number(s.total), 0);

  function applyRange() {
    router.push(`/sales?start=${start}&end=${end}`);
  }

  function openVoidConfirm(sale: Sale) {
    setVoidTarget(sale);
    setConfirmPassword("");
    setReauthError(null);
  }

  async function handleConfirmVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voidTarget) return;
    setReauthError(null);
    setVoidingId(voidTarget.id);
    try {
      // require the admin to re-enter their own password before an irreversible void
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: currentUserEmail,
        password: confirmPassword,
      });
      if (authError) throw new Error("รหัสผ่านไม่ถูกต้อง");

      const { error } = await supabase.rpc("void_sale", { p_sale_id: voidTarget.id });
      if (error) throw error;
      setVoidTarget(null);
      router.refresh();
    } catch (err: any) {
      setReauthError(err.message ?? "ยกเลิกบิลไม่สำเร็จ");
    } finally {
      setVoidingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ประวัติการขาย</h1>
        <p className="text-sm text-gray-500">
          ยอดขายวันนี้: <span className="font-bold text-brand">฿{todayTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
        </p>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleConfirmVoid} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 font-bold text-gray-800">ยืนยันยกเลิกบิล {voidTarget.sale_no}</h2>
            <p className="mb-3 text-xs text-gray-500">สต๊อกสินค้าจะถูกคืนกลับอัตโนมัติ และไม่สามารถย้อนกลับได้ กรุณายืนยันตัวตนด้วยรหัสผ่านของคุณ</p>
            <input
              type="password"
              autoFocus
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="รหัสผ่านของคุณ"
              required
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            />
            {reauthError && <p className="mb-3 text-sm text-red-600">{reauthError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={voidingId === voidTarget.id}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {voidingId === voidTarget.id ? "กำลังยกเลิก..." : "ยืนยันยกเลิกบิล"}
              </button>
              <button type="button" onClick={() => setVoidTarget(null)} className="flex-1 rounded-lg border py-2 text-sm hover:bg-gray-50">
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-gray-600">จากวันที่</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">ถึงวันที่</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <button onClick={applyRange} className="rounded-lg border px-4 py-1.5 text-sm hover:bg-gray-50">แสดงผล</button>
      </div>

      <input
        placeholder="ค้นหาเลขที่บิลหรือชื่อลูกค้า..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
      />
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">เลขที่บิล</th>
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3">ลูกค้า</th>
              <th className="px-4 py-3">ชำระโดย</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3 text-right">ยอดสุทธิ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isVoid = s.status === "void";
              return (
                <tr key={s.id} className={`border-b last:border-0 hover:bg-gray-50 ${isVoid ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium">{s.sale_no}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3">{s.customer_name ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-500">{s.payment_method}</td>
                  <td className="px-4 py-3">
                    {isVoid ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">ยกเลิกแล้ว</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">สำเร็จ</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${isVoid ? "line-through" : ""}`}>
                    ฿{Number(s.total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/receipt/${s.id}`} className="text-brand hover:underline">ดูใบเสร็จ</Link>
                      {isAdmin && !isVoid && (
                        <button
                          onClick={() => openVoidConfirm(s)}
                          className="text-red-600 hover:underline"
                        >
                          ยกเลิกบิล
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">ไม่มีรายการขาย</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
