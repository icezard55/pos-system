"use client";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

interface IncomeRow {
  order_no: string;
  fee: number; // ค่าธรรมเนียมทั้งหมดที่ Shopee หักจริง (บวก)
  net: number; // ยอดที่ Shopee โอนให้ร้านจริง
  gross: number;
  refunded: boolean;
}

interface SaleLite {
  id: string;
  customer_name: string | null;
  channel: string;
  status: string;
  total: number;
  platform_fee_amount: number;
  platform_fee_actual?: number | null;
}

const COL = {
  order: "หมายเลขคำสั่งซื้อ",
  net: "จำนวนเงินทั้งหมดที่โอนแล้ว (฿)",
  gross: "สินค้าราคาปกติ",
  sellerDiscount: "ส่วนลดสินค้าจากผู้ขาย",
  refund: "จำนวนเงินที่ทำการคืนให้ผู้ซื้อ",
};

// ไฟล์ที่ Shopee ส่งออกมีค่า dimension ผิด (เช่น A1:X2) ทำให้ XLSX อ่านได้แค่ 1-2 แถว — คำนวณช่วงข้อมูลจริงจากเซลล์ที่มีอยู่
function fixRef(ws: XLSX.WorkSheet) {
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(ws)) {
    if (key[0] === "!") continue;
    const c = XLSX.utils.decode_cell(key);
    if (c.r > maxR) maxR = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ShopeeIncomeImport({
  sales,
  onClose,
  onDone,
}: {
  sales: SaleLite[];
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<IncomeRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [markReceived, setMarkReceived] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const [dbOrders, setDbOrders] = useState<Map<string, SaleLite> | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setRows(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames.find((n) => n.toLowerCase() === "income") ?? wb.SheetNames[0]];
      fixRef(ws);
      // หัวตารางอยู่ใต้ส่วนสรุป — หาแถวที่มีคำว่า "หมายเลขคำสั่งซื้อ"
      const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      const hi = grid.findIndex((r) => r.some((c) => String(c).trim() === COL.order));
      if (hi < 0 || !grid[hi].some((c) => String(c).trim() === COL.net)) {
        throw new Error('ไม่ใช่ไฟล์รายได้ของ Shopee (ไม่พบคอลัมน์ "หมายเลขคำสั่งซื้อ" / "จำนวนเงินทั้งหมดที่โอนแล้ว") — ต้องเป็นไฟล์ Income ที่ส่งออกจาก การเงิน → รายได้ของฉัน → โอนแล้ว');
      }
      const head = grid[hi].map((c) => String(c).trim());
      const raw: Record<string, any>[] = grid.slice(hi + 1).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]])));
      const out: IncomeRow[] = [];
      const seen = new Set<string>();
      for (const r of raw) {
        const order_no = String(r[COL.order] ?? "").replace(/[\t\s]/g, "");
        if (!/^[0-9A-Za-z]{10,}$/.test(order_no) || seen.has(order_no)) continue;
        seen.add(order_no);
        out.push({
          order_no,
          net: num(r[COL.net]),
          gross: num(r[COL.gross]),
          // ค่าธรรมเนียมรวมที่ผู้ขายแบกจริง = ยอดสินค้าหลังส่วนลดผู้ขาย − เงินที่โอนเข้า (รวมค่าคอม ค่าธุรกรรม ค่าส่งส่วนที่ร้านออกเอง)
          fee: Math.max(0, num(r[COL.gross]) - Math.abs(num(r[COL.sellerDiscount])) - num(r[COL.net])),
          refunded: num(r[COL.refund]) !== 0,
        });
      }
      if (out.length === 0) throw new Error("ไม่พบรายการคำสั่งซื้อในไฟล์");

      // ดึงบิล Shopee ทั้งหมดของร้านเพื่อจับคู่ด้วยเลขออเดอร์ (เก็บไว้ในชื่อลูกค้าตอนนำเข้า)
      const { data, error } = await supabase
        .from("sales")
        .select("id, customer_name, channel, status, total, platform_fee_amount, platform_fee_actual")
        .eq("channel", "shopee")
        .eq("status", "completed")
        .in("customer_name", out.map((o) => o.order_no));
      if (error) throw error;
      setDbOrders(new Map((data ?? []).map((s: any) => [String(s.customer_name).trim(), s])));
      setRows(out);
    } catch (err: any) {
      setMsg(err.message ?? String(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const settled = rows?.filter((r) => r.net > 0 && !r.refunded) ?? [];
  const zero = rows?.filter((r) => !(r.net > 0)) ?? [];
  const matched = settled.filter((r) => dbOrders?.has(r.order_no));
  const unmatched = settled.filter((r) => !dbOrders?.has(r.order_no));
  const already = matched.filter((r) => dbOrders?.get(r.order_no)?.platform_fee_actual != null);

  async function apply() {
    setBusy(true);
    setMsg(null);
    try {
      const payload = matched.map((r) => ({ order_no: r.order_no, fee: r.fee, net: r.net }));
      const { data, error } = await supabase.rpc("apply_platform_settlement", { p_rows: payload, p_mark_received: markReceived, p_channel: "shopee" });
      if (error) throw error;
      setDone(
        `บันทึกค่าธรรมเนียมจริง ${data.updated} บิล` +
          (markReceived ? ` · ทำเครื่องหมายรับเงินแล้ว ${data.received} บิล` : "") +
          (data.not_found?.length ? ` · หาบิลไม่เจอ ${data.not_found.length}` : "")
      );
    } catch (err: any) {
      setMsg(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const sumFee = matched.reduce((t, r) => t + r.fee, 0);
  const sumNet = matched.reduce((t, r) => t + r.net, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold">อัปโหลดไฟล์รายได้ Shopee — ค่าธรรมเนียมจริง</h2>
            <p className="text-xs text-gray-500">
              อ่านค่าธรรมเนียมและยอดเงินที่โอนเข้าจริงต่อออเดอร์ แล้วบันทึกลงบิลที่ตรงกัน (จับคู่ด้วยเลขออเดอร์) แทนค่าประมาณจาก %
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!rows && !done && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center text-sm text-gray-500 hover:bg-gray-50">
              <span className="text-3xl">📊</span>
              <span className="mt-2 font-medium">{busy ? "กำลังอ่านไฟล์..." : "เลือกไฟล์ Income.โอนเงินสำเร็จ….xlsx จาก Shopee"}</span>
              <span className="mt-1 text-xs">การเงิน → รายได้ของฉัน → โอนแล้ว → ดาวน์โหลดรายงาน Income</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={busy} className="hidden" />
            </label>
          )}
          {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
          {done && (
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              {done}
              <div className="mt-3">
                <button onClick={onDone} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">ปิดและรีเฟรช</button>
              </div>
            </div>
          )}

          {rows && !done && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-500">ในไฟล์</p><p className="text-lg font-bold">{rows.length}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-gray-500">จับคู่บิลได้ (โอนแล้ว)</p><p className="text-lg font-bold text-emerald-700">{matched.length}</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-gray-500">ไม่มีบิลในระบบ</p><p className="text-lg font-bold text-amber-700">{unmatched.length}</p></div>
                <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-500">ยังไม่โอน / คืนเงิน</p><p className="text-lg font-bold text-gray-600">{zero.length}</p></div>
              </div>

              <div className="mb-3 rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>ค่าธรรมเนียมจริงรวม <b className="text-red-600">-฿{baht(sumFee)}</b></span>
                  <span>เงินเข้าจริงรวม <b className="text-emerald-700">฿{baht(sumNet)}</b></span>
                  {already.length > 0 && <span className="text-gray-500">({already.length} บิลเคยบันทึกแล้ว — จะอัปเดตทับ)</span>}
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-3 py-2">เลขออเดอร์</th>
                      <th className="px-3 py-2 text-right">ยอดบิลในระบบ</th>
                      <th className="px-3 py-2 text-right">ค่าธรรมเนียมที่ประมาณ</th>
                      <th className="px-3 py-2 text-right">ค่าธรรมเนียมจริง</th>
                      <th className="px-3 py-2 text-right">เงินเข้าจริง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((r) => {
                      const s = dbOrders!.get(r.order_no)!;
                      return (
                        <tr key={r.order_no} className="border-t">
                          <td className="px-3 py-1.5 font-mono">{r.order_no}</td>
                          <td className="px-3 py-1.5 text-right">฿{baht(Number(s.total))}</td>
                          <td className="px-3 py-1.5 text-right text-gray-400">{Number(s.platform_fee_amount) > 0 ? `฿${baht(Number(s.platform_fee_amount))}` : "-"}</td>
                          <td className="px-3 py-1.5 text-right text-red-600">-฿{baht(r.fee)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">฿{baht(r.net)}</td>
                        </tr>
                      );
                    })}
                    {matched.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">ไม่มีบิลที่จับคู่ได้ — ต้องนำเข้าไฟล์ออเดอร์ของ Shopee ก่อน</td></tr>}
                  </tbody>
                </table>
              </div>
              {unmatched.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  ไม่มีบิลในระบบ {unmatched.length} ออเดอร์ (เช่น {unmatched.slice(0, 3).map((r) => r.order_no).join(", ")}) — น่าจะยังไม่ได้นำเข้าไฟล์ออเดอร์ของวันนั้น
                </p>
              )}
              {zero.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">ออเดอร์ที่ยอดโอนเป็น 0 (ยกเลิก/คืนเงิน/ยังไม่โอน) {zero.length} รายการ จะไม่ถูกแก้ไข</p>
              )}
            </>
          )}
        </div>

        {rows && !done && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={markReceived} onChange={(e) => setMarkReceived(e.target.checked)} />
              ทำเครื่องหมาย "รับเงินแล้ว" ให้บิลที่ Shopee โอนแล้ว
            </label>
            <div className="flex gap-2">
              <button onClick={() => setRows(null)} className="rounded-lg border px-4 py-2 text-sm">เลือกไฟล์ใหม่</button>
              <button onClick={apply} disabled={busy || matched.length === 0} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                {busy ? "กำลังบันทึก..." : `บันทึก (${matched.length} บิล)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
