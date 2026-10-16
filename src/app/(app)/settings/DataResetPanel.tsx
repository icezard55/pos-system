"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";

type Mode = "sales" | "trial" | "all";

const MODES: { key: Mode; title: string; desc: string; keeps: string; color: string }[] = [
  {
    key: "sales",
    title: "ล้างเฉพาะยอดขาย",
    desc: "ลบบิลขายทั้งหมด (รวมออเดอร์ออนไลน์ รูปตีกลับ และรายจ่ายค่าธรรมเนียมแพลตฟอร์ม) แล้วคืนสต๊อกที่ถูกตัดจากการขายให้ ยอดแต้ม/ยอดค้างเชื่อของลูกค้าจะรีเซ็ตเป็น 0",
    keeps: "เก็บ: สินค้า ลูกค้า ใบสั่งซื้อ รายจ่าย เจ้าหนี้ ผู้จัดจำหน่าย การตั้งค่า",
    color: "border-amber-300 bg-amber-50",
  },
  {
    key: "trial",
    title: "ล้างข้อมูลทดลองใช้ (ก่อนเปิดร้านจริง)",
    desc: "ลบธุรกรรมทั้งหมด: บิลขาย ออเดอร์ออนไลน์ แชท ใบสั่งซื้อ เจ้าหนี้ รายจ่าย ประวัติสต๊อก ใบตรวจนับ กะเงินสด การแลกแต้ม ยอดแต้ม/ยอดเชื่อของลูกค้ารีเซ็ตเป็น 0 — ยอดสต๊อกคงเหลือในปัจจุบันของสินค้าจะคงไว้ (ยกเว้นส่วนที่ตัดจากการขายจะถูกคืนให้)",
    keeps: "เก็บ: สินค้า ลูกค้า ผู้จัดจำหน่าย โปรโมชั่น โค้ดส่วนลด ของรางวัล การตั้งค่า บัญชีผู้ใช้",
    color: "border-orange-300 bg-orange-50",
  },
  {
    key: "all",
    title: "ล้างทั้งหมด",
    desc: "ลบทุกอย่างของร้านเหมือนเริ่มใหม่: ธุรกรรมทั้งหมดตามข้างบน และสินค้า บาร์โค้ด ลูกค้า ผู้จัดจำหน่าย โปรโมชั่น โค้ดส่วนลด ของรางวัล การจับคู่ SKU",
    keeps: "เก็บ: การตั้งค่าร้าน และบัญชีผู้ใช้ (พนักงาน) เท่านั้น",
    color: "border-red-300 bg-red-50",
  },
];

