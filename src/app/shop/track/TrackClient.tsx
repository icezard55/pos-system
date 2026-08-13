"use client";
import { useState } from "react";
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

export default function TrackClient({ initialOrderNo, initialPhone }: { initialOrderNo: string; initialPhone: string }) {
  const supabase = createClient();
  const [orderNo, setOrderNo] = useState(initialOrderNo);
  const [phone, setPhone] = useState(initialPhone);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setResult(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("lookup_online_order", {
        p_order_no: orderNo,
        p_customer_phone: phone,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("ไม่พบคำสั่งซื้อ");
      setResult(row as LookupResult);
    } catch (e: any) {
      setErr(e.message || "ไม่พบคำสั่งซื้อ กรุณาตรวจสอบข้อมูล");
    } finally {
      setLoading(false);
    }
  }

  const stepIndex = result ? STATUS_STEPS.indexOf(result.status) : -1;
  const isCancelled = result?.status === "cancelled";

  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-3 text-lg font-bold text-gray-800">ติดตามคำสั่งซื้อ</h2>
      <form onSubmit={handleLookup} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">เลขที่คำสั่งซื้อ</label>
          <input
            required
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="OLxxxxxxxx"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">เบอร์โทรศัพท์</label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "กำลังค้นหา..." : "ตรวจสอบสถานะ"}
        </button>
      </form>

      {result && (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-bold text-gray-800">{result.order_no}</span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                isCancelled ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"
              }`}
            >
              {ONLINE_ORDER_STATUS_LABEL[result.status]}
            </span>
          </div>

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
