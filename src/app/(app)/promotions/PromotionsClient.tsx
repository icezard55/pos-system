"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Promotion } from "@/lib/types";
import { promotionBadgeText } from "@/lib/types";

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  sell_price: number;
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PromotionsClient({
  promotions,
  products,
}: {
  promotions: Promotion[];
  products: ProductLite[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");

  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [buyQty, setBuyQty] = useState("1");
  const [getQty, setGetQty] = useState("1");
  const [getDiscountPct, setGetDiscountPct] = useState("100");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const matchingProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)).slice(0, 20);
  }, [products, productQuery]);

  function resetForm() {
    setProductId("");
    setProductQuery("");
    setName("");
    setBuyQty("1");
    setGetQty("1");
    setGetDiscountPct("100");
    setValidUntil("");
    setNote("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productId) {
      setError("กรุณาเลือกสินค้า");
      return;
    }
    if (!name.trim()) {
      setError("กรุณาตั้งชื่อโปรโมชั่น");
      return;
    }
    if (!buyQty || Number(buyQty) <= 0 || !getQty || Number(getQty) <= 0) {
      setError("กรุณากรอกจำนวนซื้อ/แถมให้ถูกต้อง");
      return;
    }
    if (!getDiscountPct || Number(getDiscountPct) <= 0 || Number(getDiscountPct) > 100) {
      setError("เปอร์เซ็นต์ส่วนลดต้องอยู่ระหว่าง 1-100");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("promotions").insert({
        product_id: productId,
        name: name.trim(),
        buy_qty: Number(buyQty),
        get_qty: Number(getQty),
        get_discount_pct: Number(getDiscountPct),
        valid_until: validUntil ? new Date(validUntil + "T23:59:59").toISOString() : null,
        note: note.trim() || null,
      });
      if (error) throw error;
      resetForm();
      setShowAdd(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "สร้างโปรโมชั่นไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Promotion) {
    setError(null);
    try {
      const { error } = await supabase.from("promotions").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "อัปเดตไม่สำเร็จ");
    }
  }

  async function handleDelete(p: Promotion) {
    if (!confirm(`ลบโปรโมชั่น "${p.name}" ใช่หรือไม่?`)) return;
    setError(null);
    try {
      const { error } = await supabase.from("promotions").delete().eq("id", p.id);
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
        <h1 className="text-2xl font-bold">โปรโมชั่นซื้อ X แถม/ลด Y</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {showAdd ? "ยกเลิก" : "+ สร้างโปรโมชั่นใหม่"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 grid grid-cols-1 gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">สินค้า</label>
            {productId ? (
              <div className="flex items-center justify-between rounded-lg bg-brand/5 px-3 py-2 text-sm">
                <span>{productsById.get(productId)?.name} {productsById.get(productId)?.sku ? `(${productsById.get(productId)?.sku})` : ""}</span>
                <button type="button" onClick={() => setProductId("")} className="text-xs text-red-500">เปลี่ยน</button>
              </div>
            ) : (
              <div>
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="ค้นหาชื่อสินค้าหรือรหัส..."
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                {productQuery.trim() && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border bg-white shadow-sm">
                    {matchingProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setProductId(p.id);
                          setProductQuery("");
                          if (!name.trim()) setName(`โปรโมชั่น ${p.name}`);
                        }}
                        className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                      >
                        {p.name} {p.sku ? `(${p.sku})` : ""} · ฿{Number(p.sell_price).toLocaleString("th-TH")}
                      </button>
                    ))}
                    {matchingProducts.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">ไม่พบสินค้า</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">ชื่อโปรโมชั่น (สำหรับดูภายใน)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ซื้อ 2 แถม 1"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">ซื้อครบ (ชิ้น)</label>
            <input type="number" min={1} step={1} value={buyQty} onChange={(e) => setBuyQty(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">แถม/ลดราคา (ชิ้น)</label>
            <input type="number" min={1} step={1} value={getQty} onChange={(e) => setGetQty(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">ส่วนลดของชิ้นที่แถม (%) — 100% คือแถมฟรี</label>
            <input type="number" min={1} max={100} step="0.01" value={getDiscountPct} onChange={(e) => setGetDiscountPct(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">วันหมดอายุโปรโมชั่น (ไม่บังคับ)</label>
            <input type="date" min={today} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">หมายเหตุ (ไม่บังคับ)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {buyQty && getQty && (
            <p className="text-xs text-gray-400 sm:col-span-2">
              ตัวอย่าง: ลูกค้าซื้อครบ {Number(buyQty) + Number(getQty)} ชิ้น จะได้รับส่วนลด {getDiscountPct}% สำหรับ {getQty} ชิ้นสุดท้ายในแต่ละรอบ
              (ระบบคำนวณและใช้ส่วนลดนี้ให้อัตโนมัติทั้งหน้า POS และร้านค้าออนไลน์)
            </p>
          )}
          {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-2"
          >
            {busy ? "กำลังบันทึก..." : "สร้างโปรโมชั่น"}
          </button>
        </form>
      )}

      {!showAdd && error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3">โปรโมชั่น</th>
              <th className="px-4 py-3">สินค้า</th>
              <th className="px-4 py-3">เงื่อนไข</th>
              <th className="px-4 py-3">หมดอายุ</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {promotions.map((p) => {
              const expired = p.valid_until ? new Date(p.valid_until) < new Date() : false;
              const product = productsById.get(p.product_id);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{product?.name ?? "(ไม่พบสินค้า)"}</td>
                  <td className="px-4 py-3 text-gray-600">{promotionBadgeText(p)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.valid_until ? new Date(p.valid_until).toLocaleDateString("th-TH") : "ไม่มีกำหนด"}
                  </td>
                  <td className="px-4 py-3">
                    {!p.is_active ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">ปิดใช้งาน</span>
                    ) : expired ? (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">หมดอายุ</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">ใช้งานได้</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => toggleActive(p)} className="text-xs font-medium text-brand hover:underline">
                        {p.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                      <button onClick={() => handleDelete(p)} className="text-xs font-medium text-red-500 hover:underline">
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {promotions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">ยังไม่มีโปรโมชั่น</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
