"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CashShift } from "@/lib/types";

export default function ShiftClient({
  openShift,
  history,
  isAdmin,
}: {
  openShift: CashShift | null;
  history: CashShift[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [openingCash, setOpeningCash] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<{ expected: number; counted: number; diff: number } | null>(null);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("open_shift", { p_opening_cash: Number(openingCash) || 0 });
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เปิดกะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!openShift) return;
    if (countedCash === "" || Number(countedCash) < 0) {
      setError("กรุณาระบุยอดเงินสดที่นับได้");
      return;
    }
    if (!confirm("ยืนยันปิดกะ? หลังปิดกะจะไม่สามารถแก้ไขได้")) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("close_shift", {
        p_shift_id: openShift.id,
        p_counted_cash: Number(countedCash),
        p_note: note || null,
      });
      if (error) throw error;
      const row = data?.[0];
      if (row) {
        setCloseResult({ expected: Number(row.expected_cash), counted: Number(row.counted_cash), diff: Number(row.difference) });
      }
      setCountedCash("");
      setNote("");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ปิดกะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">เปิด-ปิดกะเงินสด</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {closeResult && (
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-bold text-gray-800">ผลการปิดกะ</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>เงินสดที่คาดว่าจะมี</span><span>฿{closeResult.expected.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span>เงินสดที่นับได้จริง</span><span>฿{closeResult.counted.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
            <div className={`flex justify-between font-bold ${closeResult.diff === 0 ? "text-green-600" : closeResult.diff > 0 ? "text-blue-600" : "text-red-600"}`}>
              <span>ผลต่าง</span>
              <span>{closeResult.diff > 0 ? "+" : ""}฿{closeResult.diff.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          {closeResult.diff !== 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {closeResult.diff > 0 ? "เงินสดเกินกว่าที่คาดไว้" : "เงินสดขาดจากที่คาดไว้"}
            </p>
          )}
        </div>
      )}

      {!openShift ? (
        <form onSubmit={handleOpen} className="mb-8 max-w-sm rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-bold text-gray-800">เปิดกะใหม่</h2>
          <label className="mb-1 block text-sm font-medium text-gray-700">เงินสดตั้งต้นในลิ้นชัก (บาท)</label>
          <input
            type="number"
            min="0"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            className="mb-4 w-full rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "กำลังเปิดกะ..." : "🟢 เปิดกะ"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleClose} className="mb-8 max-w-sm rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-bold text-gray-800">กะปัจจุบันเปิดอยู่</h2>
          <p className="mb-3 text-xs text-gray-500">
            เปิดเมื่อ {new Date(openShift.opened_at).toLocaleString("th-TH")} · เงินตั้งต้น ฿{Number(openShift.opening_cash).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <label className="mb-1 block text-sm font-medium text-gray-700">นับเงินสดในลิ้นชักได้ (บาท)</label>
          <input
            type="number"
            min="0"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
          <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ (ไม่บังคับ)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mb-4 w-full rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "กำลังปิดกะ..." : "🔴 ปิดกะและกระทบยอด"}
          </button>
        </form>
      )}

      <h2 className="mb-3 text-lg font-semibold">ประวัติกะ{isAdmin ? "ทั้งหมด" : "ของฉัน"}</h2>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">เปิดกะ</th>
              <th className="px-4 py-3">ปิดกะ</th>
              <th className="px-4 py-3 text-right">เงินตั้งต้น</th>
              <th className="px-4 py-3 text-right">คาดว่าจะมี</th>
              <th className="px-4 py-3 text-right">นับได้จริง</th>
              <th className="px-4 py-3 text-right">ผลต่าง</th>
              <th className="px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{new Date(h.opened_at).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3 text-gray-500">{h.closed_at ? new Date(h.closed_at).toLocaleString("th-TH") : "-"}</td>
                <td className="px-4 py-3 text-right">฿{Number(h.opening_cash).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{h.expected_cash != null ? `฿${Number(h.expected_cash).toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "-"}</td>
                <td className="px-4 py-3 text-right">{h.counted_cash != null ? `฿${Number(h.counted_cash).toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "-"}</td>
                <td className={`px-4 py-3 text-right font-medium ${h.difference == null ? "" : Number(h.difference) === 0 ? "text-green-600" : Number(h.difference) > 0 ? "text-blue-600" : "text-red-600"}`}>
                  {h.difference != null ? `${Number(h.difference) > 0 ? "+" : ""}฿${Number(h.difference).toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "-"}
                </td>
                <td className="px-4 py-3">
                  {h.status === "open" ? (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">เปิดอยู่</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">ปิดแล้ว</span>
                  )}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">ยังไม่มีประวัติกะ</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
