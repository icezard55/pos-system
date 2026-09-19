"use client";
import Link from "next/link";
import { useState } from "react";
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
  const [paperSize, setPaperSize] = useState<"thermal" | "a5">("thermal");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  async function handleDownloadPdf() {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const el = document.getElementById("receipt");
      if (!el) throw new Error("ไม่พบเนื้อหาใบเสร็จ");

      const canvas = await html2canvas(el, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        ignoreElements: (node) => (node as HTMLElement).classList?.contains("no-print"),
      });
      const imgData = canvas.toDataURL("image/png");

      const margin = 5;
      const contentWidthMm = paperSize === "a5" ? 128 : 70;
      const contentHeightMm = (canvas.height / canvas.width) * contentWidthMm;
      const pageWidthMm = contentWidthMm + margin * 2;
      const pageHeightMm = contentHeightMm + margin * 2;

      const pdf = new jsPDF({
        unit: "mm",
        format: [pageWidthMm, pageHeightMm],
        orientation: "portrait",
      });
      pdf.addImage(imgData, "PNG", margin, margin, contentWidthMm, contentHeightMm);
      pdf.save(`ใบเสร็จ-${sale.sale_no}.pdf`);
    } catch (err) {
      console.error(err);
      alert("สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const printCss =
    paperSize === "a5"
      ? `
        @media print {
          @page { size: A5 portrait; margin: 10mm; }
          html, body { width: auto !important; }
          #receipt {
            width: 128mm !important;
            max-width: 128mm !important;
            padding: 0 !important;
            font-size: 14px !important;
          }
        }
      `
      : `
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { width: 80mm !important; }
          #receipt {
            width: 80mm !important;
            max-width: 80mm !important;
            padding: 4mm !important;
            font-size: 11px !important;
          }
        }
      `;

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <style dangerouslySetInnerHTML={{ __html: printCss }} />
      <div
        className={`mx-auto rounded-xl bg-white p-6 shadow-lg ${paperSize === "a5" ? "max-w-xl" : "max-w-sm"}`}
        id="receipt"
      >
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

        <div className="no-print mt-6 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <span>ขนาดกระดาษ:</span>
            <button
              type="button"
              onClick={() => setPaperSize("thermal")}
              className={`rounded-full px-3 py-1 font-medium ${paperSize === "thermal" ? "bg-brand text-white" : "border text-gray-600 hover:bg-gray-50"}`}
            >
              ความร้อน 80mm
            </button>
            <button
              type="button"
              onClick={() => setPaperSize("a5")}
              className={`rounded-full px-3 py-1 font-medium ${paperSize === "a5" ? "bg-brand text-white" : "border text-gray-600 hover:bg-gray-50"}`}
            >
              A5
            </button>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="w-full rounded-lg border border-brand py-2 text-sm font-semibold text-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloadingPdf ? "กำลังสร้างไฟล์ PDF..." : "📄 ดาวน์โหลด PDF"}
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              🖨️ พิมพ์ใบเสร็จ
            </button>
            <Link href="/pos" className="flex-1 rounded-lg border py-2 text-center text-sm hover:bg-gray-50">
              ขายต่อ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
