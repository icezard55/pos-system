"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  cost_price: number;
}

interface POItem {
  id: string;
  product_id: string;
  qty: number;
  unit_cost: number;
  products: { name: string; unit: string } | { name: string; unit: string }[] | null;
}

interface PO {
  id: string;
  supplier_id: string | null;
  status: "draft" | "received" | "cancelled";
  note: string | null;
  created_at: string;
  received_at: string | null;
  suppliers: { name: string } | { name: string }[] | null;
  purchase_order_items: POItem[];
}

function oneName(v: { name: string } | { name: string }[] | null): string {
  if (!v) return "-";
  return Array.isArray(v) ? v[0]?.name ?? "-" : v.name;
}

interface DraftLine {
  productId: string;
  qty: string;
  unitCost: string;
}

export default function PurchaseOrdersClient({
  suppliers,
  products,
  orders,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
  orders: PO[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showCreate, setShowCreate] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ productId: products[0]?.id ?? "", qty: "", unitCost: "" }]);
  const [busy, setBusy] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    setLines((prev) => [...prev, { productId: products[0]?.id ?? "", qty: "", unitCost: "" }]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({ product_id: l.productId, qty: Number(l.qty), unit_cost: Number(l.unitCost) || 0 }));
    if (items.length === 0) {
      setError("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_purchase_order", {
        p_supplier_id: supplierId || null,
        p_items: items,
        p_note: note || null,
      });
      if (error) throw error;
      setLines([{ productId: products[0]?.id ?? "", qty: "", unitCost: "" }]);
      setNote("");
      setShowCreate(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "สร้างใบสั่งซื้อไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleReceive(po: PO) {
    if (!confirm(`ยืนยันรับสินค้าเข้าตามใบสั่งซื้อนี้? สต๊อกและราคาทุนจะถูกอัปเดตทันที`)) return;
    setReceivingId(po.id);
    setError(null);
    try {
      const { error } = await supabase.rpc("receive_purchase_order", { p_po_id: po.id });
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "รับสินค้าเข้าไม่สำเร็จ");
    } finally {
      setReceivingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ใบสั่งซื้อสินค้า</h1>
        <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          {showCreate ? "ยกเลิก" : "+ สร้างใบสั่งซื้อ"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-8 space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ผู้จัดจำหน่าย</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">- ไม่ระบุ -</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">รายการสินค้า</label>
            {lines.map((l, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select
                  value={l.productId}
                  onChange={(e) => updateLine(idx, { productId: e.target.value })}
                  className="flex-1 min-w-[10rem] rounded-lg border px-2 py-1.5 text-sm"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku ? `[${p.sku}] ` : ""}{p.name}</option>
                  ))}
                </select>
                <input
                  type="number" min={0} placeholder="จำนวน"
                  value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })}
                  className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  type="number" min={0} placeholder="ราคาทุน/หน่วย"
                  value={l.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                  className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                />
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="text-red-500">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-xs text-brand hover:underline">+ เพิ่มรายการ</button>
          </div>

          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ" className="w-full rounded-lg border px-3 py-2 text-sm" />

          <button type="submit" disabled={busy} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {busy ? "กำลังบันทึก..." : "บันทึกใบสั่งซื้อ (แบบร่าง)"}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {orders.map((po) => (
          <div key={po.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{oneName(po.suppliers)}</p>
                <p className="text-xs text-gray-500">
                  สร้างเมื่อ {new Date(po.created_at).toLocaleString("th-TH")}
                  {po.received_at && ` · รับเข้าเมื่อ ${new Date(po.received_at).toLocaleString("th-TH")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {po.status === "draft" && (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">รอรับสินค้า</span>
                )}
                {po.status === "received" && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">รับเข้าแล้ว</span>
                )}
                {po.status === "draft" && (
                  <button
                    onClick={() => handleReceive(po)}
                    disabled={receivingId === po.id}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {receivingId === po.id ? "กำลังรับ..." : "รับสินค้าเข้า"}
                  </button>
                )}
              </div>
            </div>
            {po.note && <p className="mb-2 text-xs text-gray-500">หมายเหตุ: {po.note}</p>}
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="py-1">สินค้า</th>
                  <th className="py-1 text-right">จำนวน</th>
                  <th className="py-1 text-right">ราคาทุน/หน่วย</th>
                  <th className="py-1 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {po.purchase_order_items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1">{oneName(it.products)}</td>
                    <td className="py-1 text-right">{it.qty}</td>
                    <td className="py-1 text-right">฿{Number(it.unit_cost).toLocaleString("th-TH")}</td>
                    <td className="py-1 text-right">฿{(Number(it.unit_cost) * Number(it.qty)).toLocaleString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-sm text-gray-400">ยังไม่มีใบสั่งซื้อ</p>}
      </div>
    </div>
  );
}
