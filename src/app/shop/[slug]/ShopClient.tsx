"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  ActivePromotion,
  StorefrontProduct,
  CartItem,
  OnlineOrderDeliveryMethod,
  OnlineOrderPaymentMethod,
} from "@/lib/types";
import { ONLINE_ORDER_PAYMENT_LABEL, ONLINE_ORDER_DELIVERY_LABEL, promotionBadgeText } from "@/lib/types";
import Link from "next/link";
import { getStorefrontTheme } from "@/lib/storefrontThemes";

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
  shopId,
  shopSlug,
  products,
  shopName,
  promotions = [],
  contactEmail = null,
  shopPhone = null,
  themeId = "modern",
  dealsCount = 0,
}: {
  shopId: string;
  shopSlug: string;
  products: StorefrontProduct[];
  shopName: string;
  promotions?: ActivePromotion[];
  contactEmail?: string | null;
  shopPhone?: string | null;
  themeId?: string;
  dealsCount?: number;
}) {
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  useEffect(() => { setPreviewThemeId(new URLSearchParams(window.location.search).get("theme")); }, []);
  const theme = getStorefrontTheme(previewThemeId ?? themeId);
  const L = theme.layout;
  const supabase = createClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [view, setView] = useState<View>("browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState<"recommended" | "price_asc" | "price_desc" | "name">("recommended");
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const PAGE = 40;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [search, category, sortMode, hideOutOfStock]);
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
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearch(q);
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

  // สินค้าที่มี variant_group เดียวกันจะรวมเป็นการ์ดเดียว กดแล้วเด้งป็อปอัพเลือกเบอร์/ตัวเลือก
  const [variantPopupGroup, setVariantPopupGroup] = useState<string | null>(null);

  const groupedProducts = useMemo(() => {
    type Item =
      | { type: "single"; product: StorefrontProduct }
      | { type: "group"; groupName: string; variants: StorefrontProduct[] };

    const groupMap = new Map<string, StorefrontProduct[]>();
    for (const p of filteredProducts) {
      const g = (p.variant_group ?? "").trim();
      if (!g) continue;
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(p);
    }
    for (const variants of groupMap.values()) {
      variants.sort((a, b) => (a.variant_label ?? "").localeCompare(b.variant_label ?? "", "th", { numeric: true }));
    }

    const items: Item[] = [];
    const seenGroups = new Set<string>();
    for (const p of filteredProducts) {
      const g = (p.variant_group ?? "").trim();
      if (g) {
        if (seenGroups.has(g)) continue;
        seenGroups.add(g);
        items.push({ type: "group", groupName: g, variants: groupMap.get(g)! });
      } else {
        items.push({ type: "single", product: p });
      }
    }
    return items;
  }, [filteredProducts]);

  const popupVariants = useMemo(() => {
    if (!variantPopupGroup) return [];
    return products
      .filter((p) => (p.variant_group ?? "").trim() === variantPopupGroup)
      .sort((a, b) => (a.variant_label ?? "").localeCompare(b.variant_label ?? "", "th", { numeric: true }));
  }, [products, variantPopupGroup]);

  const promoMap = useMemo(() => new Map(promotions.map((pr) => [pr.product_id, pr])), [promotions]);
  function promoDiscountFor(c: { product_id: string; sell_price: number; qty: number }) {
    const promo = promoMap.get(c.product_id);
    if (!promo) return 0;
    const cycle = promo.buy_qty + promo.get_qty;
    if (c.qty < cycle) return 0;
    const cycles = Math.floor(c.qty / cycle);
    return cycles * promo.get_qty * c.sell_price * (promo.get_discount_pct / 100);
  }

  // ราคาสมาชิก: ใช้เมื่อเบอร์โทรที่กรอกตรงกับลูกค้า/สมาชิกของร้าน (ระบบหลังบ้านตรวจซ้ำอีกครั้งตอนสั่งซื้อ)
  const [memberStatus, setMemberStatus] = useState<"unknown" | "checking" | "member" | "not_member">("unknown");
  const isMember = memberStatus === "member";
  const memberKey = `poskeng_member_phone_${shopId}`;
  async function checkMember(phone: string) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) { setMemberStatus("unknown"); return; }
    setMemberStatus("checking");
    const { data } = await supabase.rpc("check_storefront_member", { p_shop_id: shopId, p_phone: phone });
    const ok = data === true;
    setMemberStatus(ok ? "member" : "not_member");
    try { if (ok) window.localStorage.setItem(memberKey, phone); } catch { /* ignore */ }
  }
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(memberKey);
      if (saved) { setCustomerPhone((p) => p || saved); checkMember(saved); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey]);
  const pricedCart = cart.map((c) => (isMember && c.member_price != null ? { ...c, sell_price: Number(c.member_price) } : c));
  const memberSaving = cart.reduce((s, c) => s + (isMember && c.member_price != null ? (c.sell_price - Number(c.member_price)) * c.qty : 0), 0);

  const cartTotal = pricedCart.reduce((s, c) => s + c.sell_price * c.qty, 0);
  const promoDiscountTotal = pricedCart.reduce((s, c) => s + promoDiscountFor(c), 0);
  const netCartTotal = Math.max(cartTotal - promoDiscountTotal, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const discountCodeAmount = appliedDiscount?.amount ?? 0;
  const checkoutTotal = Math.max(netCartTotal - discountCodeAmount, 0);

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
        p_shop_id: shopId,
        p_code: discountCode.trim(),
        p_order_amount: netCartTotal,
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
    const maxQty = p.no_stock_tracking ? Infinity : Math.floor(Number(p.stock_qty));
    if (maxQty <= 0) return;
    if (existing) {
      if (existing.qty >= maxQty) return;
      updateCart(cart.map((c) => (c.product_id === p.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      updateCart([
        ...cart,
        {
          product_id: p.id, name: p.name, unit: p.unit, sell_price: Number(p.sell_price), stock_qty: maxQty, qty: 1,
          no_stock_tracking: p.no_stock_tracking, member_price: p.member_price ?? null,
        },
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
        p_shop_id: shopId,
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
        p_shop_id: shopId,
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
      <div className="mx-auto max-w-md rounded-2xl bg-sf-surface p-6 text-center shadow-sm">
        <div className="mb-2 text-4xl">✅</div>
        <h2 className="text-lg font-bold text-sf-ink">สั่งซื้อสำเร็จ!</h2>
        <p className="mt-1 text-sm text-sf-muted">เลขที่คำสั่งซื้อ</p>
        <p className="text-xl font-bold text-sf-primary">{placedOrder.order_no}</p>
        <p className="mt-2 text-sm text-sf-muted">ยอดรวม {money(placedOrder.total)} บาท</p>

        {paymentMethod === "bank_transfer" && !slipDone && (
          <div className="mt-5 rounded-xl border border-dashed border-sf-primary/40 bg-sf-soft p-4 text-left">
            <p className="mb-2 text-sm font-medium text-sf-ink">แนบสลิปการโอนเงิน</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
              className="mb-2 block w-full text-sm"
            />
            <button
              onClick={handleUploadSlip}
              disabled={!slipFile || slipUploading}
              className="w-full rounded-lg bg-sf-primary py-2 text-sm font-medium text-sf-on-primary disabled:opacity-50"
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
            href={`/shop/${shopSlug}/track?order_no=${encodeURIComponent(placedOrder.order_no)}&phone=${encodeURIComponent(customerPhone)}`}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-sf-ink hover:bg-sf-soft"
          >
            ติดตามคำสั่งซื้อ
          </a>
          <button
            onClick={() => {
              setPlacedOrder(null);
              setView("browse");
            }}
            className="flex-1 rounded-lg bg-sf-primary px-4 py-2 text-sm font-medium text-sf-on-primary"
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
        <button onClick={() => setView("cart")} className="mb-3 text-sm text-sf-muted">
          ← กลับไปที่ตะกร้า
        </button>
        <h2 className="mb-3 text-lg font-bold text-sf-ink">ข้อมูลการสั่งซื้อ</h2>
        <form onSubmit={handlePlaceOrder} className="space-y-3 rounded-2xl bg-sf-surface p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-sf-muted">ชื่อผู้สั่งซื้อ</label>
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="ชื่อ-นามสกุล"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-sf-muted">เบอร์โทรศัพท์</label>
            <input
              required
              value={customerPhone}
              onChange={(e) => { setCustomerPhone(e.target.value); if (memberStatus !== "unknown") setMemberStatus("unknown"); }}
              onBlur={(e) => checkMember(e.target.value)}
              inputMode="tel"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="08xxxxxxxx"
            />
            {memberStatus === "checking" && <p className="mt-1 text-xs text-sf-muted">กำลังตรวจสอบสมาชิก...</p>}
            {memberStatus === "member" && (
              <p className="mt-1 text-xs font-semibold text-emerald-600">
                ✓ คุณเป็นสมาชิกร้าน{memberSaving > 0 ? ` — ได้ราคาสมาชิก ประหยัด ${money(memberSaving)} บาท` : ""}
              </p>
            )}
            {memberStatus === "not_member" && <p className="mt-1 text-xs text-sf-muted">เบอร์นี้ยังไม่เป็นสมาชิก — ใช้ราคาปกติ</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-sf-muted">อีเมล (ไม่บังคับ)</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="example@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-sf-muted">วิธีรับสินค้า</label>
            <div className="flex gap-2">
              {(["delivery", "pickup"] as OnlineOrderDeliveryMethod[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setDeliveryMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    deliveryMethod === m ? "border-sf-primary bg-sf-soft text-sf-primary" : "text-sf-muted"
                  }`}
                >
                  {ONLINE_ORDER_DELIVERY_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          {deliveryMethod === "delivery" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-sf-muted">ที่อยู่จัดส่ง</label>
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
            <label className="mb-1 block text-xs font-medium text-sf-muted">วิธีชำระเงิน</label>
            <div className="space-y-1.5">
              {(["bank_transfer", "cod", "gateway"] as OnlineOrderPaymentMethod[]).map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    paymentMethod === m ? "border-sf-primary bg-sf-soft" : ""
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
            <label className="mb-1 block text-xs font-medium text-sf-muted">หมายเหตุ (ถ้ามี)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-sf-muted">โค้ดส่วนลด (ถ้ามี)</label>
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
                  className="rounded-lg border border-sf-primary px-3 py-2 text-xs font-medium text-sf-primary disabled:opacity-50"
                >
                  {discountCodeChecking ? "กำลังตรวจสอบ..." : "ใช้โค้ด"}
                </button>
              </div>
            )}
            {discountCodeMsg && <p className="mt-1 text-xs text-red-600">{discountCodeMsg}</p>}
          </div>

          <div className="border-t pt-3 text-sm">
            <div className="flex items-center justify-between text-sf-muted">
              <span>ยอดสินค้า</span>
              <span>{money(cartTotal)} บาท</span>
            </div>
            {promoDiscountTotal > 0 && (
              <div className="flex items-center justify-between text-pink-600">
                <span>🎁 ส่วนลดโปรโมชั่น</span>
                <span>-{money(promoDiscountTotal)} บาท</span>
              </div>
            )}
            {discountCodeAmount > 0 && (
              <div className="flex items-center justify-between text-green-600">
                <span>ส่วนลด</span>
                <span>-{money(discountCodeAmount)} บาท</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between text-base font-bold text-sf-ink">
              <span>ยอดรวม</span>
              <span>{money(checkoutTotal)} บาท</span>
            </div>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-sf-primary py-2.5 text-sm font-medium text-sf-on-primary disabled:opacity-50"
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
        <button onClick={() => setView("browse")} className="mb-3 text-sm text-sf-muted">
          ← เลือกซื้อสินค้าต่อ
        </button>
        <h2 className="mb-3 text-lg font-bold text-sf-ink">ตะกร้าสินค้า</h2>
        {cart.length === 0 ? (
          <p className="rounded-2xl bg-sf-surface p-6 text-center text-sm text-sf-muted shadow-sm">ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <div className="space-y-2">
            {pricedCart.map((c) => {
              const promoDiscount = promoDiscountFor(c);
              return (
              <div key={c.product_id} className="flex items-center gap-3 rounded-xl bg-sf-surface p-3 shadow-sm">
                <div className="flex-1">
                  <p className="text-sm font-medium text-sf-ink">
                    {c.name}
                    {promoDiscount > 0 && (
                      <span className="ml-1.5 rounded-full bg-pink-50 px-1.5 py-0.5 text-[10px] font-normal text-pink-600">
                        🎁 -{money(promoDiscount)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-sf-muted">
                    {money(c.sell_price)} บาท / {c.unit}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setQty(c.product_id, c.qty - 1)}
                    className="h-7 w-7 rounded-full border text-sf-muted"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">{c.qty}</span>
                  <button
                    onClick={() => setQty(c.product_id, c.qty + 1)}
                    disabled={!c.no_stock_tracking && c.qty >= c.stock_qty}
                    className="h-7 w-7 rounded-full border text-sf-muted disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <button onClick={() => removeFromCart(c.product_id)} className="text-xs text-red-500">
                  ลบ
                </button>
              </div>
              );
            })}
            <div className="mt-3 rounded-xl bg-sf-surface p-4 shadow-sm">
              {promoDiscountTotal > 0 && (
                <div className="mb-1 flex items-center justify-between text-sm text-pink-600">
                  <span>🎁 ส่วนลดโปรโมชั่น</span>
                  <span>-{money(promoDiscountTotal)} บาท</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-sf-muted">ยอดรวม</span>
                <span className="text-lg font-bold text-sf-ink">{money(netCartTotal)} บาท</span>
              </div>
            </div>
            <button
              onClick={() => setView("checkout")}
              className="w-full rounded-lg bg-sf-primary py-2.5 text-sm font-medium text-sf-on-primary"
            >
              ไปที่หน้าชำระเงิน
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- หน้ารวมสินค้า ----------
  type DisplayItem = {
    key: string;
    kind: "single" | "group";
    name: string;
    image: string | null;
    color: string | null;
    minPrice: number;
    maxPrice: number;
    available: boolean;
    stockText: string;
    promoText: string | null;
    memberPrice: number | null;
    product?: StorefrontProduct;
    groupName?: string;
  };
  const displayItems: DisplayItem[] = groupedProducts.map((item) => {
    if (item.type === "single") {
      const p = item.product;
      const out = !p.no_stock_tracking && Number(p.stock_qty) <= 0;
      const promo = promoMap.get(p.id);
      return {
        key: p.id, kind: "single", name: p.name, image: p.image_url, color: p.card_color,
        minPrice: Number(p.sell_price), maxPrice: Number(p.sell_price), available: !out,
        stockText: p.no_stock_tracking ? "พร้อมส่ง" : out ? "สินค้าหมด" : `เหลือ ${p.stock_qty} ${p.unit}`,
        promoText: promo ? promotionBadgeText(promo) : null, product: p,
        memberPrice: p.member_price != null ? Number(p.member_price) : null,
      };
    }
    const vs = item.variants;
    const prices = vs.map((v) => Number(v.sell_price));
    const totalStock = vs.reduce((t, v) => t + Math.max(0, Number(v.stock_qty)), 0);
    const always = vs.some((v) => v.no_stock_tracking);
    const promoV = vs.map((v) => promoMap.get(v.id)).find(Boolean);
    return {
      key: `group-${item.groupName}`, kind: "group", name: item.groupName, image: vs[0].image_url, color: vs[0].card_color,
      minPrice: Math.min(...prices), maxPrice: Math.max(...prices), available: always || totalStock > 0,
      stockText: !always && totalStock <= 0 ? "สินค้าหมด" : `${vs.length} ตัวเลือก`,
      promoText: promoV ? promotionBadgeText(promoV) : null, groupName: item.groupName,
      memberPrice: (() => { const m = vs.map((v) => v.member_price).filter((x): x is number => x != null).map(Number); return m.length ? Math.min(...m) : null; })(),
    };
  });
  const shownItems = displayItems
    .filter((it) => !hideOutOfStock || it.available)
    .sort((a, b) => {
      if (sortMode === "price_asc") return a.minPrice - b.minPrice;
      if (sortMode === "price_desc") return b.maxPrice - a.maxPrice;
      if (sortMode === "name") return a.name.localeCompare(b.name, "th");
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (!!a.promoText !== !!b.promoText) return a.promoText ? -1 : 1;
      if (!!a.image !== !!b.image) return a.image ? -1 : 1;
      return 0;
    });
  const availableCount = displayItems.filter((it) => it.available).length;
  const hiddenCount = displayItems.length - displayItems.filter((it) => it.available).length;
  const initial = shopName.trim().charAt(0) || "ร";

  return (
    <div>
      {/* แบนเนอร์ร้าน (หน้าตาเปลี่ยนตามธีม) */}
      <section className={`relative mb-5 overflow-hidden rounded-sf bg-sf-hero p-6 text-sf-hero-ink shadow-lg shadow-sf-primary/10 sm:p-10 ${L.heroAlign === "center" ? "text-center" : ""}`}>
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sf-hero-ink/10" />
        <div className="pointer-events-none absolute -bottom-24 right-32 h-48 w-48 rounded-full bg-sf-hero-ink/5" />
        <div className={`relative flex flex-wrap items-center gap-4 sm:gap-5 ${L.heroAlign === "center" ? "flex-col justify-center" : ""}`}>
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-sf bg-sf-surface text-3xl font-extrabold text-sf-primary shadow-md sm:h-20 sm:w-20 sm:text-4xl">{initial}</div>
          <div className="min-w-0 flex-1">
            <h1 className={`text-2xl font-extrabold leading-tight sm:text-4xl ${L.upperTitle ? "uppercase tracking-[0.15em]" : ""}`}>{shopName}</h1>
            <p className="mt-1.5 text-sm text-sf-hero-ink/80 sm:text-base">เลือกซื้อสินค้าออนไลน์ สั่งง่าย จ่ายสะดวก ติดตามสถานะได้ตลอด</p>
            <div className={`mt-4 flex flex-wrap gap-2 text-xs font-medium ${L.heroAlign === "center" ? "justify-center" : ""}`}>
              <span className="rounded-sf-btn bg-sf-hero-ink/15 px-3 py-1">🛍️ พร้อมขาย {availableCount.toLocaleString("th-TH")} รายการ</span>
              {dealsCount > 0 && (
                <Link href={`/shop/${shopSlug}/deals`} className="rounded-sf-btn bg-sf-accent px-3 py-1 text-white hover:opacity-90">🎁 โปรโมชั่น & โค้ดส่วนลด {dealsCount} รายการ ›</Link>
              )}
              <Link href={`/shop/${shopSlug}/bills`} className="rounded-sf-btn bg-sf-hero-ink/15 px-3 py-1 hover:bg-sf-hero-ink/25">🧾 ค้นหาบิลของฉัน</Link>
              {shopPhone && <a href={`tel:${shopPhone}`} className="rounded-sf-btn bg-sf-hero-ink/15 px-3 py-1 hover:bg-sf-hero-ink/25">📞 {shopPhone}</a>}
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}?subject=${encodeURIComponent(`สอบถามสินค้า - ${shopName}`)}`}
                  className="rounded-sf-btn bg-sf-hero-ink/15 px-3 py-1 hover:bg-sf-hero-ink/25"
                >
                  ✉️ อีเมลร้าน
                </a>
              )}
            </div>
            <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${L.heroAlign === "center" ? "justify-center" : ""}`}>
              {isMember ? (
                <span className="rounded-sf-btn bg-emerald-500 px-3 py-1.5 font-semibold text-white">✓ คุณเป็นสมาชิกร้าน — เห็นราคาสมาชิกแล้ว</span>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); checkMember(customerPhone); }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(e.target.value); if (memberStatus !== "unknown") setMemberStatus("unknown"); }}
                    inputMode="tel"
                    placeholder="เบอร์โทรสมาชิก"
                    className="w-32 rounded-full border border-sf-line bg-sf-surface px-3 py-1.5 text-xs text-sf-ink focus:border-sf-primary focus:outline-none sm:w-40"
                  />
                  <button
                    type="submit"
                    disabled={memberStatus === "checking" || !customerPhone.trim()}
                    className="rounded-full bg-sf-hero-ink/15 px-3 py-1.5 font-semibold hover:bg-sf-hero-ink/25 disabled:opacity-50"
                  >
                    {memberStatus === "checking" ? "กำลังตรวจสอบ..." : "ดูราคาสมาชิก"}
                  </button>
                </form>
              )}
              {memberStatus === "not_member" && <span className="text-sf-hero-ink/70">เบอร์นี้ยังไม่เป็นสมาชิก — ใช้ราคาปกติ</span>}
            </div>
          </div>
        </div>
      </section>

      {/* ค้นหา / เรียง / หมวดหมู่ */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-sf-line bg-sf-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sf-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="w-full rounded-full border border-sf-line bg-sf-surface py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-sf-primary focus:outline-none"
            />
          </div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
            className="rounded-full border border-sf-line bg-sf-surface px-3 py-2.5 text-sm shadow-sm"
          >
            <option value="recommended">แนะนำ</option>
            <option value="price_asc">ราคา ต่ำ → สูง</option>
            <option value="price_desc">ราคา สูง → ต่ำ</option>
            <option value="name">ชื่อ ก-ฮ</option>
          </select>
        </div>
        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["all", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                category === c ? "bg-sf-primary text-sf-on-primary shadow-sm" : "border border-sf-line bg-sf-surface text-sf-muted hover:border-sf-primary/50"
              }`}
            >
              {c === "all" ? "ทั้งหมด" : c}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-sf-muted">
        <span>พบ {shownItems.length.toLocaleString("th-TH")} รายการ</span>
        {hiddenCount > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={!hideOutOfStock} onChange={(e) => setHideOutOfStock(!e.target.checked)} className="h-3.5 w-3.5" />
            แสดงสินค้าที่หมดด้วย ({hiddenCount})
          </label>
        )}
      </div>

      <div className={`grid gap-3 sm:gap-4 ${L.grid}`}>
        {shownItems.slice(0, visibleCount).map((it) => {
          const inCart = it.product ? cart.find((c) => c.product_id === it.product!.id) : undefined;
          const atMax = !!(it.product && inCart && !it.product.no_stock_tracking && inCart.qty >= Number(it.product.stock_qty));
          const onAdd = () => (it.kind === "single" && it.product ? addToCart(it.product) : setVariantPopupGroup(it.groupName!));
          return (
            <div
              key={it.key}
              className={`group flex flex-col overflow-hidden rounded-sf bg-sf-surface transition duration-200 ${
                L.cardStyle === "shadow" ? "shadow-sm ring-1 ring-sf-line hover:-translate-y-0.5 hover:shadow-lg" : L.cardStyle === "border" ? "border hover:border-sf-primary/60" : ""
              }`}
            >
              <button
                type="button"
                onClick={onAdd}
                disabled={!it.available}
                className={`relative block w-full overflow-hidden bg-sf-soft ${L.imageAspect === "portrait" ? "aspect-[3/4]" : "aspect-square"} ${L.cardStyle === "flat" ? "rounded-sf" : ""}`}
                style={!it.image && it.color ? { background: it.color } : undefined}
              >
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt={it.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-5xl font-extrabold text-sf-primary/30">{it.name.trim().charAt(0)}</span>
                )}
                {it.promoText && (
                  <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">🎁 โปร</span>
                )}
                {it.kind === "group" && it.available && (
                  <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-sf-primary shadow">{it.stockText}</span>
                )}
                {!it.available && (
                  <span className="absolute inset-0 grid place-items-center bg-white/60">
                    <span className="rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white">สินค้าหมด</span>
                  </span>
                )}
              </button>
              <div className="flex flex-1 flex-col p-3">
                <p className={`line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-sf-ink ${L.cardStyle === "flat" ? "px-0" : ""}`}>{it.name}</p>
                {it.promoText && <p className="mt-1 truncate text-[11px] font-semibold text-rose-600">{it.promoText}</p>}
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold text-sf-price">
                      ฿{money(it.minPrice)}{it.maxPrice !== it.minPrice && <span className="text-sm font-semibold"> - {money(it.maxPrice)}</span>}
                    </p>
                    {isMember && it.memberPrice != null && it.memberPrice < it.minPrice && (
                      <p className="truncate text-[11px] font-semibold text-emerald-600">สมาชิก ฿{money(it.memberPrice)}</p>
                    )}
                    {it.kind === "single" && <p className="text-[11px] text-sf-muted">{it.stockText}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={onAdd}
                    disabled={!it.available || atMax}
                    aria-label="หยิบใส่ตะกร้า"
                    className={`grid h-10 min-w-10 shrink-0 place-items-center rounded-sf-btn px-2 text-sm font-bold shadow-md transition disabled:bg-sf-line disabled:text-sf-muted disabled:shadow-none ${
                      inCart ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-sf-primary text-sf-on-primary hover:bg-sf-primary-dark"
                    }`}
                  >
                    {inCart ? `✓ ${inCart.qty}` : <span className="text-xl leading-none">+</span>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {shownItems.length === 0 && (
          <div className="col-span-full rounded-2xl bg-sf-surface py-14 text-center text-sm text-sf-muted shadow-sm">ไม่พบสินค้าที่ค้นหา</div>
        )}
      </div>
      {shownItems.length > visibleCount && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE)}
            className="rounded-full border border-sf-primary/30 bg-sf-surface px-6 py-2.5 text-sm font-semibold text-sf-primary shadow-sm hover:bg-sf-soft"
          >
            ดูสินค้าเพิ่มเติม ({(shownItems.length - visibleCount).toLocaleString("th-TH")})
          </button>
        </div>
      )}
      <div className="h-24" />

      {variantPopupGroup && (
        <div
          onClick={() => setVariantPopupGroup(null)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-sf-surface p-4 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-bold text-sf-ink">{variantPopupGroup}</h3>
              <button onClick={() => setVariantPopupGroup(null)} className="text-sf-muted hover:text-sf-ink">✕</button>
            </div>
            <p className="mb-3 text-xs text-sf-muted">เลือกเบอร์/ตัวเลือกที่ต้องการเพิ่มลงตะกร้า</p>
            <div className="grid grid-cols-2 gap-3">
              {popupVariants.map((v) => {
                const inCart = cart.find((c) => c.product_id === v.id);
                const outOfStock = !v.no_stock_tracking && Number(v.stock_qty) <= 0;
                return (
                  <div key={v.id} className="flex flex-col overflow-hidden rounded-md border border-sf-line">
                    <div
                      className="relative flex aspect-square items-center justify-center overflow-hidden bg-sf-soft"
                      style={!v.image_url && v.card_color ? { backgroundColor: v.card_color } : undefined}
                    >
                      {v.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.image_url} alt={v.name} className="h-full w-full object-cover" />
                      ) : v.card_color ? null : (
                        <span className="text-2xl text-sf-muted">📦</span>
                      )}
                      {outOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">สินค้าหมด</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-2">
                      <p className="text-xs text-sf-ink">{v.variant_label || v.name}</p>
                      <p className="mt-1 text-base font-medium text-sf-primary">฿{money(v.sell_price)}</p>
                      <p className="text-[11px] text-sf-muted">
                        {v.no_stock_tracking ? "พร้อมขายเสมอ" : outOfStock ? "สินค้าหมด" : `เหลือ ${v.stock_qty} ${v.unit}`}
                      </p>
                      <button
                        onClick={() => addToCart(v)}
                        disabled={outOfStock || (inCart && !v.no_stock_tracking ? inCart.qty >= Number(v.stock_qty) : false)}
                        className="mt-2 w-full rounded-sm bg-sf-primary py-1.5 text-xs font-medium text-sf-on-primary transition-colors hover:bg-sf-primary-dark disabled:bg-sf-line disabled:text-sf-muted"
                      >
                        {inCart ? `ในตะกร้า (${inCart.qty})` : "หยิบใส่ตะกร้า"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {popupVariants.length === 0 && (
                <p className="col-span-full text-sm text-sf-muted">ไม่พบตัวเลือกในกลุ่มนี้</p>
              )}
            </div>
          </div>
        </div>
      )}

      {cartCount > 0 && (
        <button
          onClick={() => setView("cart")}
          className="fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-sf-btn bg-sf-ink py-3 pl-4 pr-5 text-sm font-semibold text-sf-bg shadow-xl sm:left-1/2 sm:-translate-x-1/2"
        >
          <span className="grid h-7 min-w-7 place-items-center rounded-full bg-sf-surface px-1.5 text-xs font-bold text-sf-ink">{cartCount}</span>
          ดูตะกร้า · ฿{money(netCartTotal)}
        </button>
      )}
    </div>
  );
}
