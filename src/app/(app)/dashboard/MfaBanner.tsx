"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// เตือนแอดมินที่ยังไม่เปิดยืนยันตัวตน 2 ชั้น
export default function MfaBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    createClient().auth.mfa.listFactors().then(({ data }) => {
      setShow(!(data?.totp ?? []).some((f) => f.status === "verified"));
    });
  }, []);
  if (!show) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>🔐 บัญชีผู้ดูแลระบบยังไม่ได้เปิด <b>ยืนยันตัวตน 2 ชั้น</b> — แนะนำให้เปิดเพื่อกันคนอื่นเข้าบัญชีแม้รหัสผ่านหลุด</span>
      <Link href="/security" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">เปิดใช้งานตอนนี้</Link>
    </div>
  );
}
