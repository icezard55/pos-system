"use client";
import { useState } from "react";
import Link from "next/link";
import type { Sale } from "@/lib/types";

export default function SalesClient({ sales }: { sales: Sale[] }) {
  const [search, setSearch] = useState("");
  const filtered = sales.filter(
    (s) => s.sale_no.toLowerCase().includes(search.toLowerCase()) || (s.customer_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const todayTotal = sales
    .filter((s) => new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + Number(s.total), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ประวัติการขาย</h1>
        <p className="text-sm text-gray-500">
          ยอดขายวันนี้: <span className="font-bold text-brand">฿{todayTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
        </p>
      </div>
      <input
        placeholder="ค้นหาเลขที่บิลหรือชื่อลูกค้า..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
      />
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">เลขที่บิล</th>
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3">ลูกค้า</th>
              <th className="px-4 py-3">ชำระโดย</th>
              <th className="px-4 py-3 text-right">ยอดสุทธิ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.sale_no}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3">{s.customer_name ?? "-"}</td>
                <td className="px-4 py-3 text-gray-500">{s.payment_method}</td>
                <td className="px-4 py-3 text-right font-semibold">฿{Number(s.total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/receipt/${s.id}`} className="text-brand hover:underline">ดูใบเสร็จ</Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">ไม่มีรายการขาย</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
