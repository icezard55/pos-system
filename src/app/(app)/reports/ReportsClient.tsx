"use client";
import * as XLSX from "xlsx";
import { splitVat } from "@/lib/types";

interface SaleRow {
  sale_no: string;
  total: number;
  subtotal: number;
  discount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export default function ReportsClient({
  grandTotal,
  dayRows,
  topProducts,
  sales,
}: {
  grandTotal: number;
  dayRows: [string, number][];
  topProducts: [string, { qty: number; total: number }][];
  sales: SaleRow[];
}) {
  function handleExport() {
    const wb = XLSX.utils.book_new();

    const summaryVat = splitVat(grandTotal);
    const summarySheet = XLSX.utils.json_to_sheet([
      { รายการ: "ยอดขายรวม 30 วัน (รวม VAT)", จำนวนเงิน: Number(grandTotal.toFixed(2)) },
      { รายการ: "มูลค่าไม่รวม VAT", จำนวนเงิน: Number(summaryVat.base.toFixed(2)) },
      { รายการ: "VAT 7%", จำนวนเงิน: Number(summaryVat.vat.toFixed(2)) },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, "สรุป");

    const daySheet = XLSX.utils.json_to_sheet(
      dayRows.map(([day, total]) => ({ วันที่: day, ยอดขาย: Number(total.toFixed(2)) }))
    );
    XLSX.utils.book_append_sheet(wb, daySheet, "ยอดขายรายวัน");

    const productSheet = XLSX.utils.json_to_sheet(
      topProducts.map(([name, v]) => ({ สินค้า: name, จำนวนที่ขาย: v.qty, ยอดขาย: Number(v.total.toFixed(2)) }))
    );
    XLSX.utils.book_append_sheet(wb, productSheet, "สินค้าขายดี");

    const salesSheet = XLSX.utils.json_to_sheet(
      sales.map((s) => ({
        เลขที่บิล: s.sale_no,
        วันที่: new Date(s.created_at).toLocaleString("th-TH"),
        ยอดก่อนหักส่วนลด: Number(Number(s.subtotal).toFixed(2)),
        ส่วนลด: Number(Number(s.discount).toFixed(2)),
        ยอดสุทธิ: Number(Number(s.total).toFixed(2)),
        ชำระโดย: s.payment_method,
        สถานะ: s.status,
      }))
    );
    XLSX.utils.book_append_sheet(wb, salesSheet, "รายการขายทั้งหมด");

    XLSX.writeFile(wb, `รายงานยอดขาย_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">รายงาน (30 วันล่าสุด)</h1>
        <button
          onClick={handleExport}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          📊 ส่งออกเป็น Excel
        </button>
      </div>

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">ยอดขายรวม 30 วัน</p>
        <p className="mt-1 text-3xl font-bold text-brand">฿{grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">ยอดขายรายวัน</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="py-2">วันที่</th><th className="py-2 text-right">ยอดขาย</th></tr></thead>
            <tbody>
              {dayRows.map(([day, total]) => (
                <tr key={day} className="border-b last:border-0"><td className="py-2">{day}</td><td className="py-2 text-right font-medium">฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>
              ))}
              {dayRows.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">สินค้าขายดี Top 10</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="py-2">สินค้า</th><th className="py-2 text-right">จำนวน</th><th className="py-2 text-right">ยอดขาย</th></tr></thead>
            <tbody>
              {topProducts.map(([name, v]) => (
                <tr key={name} className="border-b last:border-0">
                  <td className="py-2">{name}</td>
                  <td className="py-2 text-right">{v.qty}</td>
                  <td className="py-2 text-right font-medium">฿{v.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {topProducts.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
