"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ProductOption {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  stock_qty: number;
}

function productLabel(p: ProductOption | undefined): string {
  if (!p) return "";
  return p.sku ? `[${p.sku}] ${p.name}` : p.name;
}

function ProductAutocomplete({
  products,
  value,
  onSelect,
}: {
  products: ProductOption[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(() => productLabel(products.find((p) => p.id === value)));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(productLabel(products.find((p) => p.id === value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products
      .filter((p) => `${p.sku ?? ""} ${p.name}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์รหัสหรือชื่อสินค้าเพื่อค้นหา..."
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-lg">
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">ไม่พบสินค้า</p>}
          {filtered.map((p) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={() => {
                onSelect(p.id);
                setQuery(productLabel(p));
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              {productLabel(p)}
              <span className="ml-1 text-xs text-gray-400">(คงเหลือ {p.stock_qty} {p.unit})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Movement {
  id: string;
  product_id: string;
  change_qty: number;
  reason: string | null;
  note: string | null;
  created_at: string;
  products: { name: string } | { name: string }[] | null;
}

function productName(m: Movement): string {
  if (!m.products) return "-";
  return Array.isArray(m.products) ? m.products[0]?.name ?? "-" : m.products.name;
}

export default function StockAdjustmentsClient({
  products,
  movements,
}: {
  products: ProductOption[];
  movements: Movement[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === productId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const qtyNum = Number(qty);
    if (!productId || !qtyNum || qtyNum <= 0) {
      setError("กรุณาเลือกสินค้าและระบุจำนวนที่มากกว่า 0");
      return;
    }
    const changeQty = direction === "in" ? qtyNum : -qtyNum;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("adjust_stock", {
        p_product_id: productId,
        p_change_qty: changeQty,
        p_note: note || null,
      });
      if (error) throw error;
      setSuccess("ปรับสต๊อกสำเร็จ");
      setQty("");
      setNote("");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "ปรับสต๊อกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">ปรับสต๊อกสินค้า</h1>

      <form onSubmit={handleSubmit} className="mb-8 grid gap-4 rounded-2xl bg-white p-6 shadow-sm sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">สินค้า</label>
          <ProductAutocomplete products={products} value={productId} onSelect={setProductId} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ประเภทการปรับ</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection("in")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${direction === "in" ? "border-green-600 bg-green-50 text-green-700" : "text-gray-500"}`}
            >
              เพิ่มสต๊อก (+)
            </button>
            <button
              type="button"
              onClick={() => setDirection("out")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${direction === "out" ? "border-red-600 bg-red-50 text-red-700" : "text-gray-500"}`}
            >
              ลดสต๊อก (-)
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">จำนวน{selectedProduct ? ` (${selectedProduct.unit})` : ""}</label>
          <input
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ (ไม่บังคับ)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น สินค้าเสียหาย, นับสต๊อกจริง, รับสินค้าเข้า"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {success && <p className="text-sm text-green-600 sm:col-span-2">{success}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? "กำลังบันทึก..." : "บันทึกการปรับสต๊อก"}
          </button>
        </div>
      </form>

      <h2 className="mb-3 text-lg font-semibold">ประวัติการปรับสต๊อกล่าสุด</h2>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3">สินค้า</th>
              <th className="px-4 py-3">สาเหตุ</th>
              <th className="px-4 py-3 text-right">จำนวนที่เปลี่ยน</th>
              <th className="px-4 py-3">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{new Date(m.created_at).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3">{productName(m)}</td>
                <td className="px-4 py-3 text-gray-500">{m.reason ?? "-"}</td>
                <td className={`px-4 py-3 text-right font-semibold ${m.change_qty >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {m.change_qty >= 0 ? "+" : ""}{m.change_qty}
                </td>
                <td className="px-4 py-3 text-gray-500">{m.note ?? "-"}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">ยังไม่มีประวัติการปรับสต๊อก</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
