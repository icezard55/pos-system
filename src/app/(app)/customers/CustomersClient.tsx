"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Customer, CustomerType } from "@/lib/types";
import { CUSTOMER_TYPE_LABEL } from "@/lib/types";

const CUSTOMER_HEADER_MAP: Record<string, string> = {
  "ชื่อลูกค้า": "name",
  "ชื่อ": "name",
  "name": "name",
  "เบอร์โทร": "phone",
  "เบอร์โทรศัพท์": "phone",
  "phone": "phone",
  "ประเภทลูกค้า": "customer_type",
  "ประเภท": "customer_type",
  "customer_type": "customer_type",
  "วงเงินเชื่อ": "credit_limit",
  "วงเงินเครดิต": "credit_limit",
  "credit_limit": "credit_limit",
  "หมายเหตุ": "note",
  "note": "note",
};

function normalizeCustomerType(v: any): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.includes("ส่ง") || s === "wholesale") return "wholesale";
  return "retail";
}

export default function CustomersClient({
  initialCustomers,
  isAdmin,
  shopId,
}: {
  initialCustomers: Customer[];
  isAdmin: boolean;
  shopId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [customerType, setCustomerType] = useState<CustomerType>("retail");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? "").includes(search)
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          shop_id: shopId,
          name: name.trim(),
          phone: phone || null,
          note: note || null,
          credit_limit: isAdmin ? Number(creditLimit) || 0 : 0,
          customer_type: customerType,
        })
        .select()
        .single();
      if (error) throw error;
      setCustomers((prev) => [data, ...prev]);
      setName("");
      setPhone("");
      setCreditLimit("0");
      setCustomerType("retail");
      setNote("");
      setShowAdd(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "เพิ่มลูกค้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCreditLimit(c: Customer, value: number) {
    setError(null);
    try {
      const { error } = await supabase.from("customers").update({ credit_limit: value }).eq("id", c.id);
      if (error) throw error;
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, credit_limit: value } : x)));
    } catch (err: any) {
      setError(err.message ?? "แก้ไขวงเงินไม่สำเร็จ");
    }
  }

  async function handleUpdateCustomerType(c: Customer, value: CustomerType) {
    setError(null);
    try {
      const { error } = await supabase.from("customers").update({ customer_type: value }).eq("id", c.id);
      if (error) throw error;
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, customer_type: value } : x)));
    } catch (err: any) {
      setError(err.message ?? "แก้ไขประเภทลูกค้าไม่สำเร็จ");
    }
  }

  async function refreshCustomers() {
    const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    setCustomers(data ?? []);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setImportMsg(null);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

      const rows = raw
        .map((row) => {
          const mapped: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            const norm = CUSTOMER_HEADER_MAP[key.trim()] ?? CUSTOMER_HEADER_MAP[key.trim().toLowerCase()];
            if (norm) mapped[norm] = row[key];
          }
          if (mapped.customer_type) mapped.customer_type = normalizeCustomerType(mapped.customer_type);
          return mapped;
        })
        .filter((r) => r.name && String(r.name).trim() !== "");

      if (rows.length === 0) {
        setImportMsg("ไม่พบข้อมูลลูกค้าในไฟล์ กรุณาตรวจสอบหัวคอลัมน์ เช่น ชื่อลูกค้า, เบอร์โทร, ประเภทลูกค้า");
        setBusy(false);
        return;
      }

      const { data, error } = await supabase.rpc("import_customers", { p_rows: rows });
      if (error) throw error;
      setImportMsg(`นำเข้าสำเร็จ ${data} รายการ (ลูกค้าที่เบอร์โทรตรงกับที่มีอยู่แล้วจะอัปเดตข้อมูลแทนการเพิ่มซ้ำ)`);
      await refreshCustomers();
      router.refresh();
    } catch (err: any) {
      setImportMsg(`นำเข้าไม่สำเร็จ: ${err.message ?? err}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadCustomerTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { "ชื่อลูกค้า": "ตัวอย่างชื่อลูกค้า", "เบอร์โทร": "0812345678", "ประเภทลูกค้า": "ลูกค้าทั่วไป", "วงเงินเชื่อ": 0, "หมายเหตุ": "" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "customers");
    XLSX.writeFile(wb, "template_นำเข้าลูกค้า.xlsx");
  }

  async function handlePayCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("pay_customer_credit", {
        p_customer_id: payTarget.id,
        p_amount: amount,
      });
      if (error) throw error;
      setCustomers((prev) => prev.map((c) => (c.id === payTarget.id ? { ...c, credit_balance: Number(data) } : c)));
      setPayTarget(null);
      setPayAmount("");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "บันทึกการชำระหนี้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ลูกค้า / สมาชิก</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadCustomerTemplate} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
            ⬇️ ดาวน์โหลดเทมเพลต
          </button>
          <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
            📥 นำเข้าจาก Excel/CSV
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} className="hidden" />
          </label>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            {showAdd ? "ยกเลิก" : "+ เพิ่มลูกค้า"}
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-400">
        ไฟล์นำเข้าต้องมีหัวคอลัมน์: ชื่อลูกค้า, เบอร์โทร, ประเภทลูกค้า (ลูกค้าทั่วไป/ลูกค้าขายส่ง), วงเงินเชื่อ, หมายเหตุ —
        ลูกค้าที่เบอร์โทรตรงกับที่มีอยู่แล้วในระบบจะถูกอัปเดตข้อมูลแทนการเพิ่มซ้ำ
      </p>

      {importMsg && <p className="mb-4 text-sm text-gray-600">{importMsg}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อลูกค้า *" required className="rounded-lg border px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="เบอร์โทร" className="rounded-lg border px-3 py-2 text-sm" />
          <select value={customerType} onChange={(e) => setCustomerType(e.target.value as CustomerType)} className="rounded-lg border px-3 py-2 text-sm">
            {Object.entries(CUSTOMER_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {isAdmin && (
            <input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="วงเงินเชื่อ (บาท)" className="rounded-lg border px-3 py-2 text-sm" />
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ" className="rounded-lg border px-3 py-2 text-sm" />
          <button type="submit" disabled={busy} className="sm:col-span-2 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {busy ? "กำลังบันทึก..." : "บันทึกลูกค้า"}
          </button>
        </form>
      )}

      {payTarget && (
        <div className="mb-6 rounded-2xl border border-brand/30 bg-white p-5 shadow-sm">
          <h2 className="mb-2 font-semibold">บันทึกการชำระหนี้: {payTarget.name}</h2>
          <p className="mb-2 text-xs text-gray-500">ยอดค้างปัจจุบัน ฿{Number(payTarget.credit_balance).toLocaleString("th-TH")}</p>
          <form onSubmit={handlePayCredit} className="flex gap-2">
            <input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="จำนวนเงิน" required className="flex-1 rounded-lg border px-3 py-2 text-sm" />
            <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">บันทึก</button>
            <button type="button" onClick={() => setPayTarget(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">ยกเลิก</button>
          </form>
        </div>
      )}

      <input
        placeholder="ค้นหาชื่อหรือเบอร์โทร..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">เบอร์โทร</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3 text-right">แต้มสะสม</th>
              <th className="px-4 py-3 text-right">วงเงินเชื่อ</th>
              <th className="px-4 py-3 text-right">ยอดค้างชำระ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone ?? "-"}</td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <select
                      value={c.customer_type ?? "retail"}
                      onChange={(e) => handleUpdateCustomerType(c, e.target.value as CustomerType)}
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${
                        c.customer_type === "wholesale" ? "bg-sky-50 text-sky-600" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {Object.entries(CUSTOMER_TYPE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${c.customer_type === "wholesale" ? "bg-sky-50 text-sky-600" : "bg-gray-100 text-gray-500"}`}>
                      {CUSTOMER_TYPE_LABEL[c.customer_type ?? "retail"]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{c.points}</td>
                <td className="px-4 py-3 text-right">
                  {isAdmin ? (
                    <input
                      type="number"
                      min={0}
                      defaultValue={c.credit_limit}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== c.credit_limit) handleUpdateCreditLimit(c, v);
                      }}
                      className="w-24 rounded border px-2 py-1 text-right text-xs"
                    />
                  ) : (
                    `฿${Number(c.credit_limit).toLocaleString("th-TH")}`
                  )}
                </td>
                <td className={`px-4 py-3 text-right font-medium ${Number(c.credit_balance) > 0 ? "text-red-600" : ""}`}>
                  ฿{Number(c.credit_balance).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right">
                  {Number(c.credit_balance) > 0 && (
                    <button onClick={() => { setPayTarget(c); setPayAmount(""); }} className="text-brand hover:underline">
                      รับชำระหนี้
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">ไม่มีข้อมูลลูกค้า</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
