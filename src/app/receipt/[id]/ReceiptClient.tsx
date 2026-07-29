"use client";
import Link from "next/link";
import type { Sale, SaleItem } from "@/lib/types";

export default function ReceiptClient({ sale, items }: { sale: Sale; items: SaleItem[] }) {
  const dt = new Date(sale.created_at);

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto max-w-sm rounded-xl bg-white p-6 shadow-lg" id="receipt">
        <div className="mb-4 text-center">
          <p className="text-lg font-bold">ใบเสร็จรับเงิน</p>
          <p className="text-xs text-gray-500">เลขที่บิล: {sale.sale_no}</p>
          <p className="text-xs text-gray-500">{dt.toLocaleString("th-TH")}</p>
          {sale.customer_name && <p className="text-xs text-gray-500">ลูกค้า: {sale.customer_name}</p>}
        </div>
        <div className="border-t border-dashed py-3">
          {items.map((it) => (
            <div key={it.id} className="mb-1.5 flex justify-between text-sm">
              <div>
                <p>{it.product_name}</p>
                <p className="text-xs text-gray-500">{it.qty} x ฿{Number(it.unit_price).toLocaleString("th-TH")}</p>
              </div>
              <p className="font-medium">฿{Number(it.line_total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-dashed pt-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>ยอดรวม</span>
            <span>฿{Number(sale.subtotal).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>ส่วนลด</span>
              <span>-฿{Number(sale.discount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>ยอดสุทธิ</span>
            <span>฿{Number(sale.total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>ชำระโดย</span>
            <span>{sale.payment_method === "cash" ? "เงินสด" : sale.payment_method === "transfer" ? "โอนเงิน" : "บัตร"}</span>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-gray-400">ขอบคุณที่ใช้บริการ</p>

        <div className="no-print mt-6 flex gap-2">
          <button onClick={() => window.print()} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            🖨️ พิมพ์ใบเสร็จ
          </button>
          <Link href="/pos" className="flex-1 rounded-lg border py-2 text-center text-sm hover:bg-gray-50">
            ขายต่อ
          </Link>
        </div>
      </div>
    </div>
  );
}
