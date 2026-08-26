"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  StorefrontProduct,
  CartItem,
  OnlineOrderDeliveryMethod,
  OnlineOrderPaymentMethod,
} from "@/lib/types";
import { ONLINE_ORDER_PAYMENT_LABEL, ONLINE_ORDER_DELIVERY_LABEL } from "@/lib/types";

const CART_KEY = "shop_cart_v1";

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(cart: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function money(n: number) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type View = "browse" | "cart" | "checkout" | "done";

export default function ShopClient({
  products,
  shopName,
}: {
  products: StorefrontProduct[];
  shopName: string;
}) {
  const supabase = createClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [view, setView] = useState<View>("browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // checkout form
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<OnlineOrderDeliveryMethod>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<OnlineOrderPaymentMethod>("bank_transfer");
  const [note, setNote] = useState("");

  // โค้ดส่วนลด
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [discountCodeMsg, setDiscountCodeMsg] = useState<string | null>(null);
  const [discountCodeChecking, setDiscountCodeChecking] = useState(false);

  // result
  const [placedOrder, setPlacedOrder] = useState<{ order_id: string; order_no: string; total: number } | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipDone, setSlipDone] = useState(false);

  useEffect(() => {
    setCart(loadCart());
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category?.trim() || "ไม่ระบุหมวดหมู่"));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (category !== "all" && (p.category?.trim() || "ไม่ระบุหมวดหมู่") !== category) return false;
      if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [products, category, search]);

  const cartTotal = cart.reduce((s, c) => s + c.sell_price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const discountCodeAmount = appliedDiscount?.amount ?? 0;
  const checkoutTotal = Math.max(cartTotal - discountCodeAmount, 0);

  // ถ้าตะกร้าเปลี่ยนหลังจากใช้โค้ดไปแล้ว ให้ยกเลิกโค้ดเดิม บังคับให้ตรวจสอบใหม่
  useEffect(() => {
    if (appliedDiscount) {
      setAppliedDiscount(null);
      setDiscountCodeMsg("ตะกร้าเปลี่ยนแปลง กรุณากดตรวจสอบโค้ดอีกครั้ง");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartTotal]);

  async function handleApplyDiscountCode() {
    setDiscountCodeMsg(null);
    if (!discountCode.trim()) {
      setDiscountCodeMsg("กรุณากรอกโค้ดส่วนลด");
      return;
    }
    setDiscountCodeChecking(true);
    try {
      const { data, error } = await supabase.rpc("validate_discount_code", {
        p_code: discountCode.trim(),
        p_order_amount: cartTotal,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setAppliedDiscount({ code: row.code, amount: Number(row.discount_amount) });
    } catch (e: any) {
      setAppliedDiscount(null);
      setDiscountCodeMsg(e.message || "โค้ดไม่ถูกต้อง");
    } finally {
      setDiscountCodeChecking(false);
    }
  }

  function removeDiscountCode() {
    setAppliedDiscount(null);
    setDiscountCode("");
    setDiscountCodeMsg(null);
  }

  function updateCart(next: CartItem[]) {
    setCart(next);
    saveCart(next);
  }

  function addToCart(p: StorefrontProduct) {
    const existing = cart.find((c) => c.product_id === p.id);
    const maxQty = Math.floor(Number(p.stock_qty));
    if (maxQty <= 0) return;
    if (existing) {
      if (existing.qty >= maxQty) return;
      updateCart(cart.map((c) => (c.product_id === p.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      updateCart([
        ...cart,
        { product_id: p.id, name: p.name, unit: p.unit, sell_price: Number(p.sell_price), stock_qty: maxQty, qty: 1 },
      ]);
    }
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      updateCart(cart.filter((c) => c.product_id !== productId));
      return;
    }
    updateCart(cart.map((c) => (c.product_id === productId ? { ...c, qty: Math.min(qty, c.stock_qty) } : c)));
  }

  function removeFromCart(productId: string) {
    updateCart(cart.filter((c) => c.product_id !== productId));
  }

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (cart.length === 0) {
      setErr("ตะกร้าสินค้าว่างเปล่า");
      return;
    }
    setSubmitting(true);
    try {
      const items = cart.map((c) => ({ product_id: c.product_id, qty: c.qty }));
      const { data, error } = await supabase.rpc("place_online_order", {
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_customer_address: deliveryMethod === "delivery" ? customerAddress : null,
        p_delivery_method: deliveryMethod,
        p_payment_method: paymentMethod,
        p_items: items,
        p_note: note || null,
        p_discount_code: appliedDiscount?.code ?? null,
        p_customer_email: customerEmail.trim() || null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setPlacedOrder({ order_id: row.order_id, order_no: row.order_no, total: Number(row.total) });
      updateCart([]);
      setDiscountCode("");
      setAppliedDiscount(null);
      setDiscountCodeMsg(null);
      setView("done");
    } catch (e: any) {
      setErr(e.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadSlip() {
    if (!slipFile || !placedOrder) return;
    setSlipUploading(true);
    setErr("");
    try {
      const ext = slipFile.name.split(".").pop() || "jpg";
      const path = `slips/${placedOrder.order_id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("shop-uploads").upload(path, slipFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("shop-uploads").getPublicUrl(path);
      const { error: rpcErr } = await supabase.rpc("attach_payment_slip", {
        p_order_id: placedOrder.order_id,
        p_customer_phone: customerPhone,
        p_slip_url: pub.publicUrl,
      });
      if (rpcErr) throw rpcErr;
      setSlipDone(true);
    } catch (e: any) {
      setErr(e.message || "อัปโหลดสลิปไม่สำเร็จ");
    } finally {
      setSlipUploading(false);
    }
  }

  if (view === "done" && placedOrder) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
        <div className="mb-2 text-4xl">✅</div>
        <h2 className="text-lg font-bold text-gray-800">สั่งซื้อสำเร็จ!</h2>
        <p className="mt-1 text-sm text-gray-500">เลขที่คำสั่งซื้อ</p>
        <p className="text-xl font-bold text-indigo-700">{placedOrder.order_no}</p>
        <p className="mt-2 text-sm text-gray-600">ยอดรวม {money(placedOrder.total)} บาท</p>

        {paymentMethod === "bank_transfer" && !slipDone && (
          <div className="mt-5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 p-4 text-left">
            <p className="mb-2 text-sm font-medium text-gray-700">แนบสลิปการโอนเงิน</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
              className="mb-2 block w-full text-sm"
            />
            <button
              onClick={handleUploadSlip}
              disabled={!slipFile || slipUploading}
              className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {slipUploading ? "กำลังอัปโหลด..." : "อัปโหลดสลิป"}
            </button>
            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
          </div>
        )}
        {paymentMethod === "bank_transfer" && slipDone && (
          <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            แนบสลิปเรียบร้อยแล้ว ร้านค้าจะตรวจสอบและยืนยันคำสั่งซื้อเร็วๆ นี้
          </p>
        )}
        {paymentMethod === "cod" && (
          <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            ร้านค้าจะติดต่อกลับเพื่อยืนยันคำสั่งซื้อ
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <a
            href={`/shop/track?order_no=${encodeURIComponent(placedOrder.order_no)}&phone=${encodeURIComponent(customerPhone)}`}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ติดตามคำสั่งซื้อ
          </a>
          <button
            onClick={() => {
              setPlacedOrder(null);
              setView("browse");
            }}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            เลือกซื้อต่อ
          </button>
        </div>
      </div>
    );
  }

  if (view === "checkout") {
    return (
      <div className="mx-auto max-w-md">
        <button onClick={() => setView("cart")} className="mb-3 text-sm text-gray-500">
          ← กลับไปที่ตะกร้า
        </button>
        <h2 className="mb-3 text-lg font-bold text-gray-800">ข้อมูลการสั่งซื้อ</h2>
        <form onSubmit={handlePlaceOrder} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">ชื่อผู้สั่งซื้อ</label>
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="ชื่อ-นามสกุล"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">เบอร์โทรศัพท์</label>
            <input
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="08xxxxxxxx"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">อีเมล (ไม่บังคับ)</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="example@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">วิธีรับสินค้า</label>
            <div className="flex gap-2">
              {(["delivery", "pickup"] as OnlineOrderDeliveryMethod[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setDeliveryMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    deliveryMethod === m ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "text-gray-600"
                  }`}
                >
                  {ONLINE_ORDER_DELIVERY_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          {deliveryMethod === "delivery" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ที่อยู่จัดส่ง</label>
              <textarea
                required
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                rows={3}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">วิธีชำระเงิน</label>
            <div className="space-y-1.5">
              {(["bank_transfer", "cod", "gateway"] as OnlineOrderPaymentMethod[]).map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    paymentMethod === m ? "border-indigo-600 bg-indigo-50" : ""
                  } ${m === "gateway" ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    disabled={m === "gateway"}
                    checked={paymentMethod === m}
                    onChange={() => setPaymentMethod(m)}
                  />
                  {ONLINE_ORDER_PAYMENT_LABEL[m]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">หมายเหตุ (ถ้ามี)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">โค้ดส่วนลด (ถ้ามี)</label>
            {appliedDiscount ? (
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                <span>
                  ใช้โค้ด <span className="font-mono font-semibold">{appliedDiscount.code}</span> — ลด{" "}
                  {money(appliedDiscount.amount)} บาท
                </span>
                <button type="button" onClick={removeDiscountCode} className="font-medium text-red-500">ยกเลิก</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  placeholder="กรอกโค้ดส่วนลด"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={handleApplyDiscountCode}
                  disabled={discountCodeChecking}
                  className="rounded-lg border border-indigo-600 px-3 py-2 text-xs font-medium text-indigo-600 disabled:opacity-50"
                >
                  {discountCodeChecking ? "กำลังตรวจสอบ..." : "ใช้โค้ด"}
                </button>
              </div>
            )}
            {discountCodeMsg && <p className="mt-1 text-xs text-red-600">{discountCodeMsg}</p>}
          </div>

          <div className="border-t pt-3 text-sm">
            <div className="flex items-center justify-between text-gray-500">
              <span>ยอดสินค้า</span>
              <span>{money(cartTotal)} บาท</span>
            </div>
            {discountCodeAmount > 0 && (
              <div className="flex items-center justify-between text-green-600">
                <span>ส่วนลด</span>
                <span>-{money(discountCodeAmount)} บาท</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between text-base font-bold text-gray-800">
              <span>ยอดรวม</span>
              <span>{money(checkoutTotal)} บาท</span>
            </div>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "กำลังสั่งซื้อ..." : "ยืนยันสั่งซื้อ"}
          </button>
        </form>
      </div>
    );
  }

  if (view === "cart") {
    return (
      <div className="mx-auto max-w-md">
        <button onClick={() => setView("browse")} className="mb-3 text-sm text-gray-500">
          ← เลือกซื้อสินค้าต่อ
        </button>
        <h2 className="mb-3 text-lg font-bold text-gray-800">ตะกร้าสินค้า</h2>
        {cart.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-400 shadow-sm">ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <div className="space-y-2">
            {cart.map((c) => (
              <div key={c.product_id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    {money(c.sell_price)} บาท / {c.unit}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setQty(c.product_id, c.qty - 1)}
                    className="h-7 w-7 rounded-full border text-gray-600"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">{c.qty}</span>
                  <button
                    onClick={() => setQty(c.product_id, c.qty + 1)}
                    disabled={c.qty >= c.stock_qty}
                    className="h-7 w-7 rounded-full border text-gray-600 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <button onClick={() => removeFromCart(c.product_id)} className="text-xs text-red-500">
                  ลบ
                </button>
              </div>
            ))}
            <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
              <span className="text-sm text-gray-500">ยอดรวม</span>
              <span className="text-lg font-bold text-gray-800">{money(cartTotal)} บาท</span>
            </div>
            <button
              onClick={() => setView("checkout")}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white"
            >
              ไปที่หน้าชำระเงิน
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 p-5 text-white">
        <h1 className="text-xl font-bold">{shopName}</h1>
        <p className="mt-1 text-sm text-indigo-100">เลือกซื้อสินค้าและสั่งซื้อออนไลน์ได้ทันที</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาสินค้า..."
          className="min-w-[180px] flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">ทุกหมวดหมู่</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 pb-24 sm:grid-cols-3">
        {filteredProducts.map((p) => {
          const inCart = cart.find((c) => c.product_id === p.id);
          const outOfStock = Number(p.stock_qty) <= 0;
          return (
            <div key={p.id} className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex aspect-square items-center justify-center bg-gray-100">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl text-gray-300">📦</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-2.5">
                <p className="line-clamp-2 min-h-[2.4em] text-xs font-medium text-gray-800">{p.name}</p>
                <p className="mt-1 text-sm font-bold text-indigo-700">{money(p.sell_price)} บาท</p>
                <p className="text-[10px] text-gray-400">
                  {outOfStock ? "สินค้าหมด" : `คงเหลือ ${p.stock_qty} ${p.unit}`}
                </p>
                <button
                  onClick={() => addToCart(p)}
                  disabled={outOfStock || (inCart ? inCart.qty >= Number(p.stock_qty) : false)}
                  className="mt-2 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white disabled:bg-gray-300"
                >
                  {inCart ? `ในตะกร้า (${inCart.qty})` : "เพิ่มลงตะกร้า"}
                </button>
              </div>
            </div>
          );
        })}
        {filteredProducts.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-gray-400">ไม่พบสินค้า</p>
        )}
      </div>

      {cartCount > 0 && (
        <button
          onClick={() => setView("cart")}
          className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-lg"
        >
          🛒 ตะกร้า ({cartCount}) · {money(cartTotal)} บาท
        </button>
      )}
    </div>
  );
}
