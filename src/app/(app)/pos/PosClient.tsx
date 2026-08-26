"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CartLine, Customer, PaymentMethod, Product, SaleChannel } from "@/lib/types";
import { splitVat, SALE_CHANNEL_LABEL, MANUAL_SALE_CHANNELS } from "@/lib/types";

interface PaymentRow {
  method: PaymentMethod;
  amount: string;
  received?: string;
}

export default function PosClient({ products, showVatOnReceipt = true }: { products: Product[]; showVatOnReceipt?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billDiscount, setBillDiscount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  // customer / tax invoice
  const [customerName, setCustomerName] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showTaxFields, setShowTaxFields] = useState(false);
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // payments
  const [splitMode, setSplitMode] = useState(false);
  const [singleMethod, setSingleMethod] = useState<PaymentMethod>("cash");
  const [payRows, setPayRows] = useState<PaymentRow[]>([{ method: "cash", amount: "" }]);
  const [cashReceived, setCashReceived] = useState("");

  // ช่องทางการขาย (หน้าร้าน / แพลตฟอร์มออนไลน์)
  const [channel, setChannel] = useState<SaleChannel>("store");
  const [platformNameOther, setPlatformNameOther] = useState("");
  const [platformFeePct, setPlatformFeePct] = useState("");
  const [note, setNote] = useState("");

  // โค้ดส่วนลด
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [discountCodeMsg, setDiscountCodeMsg] = useState<string | null>(null);
  const [discountCodeChecking, setDiscountCodeChecking] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)).slice(0, 30);
  }, [products, search]);

  const subtotal = cart.reduce((s, l) => s + l.product.sell_price * l.qty, 0);
  const lineDiscountsTotal = cart.reduce((s, l) => s + (Number(l.discount) || 0), 0);
  const preCodeTotal = Math.max(subtotal - lineDiscountsTotal - (Number(billDiscount) || 0), 0);
  const discountCodeAmount = appliedDiscount?.amount ?? 0;
  const total = Math.max(preCodeTotal - discountCodeAmount, 0);
  const { base: vatBase, vat } = splitVat(total);

  // ถ้าตะกร้าหรือส่วนลดท้ายบิลเปลี่ยนหลังจากใช้โค้ดไปแล้ว ให้ยกเลิกโค้ดเดิม บังคับให้ตรวจสอบใหม่
  useEffect(() => {
    if (appliedDiscount) {
      setAppliedDiscount(null);
      setDiscountCodeMsg("ตะกร้าเปลี่ยนแปลง กรุณากดตรวจสอบโค้ดอีกครั้ง");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, lineDiscountsTotal, billDiscount]);

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
        p_order_amount: preCodeTotal,
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

  const payRowsSum = payRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const remaining = Math.round((total - payRowsSum) * 100) / 100;

  const cashChange =
    !splitMode && singleMethod === "cash" && cashReceived !== ""
      ? Math.round((Number(cashReceived) - total) * 100) / 100
      : null;

  const estimatedPlatformFee =
    channel !== "store" && Number(platformFeePct) > 0
      ? Math.round(total * (Number(platformFeePct) / 100) * 100) / 100
      : 0;

  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
      setCustomerResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery, supabase]);

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { product: p, qty: 1, discount: 0 }];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, qty } : l)));
  }

  function updateLineDiscount(productId: string, discount: number) {
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, discount: Math.max(discount, 0) } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c);
    setCustomerName(c.name);
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCustomerName("");
  }

  function addPayRow() {
    setPayRows((prev) => [...prev, { method: "cash", amount: remaining > 0 ? String(remaining) : "" }]);
  }

  function removePayRow(idx: number) {
    setPayRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updatePayRow(idx: number, patch: Partial<PaymentRow>) {
    setPayRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  // barcode scanners act as a keyboard: they type the code fast and end with Enter.
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
      const items = cart.map((l) => ({ product_id: l.product.id, qty: l.qty, discount: Number(l.discount) || 0 }));

      let payments: { method: PaymentMethod; amount: number }[];
      if (splitMode) {
        payments = payRows
          .filter((r) => (Number(r.amount) || 0) > 0)
          .map((r) => ({ method: r.method, amount: Number(r.amount) }));
        if (payments.length === 0) throw new Error("กรุณาระบุยอดชำระอย่างน้อย 1 ช่องทาง");
        if (Math.abs(payRowsSum - total) > 0.01) throw new Error(`ยอดชำระรวม (฿${payRowsSum.toFixed(2)}) ต้องเท่ากับยอดสุทธิ (฿${total.toFixed(2)})`);
      } else {
        payments = [{ method: singleMethod, amount: total }];
      }

      const hasCredit = payments.some((p) => p.method === "credit");
      if (hasCredit && !selectedCustomer) {
        throw new Error("การขายเชื่อต้องเลือกลูกค้าก่อน");
      }

      if (channel === "other" && !platformNameOther.trim()) {
        throw new Error("กรุณาระบุชื่อแพลตฟอร์ม");
      }

      const { data, error } = await supabase.rpc("create_sale", {
        p_items: items,
        p_payments: payments,
        p_bill_discount: Number(billDiscount) || 0,
        p_customer_id: selectedCustomer?.id ?? null,
        p_customer_name: customerName || null,
        p_customer_tax_id: showTaxFields ? customerTaxId || null : null,
        p_customer_address: showTaxFields ? customerAddress || null : null,
        p_channel: channel,
        p_platform_name: channel === "other" ? platformNameOther.trim() || null : null,
        p_platform_fee_pct: channel !== "store" && Number(platformFeePct) > 0 ? Number(platformFeePct) : null,
        p_note: note.trim() || null,
        p_discount_code: appliedDiscount?.code ?? null,
      });
      if (error) throw error;
      const saleId = data?.[0]?.sale_id;
      setCart([]);
      setBillDiscount("0");
      setCustomerName("");
      setSelectedCustomer(null);
      setCustomerTaxId("");
      setCustomerAddress("");
      setShowTaxFields(false);
      setSplitMode(false);
      setPayRows([{ method: "cash", amount: "" }]);
      setCashReceived("");
      setChannel("store");
      setPlatformNameOther("");
      setPlatformFeePct("");
      setNote("");
      setDiscountCode("");
      setAppliedDiscount(null);
      setDiscountCodeMsg(null);
      if (saleId) router.push(`/receipt/${saleId}`);
    } catch (err: any) {
      setError(err.message ?? "บันทึกการขายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const canCheckout = cart.length > 0 && (!splitMode || Math.abs(remaining) < 0.01);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-1">
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
        <div className="grid grid-cols-2 gap-3">
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

      <div className="rounded-2xl bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:col-span-4 lg:self-start">
        <h2 className="mb-3 text-lg font-bold text-gray-800">🧾 ตะกร้าสินค้า</h2>
        {cart.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <div className="max-h-[28rem] space-y-3 overflow-y-auto lg:grid lg:max-h-[36rem] lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {cart.map((l) => (
              <div key={l.product.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-base font-semibold text-gray-800">{l.product.name}</p>
                    <p className="text-sm text-gray-500">฿{l.product.sell_price} x {l.qty}</p>
                  </div>
                  <button
                    onClick={() => removeLine(l.product.id)}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-lg text-red-500 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, l.qty - 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-xl font-bold text-gray-600 hover:bg-gray-100"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={l.product.stock_qty}
                      value={l.qty}
                      onChange={(e) => updateQty(l.product.id, Number(e.target.value))}
                      className="w-16 rounded-lg border px-2 py-2 text-center text-base font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, l.qty + 1)}
                      disabled={l.qty >= l.product.stock_qty}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-xl font-bold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-1 items-center gap-1.5">
                    <span className="text-xs text-gray-400">ส่วนลด</span>
                    <input
                      type="number"
                      min={0}
                      value={l.discount || ""}
                      placeholder="0"
                      onChange={(e) => updateLineDiscount(l.product.id, Number(e.target.value))}
                      className="w-20 rounded-lg border px-2 py-1.5 text-sm"
                    />
                    <span className="text-xs text-gray-400">บาท</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2 border-t pt-4 text-sm">
          {/* customer */}
          {!selectedCustomer ? (
            <div className="relative">
              <label className="mb-1 block text-xs text-gray-600">ลูกค้า (ค้นหาสมาชิก หรือพิมพ์ชื่อทั่วไป)</label>
              <input
                value={customerQuery || customerName}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setCustomerName(e.target.value);
                }}
                placeholder="ชื่อหรือเบอร์โทรลูกค้า"
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              />
              {customerResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                    >
                      {c.name} {c.phone ? `(${c.phone})` : ""} · แต้ม {c.points}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-brand/5 px-3 py-2 text-xs">
              <div>
                <p className="font-semibold text-gray-800">{selectedCustomer.name}</p>
                <p className="text-gray-500">แต้มสะสม {selectedCustomer.points} · เครดิตค้าง ฿{Number(selectedCustomer.credit_balance).toLocaleString("th-TH")}</p>
              </div>
              <button onClick={clearCustomer} className="text-red-500">ยกเลิก</button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowTaxFields((v) => !v)}
            className="text-xs text-brand hover:underline"
          >
            {showTaxFields ? "− ซ่อนข้อมูลใบกำกับภาษี" : "+ ออกใบกำกับภาษีเต็มรูป"}
          </button>
          {showTaxFields && (
            <div className="space-y-2 rounded-lg border border-dashed p-2">
              <input
                value={customerTaxId}
                onChange={(e) => setCustomerTaxId(e.target.value)}
                placeholder="เลขผู้เสียภาษี 13 หลัก"
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              />
              <textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="ที่อยู่ลูกค้า (สำหรับออกใบกำกับภาษี)"
                rows={2}
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-gray-600">ช่องทางการขาย</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as SaleChannel)}
              className="w-full rounded-lg border px-3 py-1.5 text-sm"
            >
              {MANUAL_SALE_CHANNELS.map((c) => (
                <option key={c} value={c}>{SALE_CHANNEL_LABEL[c]}</option>
              ))}
            </select>
          </div>

          {channel !== "store" && (
            <div className="space-y-2 rounded-lg border border-dashed p-2">
              <p className="text-xs text-amber-600">
                บิลนี้จะถูกบันทึกเป็นสถานะ "รอรับเงิน" อัตโนมัติ จนกว่าจะกดยืนยันว่าได้รับเงินแล้วในหน้าประวัติการขาย
              </p>
              {channel === "other" && (
                <input
                  value={platformNameOther}
                  onChange={(e) => setPlatformNameOther(e.target.value)}
                  placeholder="ชื่อแพลตฟอร์ม (ระบุเอง)"
                  className="w-full rounded-lg border px-3 py-1.5 text-sm"
                />
              )}
              <div>
                <label className="mb-1 block text-xs text-gray-600">ค่าธรรมเนียมแพลตฟอร์ม (% ถ้ามี)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={platformFeePct}
                  onChange={(e) => setPlatformFeePct(e.target.value)}
                  placeholder="เช่น 5"
                  className="w-full rounded-lg border px-3 py-1.5 text-sm"
                />
              </div>
              {estimatedPlatformFee > 0 && (
                <p className="text-xs text-gray-500">
                  ค่าธรรมเนียมโดยประมาณ ฿{estimatedPlatformFee.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  — ระบบจะบันทึกเป็นรายจ่ายให้อัตโนมัติเมื่อยืนยันการขาย
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-gray-600">ส่วนลดท้ายบิล (บาท)</label>
            <input type="number" min={0} value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">โค้ดส่วนลด (ถ้ามี)</label>
            {appliedDiscount ? (
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                <span>
                  ใช้โค้ด <span className="font-mono font-semibold">{appliedDiscount.code}</span> — ลด ฿
                  {appliedDiscount.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
                <button type="button" onClick={removeDiscountCode} className="font-medium text-red-500">ยกเลิก</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  placeholder="กรอกโค้ดส่วนลด"
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={handleApplyDiscountCode}
                  disabled={discountCodeChecking}
                  className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/5 disabled:opacity-50"
                >
                  {discountCodeChecking ? "กำลังตรวจสอบ..." : "ใช้โค้ด"}
                </button>
              </div>
            )}
            {discountCodeMsg && <p className="mt-1 text-xs text-red-600">{discountCodeMsg}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">หมายเหตุ (เก็บภายในเท่านั้น ไม่แสดงบนใบเสร็จ)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ลูกค้าขอเปลี่ยนสี, นัดมารับของพรุ่งนี้..."
              rows={2}
              className="w-full rounded-lg border px-3 py-1.5 text-sm"
            />
          </div>

          {/* payment */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-600">วิธีชำระเงิน</label>
            <button
              type="button"
              onClick={() => {
                setSplitMode((v) => !v);
                setPayRows([{ method: "cash", amount: total ? String(total) : "" }]);
              }}
              className="text-xs text-brand hover:underline"
            >
              {splitMode ? "ชำระวิธีเดียว" : "แบ่งชำระหลายช่องทาง"}
            </button>
          </div>

          {!splitMode ? (
            <>
              <select
                value={singleMethod}
                onChange={(e) => {
                  setSingleMethod(e.target.value as PaymentMethod);
                  setCashReceived("");
                }}
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              >
                <option value="cash">เงินสด</option>
                <option value="transfer">โอนเงิน</option>
                <option value="card">บัตร</option>
                <option value="credit" disabled={!selectedCustomer}>ขายเชื่อ {!selectedCustomer ? "(ต้องเลือกลูกค้าก่อน)" : ""}</option>
              </select>

              {singleMethod === "cash" && (
                <div className="space-y-1 rounded-lg border border-dashed p-2">
                  <label className="mb-1 block text-xs text-gray-600">รับเงินมา (บาท)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={total ? total.toFixed(2) : "0.00"}
                    className="w-full rounded-lg border px-3 py-1.5 text-sm"
                  />
                  {cashReceived !== "" && cashChange !== null && (
                    <p className={`text-sm font-semibold ${cashChange < 0 ? "text-red-600" : "text-green-700"}`}>
                      {cashChange >= 0
                        ? `เงินทอน ฿${cashChange.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                        : `รับเงินไม่พอ ขาดอีก ฿${Math.abs(cashChange).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {payRows.map((row, idx) => {
                const rowChange =
                  row.method === "cash" && row.received && Number(row.amount) > 0
                    ? Math.round((Number(row.received) - Number(row.amount)) * 100) / 100
                    : null;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={row.method}
                        onChange={(e) => updatePayRow(idx, { method: e.target.value as PaymentMethod, received: "" })}
                        className="rounded-lg border px-2 py-1.5 text-xs"
                      >
                        <option value="cash">เงินสด</option>
                        <option value="transfer">โอนเงิน</option>
                        <option value="card">บัตร</option>
                        <option value="credit" disabled={!selectedCustomer}>เชื่อ</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={row.amount}
                        onChange={(e) => updatePayRow(idx, { amount: e.target.value })}
                        placeholder="0.00"
                        className="w-20 flex-1 rounded-lg border px-2 py-1.5 text-xs"
                      />
                      {payRows.length > 1 && (
                        <button onClick={() => removePayRow(idx)} className="text-red-500">✕</button>
                      )}
                    </div>
                    {row.method === "cash" && (
                      <div className="flex items-center gap-1.5 pl-0.5">
                        <span className="text-[11px] text-gray-400">รับเงินมา</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.received ?? ""}
                          onChange={(e) => updatePayRow(idx, { received: e.target.value })}
                          placeholder="0.00"
                          className="w-20 rounded border px-1.5 py-0.5 text-xs"
                        />
                        {rowChange !== null && (
                          <span className={`text-[11px] font-medium ${rowChange < 0 ? "text-red-600" : "text-green-700"}`}>
                            {rowChange >= 0 ? `ทอน ฿${rowChange.toFixed(2)}` : `ขาด ฿${Math.abs(rowChange).toFixed(2)}`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={addPayRow} className="text-xs text-brand hover:underline">+ เพิ่มช่องทางชำระ</button>
              <p className={`text-xs ${Math.abs(remaining) < 0.01 ? "text-green-600" : "text-red-600"}`}>
                {Math.abs(remaining) < 0.01 ? "ยอดชำระครบแล้ว" : remaining > 0 ? `ขาดอีก ฿${remaining.toFixed(2)}` : `เกิน ฿${Math.abs(remaining).toFixed(2)}`}
              </p>
            </div>
          )}

          <div className="flex justify-between pt-2 text-gray-600">
            <span>ยอดรวม</span>
            <span>฿{subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          {(lineDiscountsTotal > 0 || Number(billDiscount) > 0) && (
            <div className="flex justify-between text-gray-600">
              <span>ส่วนลดรวม</span>
              <span>-฿{(lineDiscountsTotal + (Number(billDiscount) || 0)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {discountCodeAmount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>โค้ดส่วนลด ({appliedDiscount?.code})</span>
              <span>-฿{discountCodeAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900">
            <span>สุทธิ</span>
            <span>฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          {showVatOnReceipt && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>ในนี้เป็น VAT 7% (รวมในราคาแล้ว)</span>
              <span>฿{vat.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (ก่อน VAT ฿{vatBase.toLocaleString("th-TH", { minimumFractionDigits: 2 })})</span>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleCheckout}
            disabled={busy || !canCheckout}
            className="mt-2 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก..." : "✅ ยืนยันการขาย"}
          </button>
        </div>
      </div>
    </div>
  );
}
