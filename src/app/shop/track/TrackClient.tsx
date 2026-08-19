"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OnlineOrderStatus, OnlineOrderDeliveryMethod, OnlineOrderPaymentMethod } from "@/lib/types";
import { ONLINE_ORDER_STATUS_LABEL, ONLINE_ORDER_DELIVERY_LABEL, ONLINE_ORDER_PAYMENT_LABEL } from "@/lib/types";

function money(n: number) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface LookupResult {
  order_no: string;
  status: OnlineOrderStatus;
  total: number;
  delivery_method: OnlineOrderDeliveryMethod;
  payment_method: OnlineOrderPaymentMethod;
  created_at: string;
  items: { product_name: string; qty: number; unit_price: number; line_total: number }[] | null;
}

const STATUS_STEPS: OnlineOrderStatus[] = ["pending_payment", "pending_confirmation", "confirmed", "packed", "shipped", "completed"];

function OrderCard({ result, defaultOpen }: { result: LookupResult; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const stepIndex = STATUS_STEPS.indexOf(result.status);
  const isCancelled = result.status === "cancelled";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <span className="font-bold text-gray-800">{result.order_no}</span>
          <span className="ml-2 text-xs text-gray-400">{new Date(result.created_at).toLocaleDateString("th-TH")}</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            isCancelled ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {ONLINE_ORDER_STATUS_LABEL[result.status]}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          {!isCancelled && (
            <div className="mb-4 flex items-center">
              {STATUS_STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div
                    className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                      i <= stepIndex ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                  />
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 ${i < stepIndex ? "bg-indigo-600" : "bg-gray-200"}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1 text-xs text-gray-500">
            <p>วิธีรับสินค้า: {ONLINE_ORDER_DELIVERY_LABEL[result.delivery_method]}</p>
            <p>วิธีชำระเงิน: {ONLINE_ORDER_PAYMENT_LABEL[result.payment_method]}</p>
            <p>วันที่สั่งซื้อ: {new Date(result.created_at).toLocaleString("th-TH")}</p>
          </div>

          <div className="mt-3 divide-y border-t">
            {(result.items ?? []).map((it, idx) => (
              <div key={idx} className="flex justify-between py-1.5 text-sm">
                <span className="text-gray-700">
                  {it.product_name} × {it.qty}
                </span>
                <span className="text-gray-600">{money(it.line_total)} บาท</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold text-gray-800">
            <span>ยอดรวม</span>
            <span>{money(result.total)} บาท</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackClient({ initialOrderNo, initialPhone }: { initialOrderNo: string; initialPhone: string }) {
  const supabase = createClient();
  const [phone, setPhone] = useState(initialPhone);
  const [results, setResults] = useState<LookupResult[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function runSearch(phoneValue: string) {
    setErr("");
    setResults(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("lookup_online_orders_by_phone", {
        p_customer_phone: phoneValue,
      });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as LookupResult[];
      if (rows.length === 0) throw new Error("ไม่พบคำสั่งซื้อสำหรับเบอร์นี้");
      setResults(rows);
    } catch (e: any) {
      setErr(e.message || "ไม่พบคำสั่งซื้อ กรุณาตรวจสอบเบอร์โทรศัพท์");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      setErr("กรุณากรอกเบอร์โทรศัพท์");
      return;
    }
    runSearch(phone.trim());
  }

  useEffect(() => {
    if (initialPhone.trim()) {
      runSearch(initialPhone.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-3 text-lg font-bold text-gray-800">ติดตามคำสั่งซื้อ</h2>
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">เบอร์โทรศัพท์</label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="กรอกเบอร์โทรศัพท์ที่ใช้สั่งซื้อ"
          />
        </div>
        {initialOrderNo && (
          <p className="text-xs text-gray-400">เลขที่คำสั่งซื้อ: {initialOrderNo} (ระบบจะแสดงคำสั่งซื้อทั้งหมดของเบอร์นี้)</p>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "กำลังค้นหา..." : "ตรวจสอบสถานะ"}
        </button>
      </form>

      {results && results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((r, idx) => (
            <OrderCard key={r.order_no} result={r} defaultOpen={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
