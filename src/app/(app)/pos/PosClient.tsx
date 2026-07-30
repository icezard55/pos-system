"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CartLine, Product } from "@/lib/types";
import { splitVat } from "@/lib/types";

export default function PosClient({ products }: { products: Product[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)).slice(0, 30);
  }, [products, search]);

  const subtotal = cart.reduce((s, l) => s + l.product.sell_price * l.qty, 0);
  const total = Math.max(subtotal - (Number(discount) || 0), 0);
  const { base: vatBase, vat } = splitVat(total);

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { product: p, qty: 1 }];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, qty } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  // Barcode scanners act as a keyboard: they type the code fast and end with Enter.
  // Pressing Enter in the search box with an exact SKU/barcode match adds it straight to the cart.
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = search.trim().toLowerCase();
    if (!code) return;
    const exact = products.find((p) => (p.sku ?? "").toLowerCase() === code);
    if (exact) {
      if (exact.stock_qty <= 0) {
        setScanMsg(`"${exact.name}" สินค้าหมดสต๊อก`);
      } else {
        addToCart(exact);
        setScanMsg(`เพิ่ม "${exact.name}" แล้ว`);
      }
      setSearch("");
    } else {
      setScanMsg(`ไม่พบสินค้ารหัส "${search}"`);
    }
    window.setTimeout(() => setScanMsg(null), 2500);
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const items = cart.map((l) => ({ product_id: l.product.id, qty: l.qty }));
      const { data, error } = await supabase.rpc("create_sale", {
        p_items: items,
        p_discount: Number(discount) || 0,
        p_payment_method: paymentMethod,
        p_customer_name: customerName || null,
      });
      if (error) throw error;
      const saleId = data?.[0]?.sale_id;
      setCart([]);
      setDiscount("0");
      setCustomerName("");
      if (saleId) router.push(`/receipt/${saleId}`);
    } catch (err: any) {
      setError(err.message ?? "บันทึกการขายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="mb-4 text-2xl font-bold">บันทึกการขาย</h1>
        <input
          autoFocus
          placeholder="ค้นหาสินค้าด้วยชื่อหรือรหัส หรือยิงบาร์โค้ด..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <p className="mb-4 mt-1 text-xs text-gray-400">
          {scanMsg ?? "เชื่อมเครื่องสแกนบาร์โค้ด (USB/บลูทูธ) แล้วยิงรหัสสินค้าที่ช่องนี้ได้เลย ระบบจะเพิ่มลงตะกร้าอัตโนมัติ"}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.stock_qty <= 0}
              className="rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-brand hover:shadow disabled:cursor-not-allowed disabled:opacity-40"
            >
              <p className="text-sm font-semibold text-gray-800 line-clamp-2">{p.name}</p>
              <p className="mt-1 text-xs text-gray-500">คงเหลือ {p.stock_qty} {p.unit}</p>
              <p className="mt-1 font-bold text-brand">฿{Number(p.sell_price).toLocaleString("th-TH")}</p>
            </button>
          ))}
          {filtered.length === 0 && <p className="col-span-full text-sm text-gray-400">ไม่พบสินค้า</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
        <h2 className="mb-3 font-bold text-gray-800">🧾 ตะกร้าสินค้า</h2>
        {cart.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {cart.map((l) => (
              <div key={l.product.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{l.product.name}</p>
                  <p className="text-xs text-gray-500">฿{l.product.sell_price} x {l.qty}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={l.product.stock_qty}
                  value={l.qty}
                  onChange={(e) => updateQty(l.product.id, Number(e.target.value))}
                  className="w-16 rounded border px-2 py-1 text-center text-sm"
                />
                <button onClick={() => removeLine(l.product.id)} className="text-red-500">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2 border-t pt-4 text-sm">
          <div>
            <label className="mb-1 block text-xs text-gray-600">ชื่อลูกค้า (ถ้ามี)</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">วิธีชำระเงิน</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm">
              <option value="cash">เงินสด</option>
              <option value="transfer">โอนเงิน</option>
              <option value="card">บัตร</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">ส่วนลด (บาท)</label>
            <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" />
          </div>

          <div className="flex justify-between pt-2 text-gray-600">
            <span>ยอดรวม</span>
            <span>฿{subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-gray-900">
            <span>สุทธิ</span>
            <span>฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>ในนี้เป็น VAT 7% (รวมในราคาแล้ว)</span>
            <span>฿{vat.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (ก่อน VAT ฿{vatBase.toLocaleString("th-TH", { minimumFractionDigits: 2 })})</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleCheckout}
            disabled={busy || cart.length === 0}
            className="mt-2 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก..." : "✅ ยืนยันการขาย"}
          </button>
        </div>
      </div>
    </div>
  );
}
