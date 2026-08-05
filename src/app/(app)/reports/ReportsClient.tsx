"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { splitVat, EXPENSE_CATEGORY_LABEL, SALE_CHANNEL_LABEL, type Expense, type ExpenseCategory, type SaleChannel } from "@/lib/types";

interface SaleRow {
  sale_no: string;
  total: number;
  subtotal: number;
  discount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface POItemRow {
  qty: number;
  unit_cost: number;
  products: { name: string; unit: string } | { name: string; unit: string }[] | null;
}

interface ReceivedPO {
  id: string;
  received_at: string;
  note: string | null;
  suppliers: { name: string } | { name: string }[] | null;
  purchase_order_items: POItemRow[];
}

interface StockValuationRow {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stock_qty: number;
  cost_price: number;
  sell_price: number;
}

interface OutOfStockRow {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  last_sold_at: string | null;
  last_restocked_at: string | null;
}

interface AccountsPayableRow {
  id: string;
  supplier_name: string;
  received_at: string;
  po_total: number;
  payment_status: "unpaid" | "pending_transfer" | "paid";
  note: string | null;
  supplier_invoice_no: string | null;
}

interface AccountsReceivableRow {
  id: string;
  sale_no: string;
  channel: SaleChannel;
  platform_name: string | null;
  created_at: string;
  total: number;
  platform_fee_amount: number;
  customer_name: string | null;
}

function oneName(v: { name: string; unit?: string } | { name: string; unit?: string }[] | null): string {
  if (!v) return "-";
  return Array.isArray(v) ? v[0]?.name ?? "-" : v.name;
}

const payableStatusLabel: Record<AccountsPayableRow["payment_status"], string> = {
  unpaid: "ยังไม่จ่าย",
  pending_transfer: "รอโอน",
  paid: "จ่ายแล้ว",
};

const payableStatusBadgeClass: Record<AccountsPayableRow["payment_status"], string> = {
  unpaid: "bg-red-100 text-red-700",
  pending_transfer: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

function daysOutstanding(receivedAt: string): number {
  const ms = Date.now() - new Date(receivedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

type Tab = "sales" | "receiving" | "stock_cost" | "out_of_stock" | "payable" | "receivable" | "expenses";

export default function ReportsClient({
  grandTotal,
  grandProfit,
  dayRows,
  topProducts,
  sales,
  startDate,
  endDate,
  receivedPOs,
  stockValuation,
  outOfStock,
  accountsPayable,
  accountsReceivable,
  expenses,
}: {
  grandTotal: number;
  grandProfit: number;
  dayRows: [string, { total: number; profit: number }][];
  topProducts: [string, { qty: number; total: number; profit: number }][];
  sales: SaleRow[];
  startDate: string;
  endDate: string;
  receivedPOs: ReceivedPO[];
  stockValuation: StockValuationRow[];
  outOfStock: OutOfStockRow[];
  accountsPayable: AccountsPayableRow[];
  accountsReceivable: AccountsReceivableRow[];
  expenses: Expense[];
}) {
  const router = useRouter();
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [tab, setTab] = useState<Tab>("sales");

  function applyRange() {
    router.push(`/reports?start=${start}&end=${end}`);
  }

  const receivingTotal = receivedPOs.reduce(
    (sum, po) => sum + po.purchase_order_items.reduce((s, it) => s + Number(it.qty) * Number(it.unit_cost), 0),
    0
  );
  const stockValueTotal = stockValuation.reduce((s, p) => s + Number(p.stock_qty) * Number(p.cost_price), 0);
  const payableTotal = accountsPayable.reduce((s, po) => s + Number(po.po_total), 0);
  const receivableTotal = accountsReceivable.reduce((s, r) => s + Number(r.total), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = grandProfit - totalExpenses;
  const expensesByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {} as Record<ExpenseCategory, number>);

  function handleExport() {
    const wb = XLSX.utils.book_new();

    const summaryVat = splitVat(grandTotal);
    const summarySheet = XLSX.utils.json_to_sheet([
      { รายการ: `ยอดขายรวม (${startDate} ถึง ${endDate})`, จำนวนเงิน: Number(grandTotal.toFixed(2)) },
      { รายการ: "มูลค่าไม่รวม VAT", จำนวนเงิน: Number(summaryVat.base.toFixed(2)) },
      { รายการ: "VAT 7%", จำนวนเงิน: Number(summaryVat.vat.toFixed(2)) },
      { รายการ: "กำไรขั้นต้นโดยประมาณ", จำนวนเงิน: Number(grandProfit.toFixed(2)) },
      { รายการ: "รายจ่ายทั้งหมดในช่วงนี้", จำนวนเงิน: Number(totalExpenses.toFixed(2)) },
      { รายการ: "กำไรสุทธิโดยประมาณ", จำนวนเงิน: Number(netProfit.toFixed(2)) },
      { รายการ: "มูลค่าสินค้ารับเข้าในช่วงนี้", จำนวนเงิน: Number(receivingTotal.toFixed(2)) },
      { รายการ: "มูลค่าสต๊อกคงเหลือปัจจุบัน (ราคาทุน)", จำนวนเงิน: Number(stockValueTotal.toFixed(2)) },
      { รายการ: "จำนวนสินค้าหมดสต๊อกตอนนี้", จำนวนเงิน: outOfStock.length },
      { รายการ: "เจ้าหนี้การค้าคงค้าง (ยังไม่จ่าย+รอโอน)", จำนวนเงิน: Number(payableTotal.toFixed(2)) },
      { รายการ: "ยอดขายแพลตฟอร์มที่รอรับเงิน", จำนวนเงิน: Number(receivableTotal.toFixed(2)) },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, "สรุป");

    const daySheet = XLSX.utils.json_to_sheet(
      dayRows.map(([day, v]) => ({ วันที่: day, ยอดขาย: Number(v.total.toFixed(2)), กำไร: Number(v.profit.toFixed(2)) }))
    );
    XLSX.utils.book_append_sheet(wb, daySheet, "ยอดขาย-กำไรรายวัน");

    const productSheet = XLSX.utils.json_to_sheet(
      topProducts.map(([name, v]) => ({
        สินค้า: name,
        จำนวนที่ขาย: v.qty,
        ยอดขาย: Number(v.total.toFixed(2)),
        กำไรขั้นต้น: Number(v.profit.toFixed(2)),
      }))
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

    const receivingRows: Record<string, any>[] = [];
    receivedPOs.forEach((po) => {
      po.purchase_order_items.forEach((it) => {
        receivingRows.push({
          วันที่รับเข้า: new Date(po.received_at).toLocaleString("th-TH"),
          ผู้จัดจำหน่าย: oneName(po.suppliers),
          สินค้า: oneName(it.products),
          จำนวน: Number(it.qty),
          ราคาทุนต่อหน่วย: Number(it.unit_cost),
          รวม: Number((Number(it.qty) * Number(it.unit_cost)).toFixed(2)),
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(receivingRows), "การรับสินค้า");

    const stockCostSheet = XLSX.utils.json_to_sheet(
      stockValuation.map((p) => ({
        สินค้า: p.name,
        รหัส: p.sku ?? "",
        คงเหลือ: Number(p.stock_qty),
        ราคาทุนต่อหน่วย: Number(p.cost_price),
        มูลค่ารวม: Number((Number(p.stock_qty) * Number(p.cost_price)).toFixed(2)),
      }))
    );
    XLSX.utils.book_append_sheet(wb, stockCostSheet, "ต้นทุนสต๊อก");

    const oosSheet = XLSX.utils.json_to_sheet(
      outOfStock.map((p) => ({
        สินค้า: p.name,
        รหัส: p.sku ?? "",
        ขายล่าสุดเมื่อ: p.last_sold_at ? new Date(p.last_sold_at).toLocaleString("th-TH") : "-",
        รับเข้าล่าสุดเมื่อ: p.last_restocked_at ? new Date(p.last_restocked_at).toLocaleString("th-TH") : "-",
      }))
    );
    XLSX.utils.book_append_sheet(wb, oosSheet, "สินค้าหมดสต๊อก");

    const payableSheet = XLSX.utils.json_to_sheet(
      accountsPayable.map((po) => ({
        ผู้จัดจำหน่าย: po.supplier_name,
        เลขที่บิล: po.supplier_invoice_no ?? "",
        วันที่รับเข้า: new Date(po.received_at).toLocaleString("th-TH"),
        มูลค่า: Number(Number(po.po_total).toFixed(2)),
        สถานะ: payableStatusLabel[po.payment_status],
        ค้างมาแล้ว_วัน: daysOutstanding(po.received_at),
        หมายเหตุ: po.note ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(wb, payableSheet, "เจ้าหนี้การค้า");

    const receivableSheet = XLSX.utils.json_to_sheet(
      accountsReceivable.map((r) => ({
        เลขที่บิล: r.sale_no,
        ช่องทาง: r.channel === "other" ? (r.platform_name || SALE_CHANNEL_LABEL.other) : SALE_CHANNEL_LABEL[r.channel],
        วันที่ขาย: new Date(r.created_at).toLocaleString("th-TH"),
        ยอดขาย: Number(Number(r.total).toFixed(2)),
        ค่าธรรมเนียมแพลตฟอร์ม: Number(Number(r.platform_fee_amount).toFixed(2)),
        คาดว่าจะได้รับสุทธิ: Number((Number(r.total) - Number(r.platform_fee_amount)).toFixed(2)),
        ค้างมาแล้ว_วัน: daysOutstanding(r.created_at),
      }))
    );
    XLSX.utils.book_append_sheet(wb, receivableSheet, "รอรับเงินแพลตฟอร์ม");

    const expensesSheet = XLSX.utils.json_to_sheet(
      expenses.map((e) => ({
        วันที่: new Date(e.expense_date).toLocaleDateString("th-TH"),
        หมวดหมู่: EXPENSE_CATEGORY_LABEL[e.category],
        จำนวนเงิน: Number(Number(e.amount).toFixed(2)),
        ที่มา: e.source === "manual" ? "บันทึกเอง" : e.source === "po_freight" ? "ค่าขนส่ง (ใบสั่งซื้อ)" : "รายการประจำ",
        หมายเหตุ: e.note ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(wb, expensesSheet, "รายจ่าย");

    XLSX.writeFile(wb, `รายงาน_${startDate}_ถึง_${endDate}.xlsx`);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "sales", label: "ยอดขาย & กำไร" },
    { key: "receiving", label: "การรับสินค้า" },
    { key: "stock_cost", label: "ต้นทุนสต๊อก" },
    { key: "out_of_stock", label: `สินค้าหมดสต๊อก (${outOfStock.length})` },
    { key: "payable", label: `เจ้าหนี้การค้า (${accountsPayable.length})` },
    { key: "receivable", label: `รอรับเงินแพลตฟอร์ม (${accountsReceivable.length})` },
    { key: "expenses", label: "รายจ่าย" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">รายงาน</h1>
        <button
          onClick={handleExport}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          📊 ส่งออกเป็น Excel (ทุกรายงาน)
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-b-2 border-brand text-brand" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "sales" || tab === "receiving" || tab === "expenses") && (
        <div className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-xs text-gray-600">จากวันที่</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">ถึงวันที่</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
          </div>
          <button onClick={applyRange} className="rounded-lg border px-4 py-1.5 text-sm hover:bg-gray-50">แสดงผล</button>
        </div>
      )}

      {tab === "sales" && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">ยอดขายรวม ({startDate} ถึง {endDate})</p>
              <p className="mt-1 text-3xl font-bold text-brand">฿{grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">กำไรขั้นต้นโดยประมาณ</p>
              <p className="mt-1 text-3xl font-bold text-green-600">฿{grandProfit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">รายจ่ายทั้งหมด</p>
              <p className="mt-1 text-3xl font-bold text-red-600">฿{totalExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">กำไรสุทธิโดยประมาณ</p>
              <p className={`mt-1 text-3xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                ฿{netProfit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold">ยอดขาย-กำไรรายวัน</h2>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-2">วันที่</th><th className="py-2 text-right">ยอดขาย</th><th className="py-2 text-right">กำไร</th></tr></thead>
                <tbody>
                  {dayRows.map(([day, v]) => (
                    <tr key={day} className="border-b last:border-0">
                      <td className="py-2">{day}</td>
                      <td className="py-2 text-right font-medium">฿{v.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right text-green-600">฿{v.profit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {dayRows.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold">สินค้าขายดี Top 10</h2>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-2">สินค้า</th><th className="py-2 text-right">จำนวน</th><th className="py-2 text-right">ยอดขาย</th><th className="py-2 text-right">กำไร</th></tr></thead>
                <tbody>
                  {topProducts.map(([name, v]) => (
                    <tr key={name} className="border-b last:border-0">
                      <td className="py-2">{name}</td>
                      <td className="py-2 text-right">{v.qty}</td>
                      <td className="py-2 text-right font-medium">฿{v.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right text-green-600">฿{v.profit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "receiving" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">การรับสินค้าเข้า ({startDate} ถึง {endDate})</h2>
            <p className="text-sm text-gray-500">มูลค่ารวม <span className="font-bold text-brand">฿{receivingTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></p>
          </div>
          {receivedPOs.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">ไม่มีการรับสินค้าเข้าในช่วงนี้</p>
          ) : (
            <div className="space-y-4">
              {receivedPOs.map((po) => {
                const poTotal = po.purchase_order_items.reduce((s, it) => s + Number(it.qty) * Number(it.unit_cost), 0);
                return (
                  <div key={po.id} className="rounded-xl border p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{oneName(po.suppliers)}</p>
                        <p className="text-xs text-gray-500">{new Date(po.received_at).toLocaleString("th-TH")}</p>
                      </div>
                      <p className="font-semibold text-brand">฿{poTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {po.purchase_order_items.map((it, i) => (
                          <tr key={i} className="border-t first:border-0">
                            <td className="py-1">{oneName(it.products)}</td>
                            <td className="py-1 text-right">{it.qty}</td>
                            <td className="py-1 text-right">฿{Number(it.unit_cost).toLocaleString("th-TH")}</td>
                            <td className="py-1 text-right">฿{(Number(it.qty) * Number(it.unit_cost)).toLocaleString("th-TH")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "stock_cost" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">มูลค่าสต๊อกคงเหลือ (ราคาทุน ณ ปัจจุบัน)</h2>
            <p className="text-sm text-gray-500">รวมทั้งหมด <span className="font-bold text-brand">฿{stockValueTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">สินค้า</th>
                <th className="py-2">รหัส</th>
                <th className="py-2 text-right">คงเหลือ</th>
                <th className="py-2 text-right">ราคาทุน/หน่วย</th>
                <th className="py-2 text-right">มูลค่ารวม</th>
              </tr>
            </thead>
            <tbody>
              {stockValuation
                .slice()
                .sort((a, b) => Number(b.stock_qty) * Number(b.cost_price) - Number(a.stock_qty) * Number(a.cost_price))
                .map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-gray-500">{p.sku ?? "-"}</td>
                    <td className="py-2 text-right">{p.stock_qty} {p.unit}</td>
                    <td className="py-2 text-right">฿{Number(p.cost_price).toLocaleString("th-TH")}</td>
                    <td className="py-2 text-right font-medium">฿{(Number(p.stock_qty) * Number(p.cost_price)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              {stockValuation.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "out_of_stock" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">สินค้าที่หมดสต๊อกตอนนี้</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">สินค้า</th>
                <th className="py-2">รหัส</th>
                <th className="py-2">ขายล่าสุดเมื่อ</th>
                <th className="py-2">รับเข้าล่าสุดเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {outOfStock.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 text-gray-500">{p.sku ?? "-"}</td>
                  <td className="py-2 text-gray-500">{p.last_sold_at ? new Date(p.last_sold_at).toLocaleString("th-TH") : "-"}</td>
                  <td className="py-2 text-gray-500">{p.last_restocked_at ? new Date(p.last_restocked_at).toLocaleString("th-TH") : "-"}</td>
                </tr>
              ))}
              {outOfStock.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-400">ไม่มีสินค้าหมดสต๊อกในขณะนี้ 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "payable" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">เจ้าหนี้การค้าคงค้าง (ยังไม่จ่าย + รอโอน)</h2>
            <p className="text-sm text-gray-500">
              รวมทั้งหมด <span className="font-bold text-red-600">฿{payableTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">ผู้จัดจำหน่าย</th>
                <th className="py-2">เลขที่บิล</th>
                <th className="py-2">วันที่รับเข้า</th>
                <th className="py-2 text-right">ค้างมาแล้ว</th>
                <th className="py-2 text-right">มูลค่า</th>
                <th className="py-2 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {accountsPayable.map((po) => (
                <tr key={po.id} className="border-b last:border-0">
                  <td className="py-2">{po.supplier_name}</td>
                  <td className="py-2 text-gray-500">{po.supplier_invoice_no ?? "-"}</td>
                  <td className="py-2 text-gray-500">{new Date(po.received_at).toLocaleDateString("th-TH")}</td>
                  <td className="py-2 text-right text-gray-500">{daysOutstanding(po.received_at)} วัน</td>
                  <td className="py-2 text-right font-medium">฿{Number(po.po_total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${payableStatusBadgeClass[po.payment_status]}`}>
                      {payableStatusLabel[po.payment_status]}
                    </span>
                  </td>
                </tr>
              ))}
              {accountsPayable.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">ไม่มีเจ้าหนี้การค้าคงค้าง 🎉</td></tr>}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-400">
            ไปที่เมนู "ใบสั่งซื้อ" เพื่ออัปเดตสถานะการจ่ายเงินของแต่ละใบ
          </p>
        </div>
      )}

      {tab === "receivable" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">ยอดขายแพลตฟอร์มที่รอรับเงิน</h2>
            <p className="text-sm text-gray-500">
              รวมทั้งหมด <span className="font-bold text-amber-600">฿{receivableTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">เลขที่บิล</th>
                <th className="py-2">ช่องทาง</th>
                <th className="py-2">วันที่ขาย</th>
                <th className="py-2 text-right">ค้างมาแล้ว</th>
                <th className="py-2 text-right">ยอดขาย</th>
                <th className="py-2 text-right">ค่าธรรมเนียม</th>
                <th className="py-2 text-right">คาดว่าจะได้รับสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {accountsReceivable.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{r.sale_no}</td>
                  <td className="py-2 text-gray-500">
                    {r.channel === "other" ? (r.platform_name || SALE_CHANNEL_LABEL.other) : SALE_CHANNEL_LABEL[r.channel]}
                  </td>
                  <td className="py-2 text-gray-500">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
                  <td className="py-2 text-right text-gray-500">{daysOutstanding(r.created_at)} วัน</td>
                  <td className="py-2 text-right font-medium">฿{Number(r.total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right text-red-500">-฿{Number(r.platform_fee_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right font-semibold text-amber-600">
                    ฿{(Number(r.total) - Number(r.platform_fee_amount)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {accountsReceivable.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-400">ไม่มียอดขายแพลตฟอร์มที่รอรับเงิน 🎉</td></tr>}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-400">
            ไปที่เมนู "ประวัติการขาย" เพื่อกดยืนยันเมื่อได้รับเงินแล้ว
          </p>
        </div>
      )}

      {tab === "expenses" && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">รายจ่ายแยกตามหมวดหมู่ ({startDate} ถึง {endDate})</h2>
              <p className="text-sm text-gray-500">
                รวมทั้งหมด <span className="font-bold text-red-600">฿{totalExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">หมวดหมู่</th>
                  <th className="py-2 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(expensesByCategory) as [ExpenseCategory, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => (
                    <tr key={cat} className="border-b last:border-0">
                      <td className="py-2">{EXPENSE_CATEGORY_LABEL[cat]}</td>
                      <td className="py-2 text-right font-medium">฿{amt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                {expenses.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-gray-400">ไม่มีรายจ่ายในช่วงนี้</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold">รายการรายจ่ายทั้งหมด</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">วันที่</th>
                  <th className="py-2">หมวดหมู่</th>
                  <th className="py-2 text-right">จำนวนเงิน</th>
                  <th className="py-2">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-500">{new Date(e.expense_date).toLocaleDateString("th-TH")}</td>
                    <td className="py-2">{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                    <td className="py-2 text-right font-medium">฿{Number(e.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-gray-500">{e.note ?? "-"}</td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-400">ไม่มีรายจ่ายในช่วงนี้</td></tr>}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-gray-400">
              ไปที่เมนู "รายจ่าย" เพื่อบันทึกรายจ่ายใหม่หรือตั้งรายการประจำ
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
