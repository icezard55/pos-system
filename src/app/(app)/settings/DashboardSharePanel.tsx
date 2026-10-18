"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ShareRow {
  id: string; token: string; label: string | null; created_at: string;
  revoked_at: string | null; view_count: number; last_viewed_at: string | null;
}

export default function DashboardSharePanel() {
  const supabase = createClient();
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const urlOf = (t: string) => `${window.location.origin}/share/${t}`;

  async function load() {
    const { data } = await supabase.rpc("list_dashboard_shares");
    setRows((data as ShareRow[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function create() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("create_dashboard_share", { p_label: label, p_password: password });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setLabel(""); setPassword("");
    setMsg(`สร้างลิงก์แล้ว: ${urlOf(data as string)} — ส่งลิงก์และรหัสผ่านให้ผู้ที่ต้องการให้ดู`);
    load();
  }
  async function revoke(id: string) {
    if (!confirm("ยกเลิกลิงก์นี้? คนที่มีลิงก์จะเข้าไม่ได้อีก")) return;
    const { error } = await supabase.rpc("revoke_dashboard_share", { p_id: id });
    if (error) setMsg(error.message);
    load();
  }
  async function changePw(id: string) {
    const np = prompt("ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)");
    if (!np) return;
    const { error } = await supabase.rpc("set_dashboard_share_password", { p_id: id, p_password: np });
    setMsg(error ? error.message : "เปลี่ยนรหัสผ่านแล้ว");
  }
  async function copy(t: string) {
    try { await navigator.clipboard.writeText(urlOf(t)); setCopied(t); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  const active = rows.filter((r) => !r.revoked_at);

  return (
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-gray-800">🔗 แชร์แดชบอร์ดให้บุคคลภายนอก</h2>
      <p className="mb-4 text-xs text-gray-500">
        สร้างลิงก์ + รหัสผ่าน ผู้รับเปิดดูแดชบอร์ดได้แบบอ่านอย่างเดียว (เห็นข้อมูลเหมือนแดชบอร์ดจริง รวมต้นทุนและกำไร) โดยไม่ต้องมีบัญชี
        ใส่รหัสผิด 5 ครั้งจะถูกล็อก 15 นาที · ยกเลิกลิงก์ได้ทุกเมื่อ
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ชื่อเรียก เช่น ผู้ถือหุ้น / บัญชี" className="min-w-[10rem] flex-1 rounded-lg border px-3 py-2 text-sm" />
        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="ตั้งรหัสผ่าน (6 ตัวขึ้นไป)" className="min-w-[10rem] flex-1 rounded-lg border px-3 py-2 text-sm" />
        <button onClick={create} disabled={busy || password.length < 6} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "กำลังสร้าง..." : "สร้างลิงก์แชร์"}
        </button>
      </div>
      {msg && <p className="mt-2 break-all rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{msg}</p>}

      {active.length > 0 && (
        <div className="mt-4 divide-y rounded-xl border">
          {active.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800">{r.label || "(ไม่มีชื่อ)"}</p>
                <p className="truncate text-[11px] text-gray-400">
                  /share/{r.token.slice(0, 8)}… · เปิดดู {r.view_count} ครั้ง
                  {r.last_viewed_at ? ` · ล่าสุด ${new Date(r.last_viewed_at).toLocaleString("th-TH")}` : ""}
                </p>
              </div>
              <button onClick={() => copy(r.token)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50">{copied === r.token ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}</button>
              <button onClick={() => changePw(r.id)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50">เปลี่ยนรหัส</button>
              <button onClick={() => revoke(r.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">ยกเลิกลิงก์</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