export default function DataResetPanel({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const [backupDone, setBackupDone] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function open(m: Mode) {
    setMode(m);
    setBackupDone(false);
    setPassword("");
    setPhrase("");
    setMsg(null);
    setResult(null);
  }

  async function backup() {
    setBackupBusy(true);
    setMsg(null);
    try {
      const pull = (table: string, order = "id") =>
        fetchAllRows<any>((f, t) => supabase.from(table).select("*").order(order).range(f, t));
      const [products, customers, suppliers, sales, saleItems, pos, poItems, expenses, payables, payments, movements, settings] = await Promise.all([
        pull("products"), pull("customers"), pull("suppliers"), pull("sales"), pull("sale_items"),
        pull("purchase_orders"), pull("purchase_order_items"), pull("expenses"), pull("payables"),
        pull("payable_payments"), pull("stock_movements"), pull("shop_settings"),
      ]);
      const wb = XLSX.utils.book_new();
      const add = (name: string, rows: any[]) =>
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ หมายเหตุ: "ไม่มีข้อมูล" }]), name);
      add("สินค้า", products);
      add("ลูกค้า", customers);
      add("ผู้จัดจำหน่าย", suppliers);
      add("บิลขาย", sales);
      add("รายการในบิลขาย", saleItems);
      add("ใบสั่งซื้อ", pos);
      add("รายการในใบสั่งซื้อ", poItems);
      add("รายจ่าย", expenses);
      add("เจ้าหนี้", payables);
      add("การจ่ายเจ้าหนี้", payments);
      add("ประวัติสต๊อก", movements);
      add("ตั้งค่าร้าน", settings);
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
      XLSX.writeFile(wb, `สำรองข้อมูลร้านก่อนล้าง_${stamp}.xlsx`);
      setBackupDone(true);
    } catch (err: any) {
      setMsg(`สำรองข้อมูลไม่สำเร็จ: ${err.message ?? err} — ยังไม่สามารถล้างข้อมูลได้`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function run() {
    if (!mode) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: userEmail, password });
      if (authError) throw new Error("รหัสผ่านไม่ถูกต้อง");
      const { data, error } = await supabase.rpc("reset_shop_data", { p_mode: mode, p_confirm: phrase.trim() });
      if (error) throw error;
      const parts: string[] = [];
      if (data?.sales != null) parts.push(`บิลขาย ${data.sales}`);
      if (data?.purchase_orders != null) parts.push(`ใบสั่งซื้อ ${data.purchase_orders}`);
      if (data?.expenses != null) parts.push(`รายจ่าย ${data.expenses}`);
      if (data?.payables != null) parts.push(`เจ้าหนี้ ${data.payables}`);
      if (data?.products != null) parts.push(`สินค้า ${data.products}`);
      if (data?.customers != null) parts.push(`ลูกค้า ${data.customers}`);
      setResult(`ล้างข้อมูลเรียบร้อย — ลบ ${parts.join(" · ") || "ข้อมูลที่เลือก"}`);
      setMode(null);
    } catch (err: any) {
      setMsg(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const sel = MODES.find((m) => m.key === mode);
  const canRun = backupDone && password.length > 0 && phrase.trim() === "ล้างข้อมูล" && !busy;

  return (
    <div className="mt-8 rounded-2xl border-2 border-red-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-red-700">⚠️ ล้างข้อมูล (โซนอันตราย)</h2>
      <p className="mb-4 text-xs text-gray-500">
        ลบแล้วกู้คืนไม่ได้ — ระบบจะบังคับให้ดาวน์โหลดไฟล์สำรอง Excel ก่อนทุกครั้ง และต้องยืนยันรหัสผ่านกับพิมพ์คำว่า "ล้างข้อมูล" ใช้ได้เฉพาะผู้ดูแลระบบ และล้างเฉพาะข้อมูลของร้านนี้
      </p>
      {result && <p className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{result}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => open(m.key)}
            className={`rounded-xl border p-3 text-left transition hover:shadow ${m.color} ${mode === m.key ? "ring-2 ring-red-400" : ""}`}
          >
            <p className="font-semibold text-gray-800">🗑️ {m.title}</p>
            <p className="mt-1 text-xs text-gray-600">{m.keeps}</p>
          </button>
        ))}
      </div>

      {sel && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4">
          <p className="font-semibold text-red-700">{sel.title}</p>
          <p className="mt-1 text-sm text-gray-700">{sel.desc}</p>
          <p className="mt-1 text-xs text-gray-500">{sel.keeps}</p>

          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-gray-600">ขั้นที่ 1 — สำรองข้อมูลเป็น Excel (บังคับ)</p>
              <button onClick={backup} disabled={backupBusy} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">
                {backupBusy ? "กำลังสร้างไฟล์สำรอง..." : backupDone ? "✅ ดาวน์โหลดแล้ว (กดอีกครั้งเพื่อโหลดซ้ำ)" : "⬇️ ดาวน์โหลดไฟล์สำรอง Excel"}
              </button>
              <p className="mt-1 text-[11px] text-gray-400">ไฟล์ประกอบด้วย สินค้า ลูกค้า ผู้จัดจำหน่าย บิลขาย+รายการ ใบสั่งซื้อ+รายการ รายจ่าย เจ้าหนี้ ประวัติสต๊อก และตั้งค่าร้าน</p>
            </div>
            <div className={backupDone ? "" : "pointer-events-none opacity-40"}>
              <p className="mb-1 text-xs font-medium text-gray-600">ขั้นที่ 2 — ยืนยันตัวตน</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="รหัสผ่านของคุณ" className="rounded-lg border bg-white px-3 py-2 text-sm" />
                <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder='พิมพ์คำว่า  ล้างข้อมูล' className="rounded-lg border bg-white px-3 py-2 text-sm" />
              </div>
            </div>
            {msg && <p className="text-sm text-red-600">{msg}</p>}
            <div className="flex gap-2">
              <button onClick={run} disabled={!canRun} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
                {busy ? "กำลังล้างข้อมูล..." : `ยืนยัน ${sel.title}`}
              </button>
              <button onClick={() => setMode(null)} className="rounded-lg border bg-white px-4 py-2 text-sm">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
