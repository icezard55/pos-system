"use client";
import { useState } from "react";

interface Entry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
}

const actionLabel: Record<string, string> = {
  void_sale: "ยกเลิกบิล",
  adjust_stock: "ปรับสต๊อก",
  update_role: "เปลี่ยนสิทธิ์ผู้ใช้",
  pay_credit: "รับชำระหนี้",
  receive_po: "รับสินค้าเข้าตามใบสั่งซื้อ",
};

function actorName(v: Entry["profiles"]): string {
  if (!v) return "ระบบ";
  const one = Array.isArray(v) ? v[0] : v;
  return one?.full_name ?? "ไม่ทราบชื่อ";
}

export default function AuditLogClient({ entries }: { entries: Entry[] }) {
  const [filter, setFilter] = useState("");

  const filtered = entries.filter((e) =>
    (actionLabel[e.action] ?? e.action).toLowerCase().includes(filter.toLowerCase()) ||
    actorName(e.profiles).toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">ประวัติการดำเนินการ (Audit Log)</h1>
      <input
        placeholder="ค้นหาประเภทการกระทำหรือชื่อผู้ใช้..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
      />
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">เวลา</th>
              <th className="px-4 py-3">ผู้ทำรายการ</th>
              <th className="px-4 py-3">การกระทำ</th>
              <th className="px-4 py-3">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{new Date(e.created_at).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3">{actorName(e.profiles)}</td>
                <td className="px-4 py-3 font-medium">{actionLabel[e.action] ?? e.action}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {e.detail ? JSON.stringify(e.detail) : "-"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
