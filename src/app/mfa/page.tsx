"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MfaPage() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const f = data?.totp?.find((x) => x.status === "verified");
      if (f) setFactorId(f.id);
      else router.replace("/dashboard");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setErr("รหัสไม่ถูกต้องหรือหมดเวลา ลองกรอกรหัสล่าสุดจากแอปอีกครั้ง");
      setCode("");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-dark px-4">
      <form onSubmit={verify} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-center">
          <p className="text-3xl">🔐</p>
          <h1 className="mt-1 text-lg font-bold text-gray-800">ยืนยันตัวตน 2 ชั้น</h1>
          <p className="text-sm text-gray-500">เปิดแอป Authenticator บนมือถือ แล้วกรอกรหัส 6 หลักของบัญชีนี้</p>
        </div>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="w-full rounded-lg border px-3 py-3 text-center text-2xl tracking-[0.5em]"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy || code.length !== 6 || !factorId} className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
          {busy ? "กำลังตรวจสอบ..." : "ยืนยัน"}
        </button>
        <button type="button" onClick={signOut} className="w-full text-center text-xs text-gray-500 hover:underline">
          ออกจากระบบ / ใช้บัญชีอื่น
        </button>
        <p className="text-center text-[11px] text-gray-400">ทำมือถือหายหรือเปลี่ยนเครื่อง? ติดต่อผู้ดูแลระบบเพื่อรีเซ็ต 2FA</p>
      </form>
    </div>
  );
}
