"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Factor { id: string; friendly_name?: string | null; status: string; created_at: string }

export default function SecurityClient() {
  const supabase = createClient();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.all ?? []) as unknown as Factor[]));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const verified = factors.filter((f) => f.status === "verified");

  async function start() {
    setBusy(true);
    setMsg(null);
    // ลบรายการที่เคยเริ่มตั้งค่าแต่ยังไม่ยืนยัน (ค้างจากครั้งก่อน)
    for (const f of factors.filter((x) => x.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `POSKENG ${new Date().toLocaleDateString("th-TH")}`,
    });
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: error?.message ?? "เริ่มตั้งค่าไม่สำเร็จ" }); return; }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode("");
  }

  async function confirm() {
    if (!enroll) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: "รหัสไม่ถูกต้อง ลองกรอกรหัสล่าสุดจากแอปอีกครั้ง" }); return; }
    setEnroll(null);
    setMsg({ ok: true, text: "เปิดใช้งานยืนยันตัวตน 2 ชั้นเรียบร้อย ครั้งต่อไปที่ล็อกอินต้องกรอกรหัสจากแอปด้วย" });
    load();
  }

  async function cancelEnroll() {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id });
    setEnroll(null);
    load();
  }

  async function remove(f: Factor) {
    if (!window.confirm("ปิดการยืนยันตัวตน 2 ชั้น? บัญชีจะเหลือแค่รหัสผ่านอย่างเดียว")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: "ปิดการยืนยันตัวตน 2 ชั้นแล้ว" });
    load();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🔐 ความปลอดภัยบัญชี</h1>
        <p className="text-sm text-gray-500">ตั้งค่ายืนยันตัวตน 2 ชั้น (2FA) ของบัญชีที่ล็อกอินอยู่</p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">ยืนยันตัวตน 2 ชั้นด้วยแอป Authenticator</h2>
            <p className="text-xs text-gray-500">หลังกรอกรหัสผ่าน ต้องกรอกรหัส 6 หลักจากแอปบนมือถืออีกชั้น แม้รหัสผ่านหลุดก็เข้าบัญชีไม่ได้</p>
          </div>
          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${verified.length ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
            {verified.length ? "เปิดอยู่ ✓" : "ยังไม่เปิด"}
          </span>
        </div>

        {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

        {verified.map((f) => (
          <div key={f.id} className="mt-4 flex items-center justify-between rounded-xl border p-3 text-sm">
            <div>
              <p className="font-medium">📱 {f.friendly_name || "แอป Authenticator"}</p>
              <p className="text-xs text-gray-400">เปิดใช้เมื่อ {new Date(f.created_at).toLocaleString("th-TH")}</p>
            </div>
            <button onClick={() => remove(f)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">ปิด 2FA</button>
          </div>
        ))}

        {!verified.length && !enroll && (
          <button onClick={start} disabled={busy} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "กำลังเตรียม..." : "เปิดใช้งาน 2FA"}
          </button>
        )}

        {enroll && (
          <div className="mt-4 space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm">
            <p className="font-semibold">ขั้นที่ 1: ติดตั้งแอปบนมือถือ</p>
            <p className="text-xs text-gray-600">Google Authenticator หรือ Microsoft Authenticator (ฟรี ใน App Store / Play Store)</p>
            <p className="font-semibold">ขั้นที่ 2: สแกน QR นี้ด้วยแอป</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="QR สำหรับแอป Authenticator" className="h-48 w-48 rounded-lg bg-white p-2" />
            <p className="text-xs text-gray-500">สแกนไม่ได้? กรอกรหัสนี้ในแอปแทน: <span className="select-all break-all font-mono text-gray-800">{enroll.secret}</span></p>
            <p className="font-semibold">ขั้นที่ 3: กรอกรหัส 6 หลักที่แอปแสดง</p>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-40 rounded-lg border px-3 py-2 text-center text-lg tracking-widest"
              />
              <button onClick={confirm} disabled={busy || code.length !== 6} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50">
                {busy ? "กำลังตรวจสอบ..." : "ยืนยันและเปิดใช้"}
              </button>
              <button onClick={cancelEnroll} className="rounded-lg border px-3 py-2 text-gray-600">ยกเลิก</button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-800">
        💡 เก็บมือถือที่ติดตั้งแอปไว้ให้ดี ถ้าทำหายหรือเปลี่ยนเครื่อง จะเข้าบัญชีไม่ได้จนกว่าผู้ดูแลระบบจะรีเซ็ต 2FA ให้ —
        แนะนำให้เปิดในแอป Authenticator ฟีเจอร์สำรองข้อมูลบัญชี (Google Authenticator: เปิด sync กับบัญชี Google)
      </div>
    </div>
  );
}
