"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DiscountCode, DiscountType } from "@/lib/types";
import { DISCOUNT_TYPE_LABEL } from "@/lib/types";

function money(n: number) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DiscountCodesClient({ codes }: { codes: DiscountCode[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [maxUses, setMaxUses] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");

  function resetForm() {
    setCode("");
    setDiscountType("percent");
    setDiscountValue("");
    setMaxDiscountAmount("");
    setMinOrderAmount("0");
    setMaxUses("");
    setValidUntil("");
    setNote("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError("กรุณาระบุโค้ดส่วนลด");
      return;
    }
    if (!discountValue || Number(discountValue) <= 0) {
      setError("กรุณากรอกมูลค่าส่วนลดให้ถูกต้อง");
      return;
    }
    if (discountType === "percent" && Number(discountValue) > 100) {
      setError("ส่วนลดแบบเปอร์เซ็นต์ต้องไม่เกิน 100");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("discount_codes").insert({
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: Number(discountValue),
        max_discount_amount: discountType === "percent" && maxDiscountAmount ? Number(maxDiscountAmount) : null,
        min_order_amount: Number(minOrderAmount) || 0,
        max_uses: maxUses ? Number(maxUses) : null,
        valid_until: validUntil ? new Date(validUntil + "T23:59:59").toISOString() : null,
        note: note.trim() || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("มีโค้ดนี้อยู่แล้ว กรุณาตั้งชื่อโค้ดใหม่");
        throw error;
      }
      resetForm();
      setShowAdd(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เพิ่มโค้ดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c: DiscountCode) {
    setError(null);
    try {
      const { error } = await supabase.from("discount_codes").update({ is_active: !c.is_active }).eq("id", c.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตไม่สำเร็จ");
    }
  }

  async function handleDelete(c: DiscountCode) {
    if (!confirm(`ลบโค้ด "${c.code}" ใช่หรือไม่?`)) return;
    setError(null);
    try {
      const { error } = await supabase.from("discount_codes").delete().eq("id", c.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ลบไม่สำเร็จ");
    }
  }

  const today = toLocalISODate(new Date());

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">โค้ดส่วนลด</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {showAdd ? "ยกเลิก" : "+ สร้างโค้ดใหม่"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 grid grid-cols-1 gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-gray-600">โค้ดส่วนลด</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="เช่น SAVE10"
              className="w-full rounded-lg border px-3 py-2 text-sm uppercase"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">ประเภทส่วนลด</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              {(Object.keys(DISCOUNT_TYPE_LABEL) as DiscountType[]).map((t) => (
                <option key={t} value={t}>{DISCOUNT_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              มูลค่าส่วนลด {discountType === "percent" ? "(%)" : "(บาท)"}
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          {discountType === "percent" && (
            <div>
              <label className="mb-1 block text-xs text-gray-600">ส่วนลดสูงสุด (บาท, ไม่บังคับ)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={maxDiscountAmount}
                onChange={(e) => setMaxDiscountAmount(e.target.value)}
                placeholder="ไม่จำกัด"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-gray-600">ยอดซื้อขั้นต่ำ (บาท)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={minOrderAmount}
              onChange={(e) => setMinOrderAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">จำนวนครั้งที่ใช้ได้ (ไม่บังคับ)</label>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="ไม่จำกัด"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">วันหมดอายุ (ไม่บังคับ)</label>
            <input
              type="date"
              min={today}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">หมายเหตุ (ไม่บังคับ)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น โปรโมชั่นเปิดร้าน, แจกลูกค้า VIP"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-2"
          >
            {busy ? "กำลังบันทึก..." : "สร้างโค้ดส่วนลด"}
          </button>
          <p className="text-xs text-gray-400 sm:col-span-2">
            ใช้ได้ทั้งหน้าร้าน (บันทึกการขาย) และร้านค้าออนไลน์ — ลูกค้ากรอกโค้ดนี้ตอนชำระเงินเพื่อรับส่วนลด
          </p>
        </form>
      )}

      {!showAdd && error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3">โค้ด</th>
              <th className="px-4 py-3">ส่วนลด</th>
              <th className="px-4 py-3">ยอดซื้อขั้นต่ำ</th>
              <th className="px-4 py-3">ใช้ไปแล้ว</th>
              <th className="px-4 py-3">หมดอายุ</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {codes.map((c) => {
              const expired = c.valid_until ? new Date(c.valid_until) < new Date() : false;
              const usedUp = c.max_uses !== null && c.used_count >= c.max_uses;
              return (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{c.code}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.discount_type === "percent"
                      ? `${c.discount_value}%${c.max_discount_amount ? ` (สูงสุด ฿${money(c.max_discount_amount)})` : ""}`
                      : `฿${money(c.discount_value)}`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.min_order_amount > 0 ? `฿${money(c.min_order_amount)}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.used_count}{c.max_uses !== null ? ` / ${c.max_uses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.valid_until ? new Date(c.valid_until).toLocaleDateString("th-TH") : "ไม่มีกำหนด"}
                  </td>
                  <td className="px-4 py-3">
                    {!c.is_active ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">ปิดใช้งาน</span>
                    ) : expired ? (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">หมดอายุ</span>
                    ) : usedUp ? (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">ใช้ครบแล้ว</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">ใช้งานได้</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => toggleActive(c)} className="text-xs font-medium text-brand hover:underline">
                        {c.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                      <button onClick={() => handleDelete(c)} className="text-xs font-medium text-red-500 hover:underline">
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {codes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">ยังไม่มีโค้ดส่วนลด</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
