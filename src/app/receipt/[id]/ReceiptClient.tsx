"use client";
import Link from "next/link";
import type { Sale, SaleItem, SalePayment, ShopSettings } from "@/lib/types";
import { splitVat } from "@/lib/types";

const methodLabel: Record<string, string> = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  card: "บัตร",
  credit: "ขายเชื่อ",
  split: "แบ่งชำระ",
};

export default function ReceiptClient({
  sale,
  items,
  payments,
  shopSettings,
}: {
  sale: Sale;
  items: SaleItem[];
  payments: SalePayment[];
  shopSettings: ShopSettings | null;
}) {
  const dt = new Date(sale.created_at);
  const { base, vat } = splitVat(Number(sale.total));
  const isTaxInvoice = !!(sale.customer_tax_id || sale.customer_address);

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto max-w-sm rounded-xl bg-white p-6 shadow-lg" id="receipt">
        <div className="mb-4 text-center">
          {shopSettings && (
            <>
              <p className="font-bold">{shopSettings.shop_name}</p>
              {shopSettings.address && <p className="text-xs text-gray-500">{shopSettings.address}</p>}
              {shopSettings.tax_id && <p className="text-xs text-gray-500">เลขผู้เสียภาษี: {shopSettings.tax_id}</p>}
              {shopSettings.phone && <p className="text-xs text-gray-500">โทร. {shopSettings.phone}</p>}
              <div className="my-2 border-t border-dashed" />
            </>
          )}
          <p className="text-lg font-bold">{isTaxInvoice ? "ใบกำกับภาษีอย่างย่อ" : "ใบเสร็จรับเงิน"}</p>
          <p className="text-xs text-gray-500">เลขที่บิล: {sale.sale_no}</p>
          <p className="text-xs text-gray-500">{dt.toLocaleString("th-TH")}</p>
          {sale.customer_name && <p className="text-xs text-gray-500">ลูกค้า: {sale.customer_name}</p>}
          {sale.customer_tax_id && <p className="text-xs text-gray-500">เลขผู้เสียภาษีลูกค้า: {sale.customer_tax_id}</p>}
          {sale.customer_address && <p className="text-xs text-gray-500">{sale.customer_address}</p>}
          {sale.status === "void" && (
            <p className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">บิลนี้ถูกยกเลิกแล้ว</p>
          )}
        </div>
        <div className="border-t border-dashed py-3">
          {items.map((it) => (
            <div key={it.id} className="mb-1.5 flex justify-between text-sm">
              <div>
                <p>{it.product_name}</p>
                <p className="text-xs text-gray-500">
                  {it.qty} x ฿{Number(it.unit_price).toLocaleString("th-TH")}
                  {Number(it.discount) > 0 && ` (ลด ฿${Number(it.discount).toLocaleString("th-TH")})`}
                </p>
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
              <span>ส่วนลดรวม</span>
              <span>-฿{Number(sale.discount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>ยอดสุทธิ</span>
            <span>฿{Number(sale.total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          {payments.length > 1 ? (
            <div className="space-y-0.5">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between text-gray-500">
                  <span>ชำระโดย {methodLabel[p.method] ?? p.method}</span>
                  <span>฿{Number(p.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-between text-gray-500">
              <span>ชำระโดย</span>
              <span>{methodLabel[payments[0]?.method ?? sale.payment_method] ?? sale.payment_method}</span>
            </div>
          )}
        </div>
        {shopSettings?.show_vat_on_receipt !== false && (
          <div className="mt-2 space-y-0.5 border-t border-dashed pt-2 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>มูลค่าสินค้า (ไม่รวม VAT)</span>
              <span>฿{base.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
              <span>฿{vat.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
            <p className="pt-1 text-center text-[10px] text-gray-400">(ราคาสินค้ารวมภาษีมูลค่าเพิ่มแล้ว)</p>
          </div>
        )}
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
