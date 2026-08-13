"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OnlineOrder, OnlineOrderStatus } from "@/lib/types";
import {
  ONLINE_ORDER_STATUS_LABEL,
  ONLINE_ORDER_DELIVERY_LABEL,
  ONLINE_ORDER_PAYMENT_LABEL,
} from "@/lib/types";

function money(n: number) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TABS: { key: "all" | OnlineOrderStatus; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending_payment", label: "รอชำระเงิน" },
  { key: "pending_confirmation", label: "รอยืนยัน" },
  { key: "confirmed", label: "ยืนยันแล้ว" },
  { key: "packed", label: "แพ็คแล้ว" },
  { key: "shipped", label: "จัดส่งแล้ว" },
  { key: "completed", label: "สำเร็จ" },
  { key: "cancelled", label: "ยกเลิก" },
];

const STATUS_BADGE: Record<OnlineOrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-700",
  pending_confirmation: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  packed: "bg-purple-100 text-purple-700",
  shipped: "bg-cyan-100 text-cyan-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const NEXT_STATUS: Partial<Record<OnlineOrderStatus, { status: OnlineOrderStatus; label: string }>> = {
  confirmed: { status: "packed", label: "อัปเดต: แพ็คสินค้าแล้ว" },
  packed: { status: "shipped", label: "อัปเดต: จัดส่งแล้ว" },
  shipped: { status: "completed", label: "อัปเดต: สำเร็จ" },
};

export default function OnlineOrdersClient({ orders }: { orders: OnlineOrder[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<"all" | OnlineOrderStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [slipView, setSlipView] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    orders.forEach((o) => {
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [orders]);

  const filtered = tab === "all" ? orders : orders.filter((o) => o.status === tab);

  async function handleConfirm(orderId: string) {
    setErr("");
    setBusyId(orderId);
    try {
      const { error } = await supabase.rpc("confirm_online_order", { p_order_id: orderId });
      if (error) throw error;
      router.refresh();
    } catch (e: any) {
      setErr(e.message || "ยืนยันคำสั่งซื้อไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(orderId: string) {
    const reason = window.prompt("เหตุผลการยกเลิก (ถ้ามี):") ?? "";
    setErr("");
    setBusyId(orderId);
    try {
      const { error } = await supabase.rpc("cancel_online_order", { p_order_id: orderId, p_reason: reason || null });
      if (error) throw error;
      router.refresh();
    } catch (e: any) {
      setErr(e.message || "ยกเลิกคำสั่งซื้อไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdvance(orderId: string, status: OnlineOrderStatus) {
    setErr("");
    setBusyId(orderId);
    try {
      const { error } = await supabase.rpc("update_online_order_status", { p_order_id: orderId, p_status: status });
      if (error) throw error;
      router.refresh();
    } catch (e: any) {
      setErr(e.message || "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-gray-800">ออเดอร์ออนไลน์</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              tab === t.key ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label} {counts[t.key] ? `(${counts[t.key]})` : ""}
          </button>
        ))}
      </div>

      {err && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{err}</p>}

      <div className="space-y-3">
        {filtered.map((o) => {
          const nextStep = NEXT_STATUS[o.status];
          return (
            <div key={o.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">{o.order_no}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[o.status]}`}>
                      {ONLINE_ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {o.customer_name} · {o.customer_phone}
                  </p>
                  <p className="text-xs text-gray-400">
                    {ONLINE_ORDER_DELIVERY_LABEL[o.delivery_method]} · {ONLINE_ORDER_PAYMENT_LABEL[o.payment_method]} ·{" "}
                    {new Date(o.created_at).toLocaleString("th-TH")}
                  </p>
                  {o.customer_address && <p className="text-xs text-gray-400">ที่อยู่: {o.customer_address}</p>}
                  {o.cancel_reason && <p className="text-xs text-red-500">เหตุผลยกเลิก: {o.cancel_reason}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-800">{money(o.total)} บาท</p>
                  {o.payment_slip_url && (
                    <button
                      onClick={() => setSlipView(o.payment_slip_url)}
                      className="mt-1 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      ดูสลิปโอนเงิน
                    </button>
                  )}
                </div>
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-400">รายการสินค้า ({o.online_order_items?.length ?? 0})</summary>
                <div className="mt-1 divide-y border-t text-sm">
                  {(o.online_order_items ?? []).map((it) => (
                    <div key={it.id} className="flex justify-between py-1">
                      <span className="text-gray-700">
                        {it.product_name} × {it.qty}
                      </span>
                      <span className="text-gray-500">{money(it.line_total)} บาท</span>
                    </div>
                  ))}
                </div>
              </details>

              <div className="mt-3 flex flex-wrap gap-2">
                {o.status === "pending_confirmation" && (
                  <button
                    disabled={busyId === o.id}
                    onClick={() => handleConfirm(o.id)}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    ยืนยันคำสั่งซื้อ
                  </button>
                )}
                {nextStep && (
                  <button
                    disabled={busyId === o.id}
                    onClick={() => handleAdvance(o.id, nextStep.status)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {nextStep.label}
                  </button>
                )}
                {(o.status === "pending_payment" || o.status === "pending_confirmation") && (
                  <button
                    disabled={busyId === o.id}
                    onClick={() => handleCancel(o.id)}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
                  >
                    ยกเลิกคำสั่งซื้อ
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-gray-400">ไม่มีคำสั่งซื้อ</p>}
      </div>

      {slipView && (
        <div
          onClick={() => setSlipView(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slipView} alt="สลิปโอนเงิน" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
