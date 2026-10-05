"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// แชทกับร้าน (ฝั่งลูกค้า ไม่ต้องล็อกอิน) — ใช้ token ลับที่เก็บใน localStorage เป็นตัวระบุห้องแชท
// ทุกการอ่าน/เขียนผ่าน RPC SECURITY DEFINER (chat_start / chat_customer_send / chat_customer_fetch ...)

interface Msg {
  id: number;
  sender: "customer" | "shop";
  body: string;
  created_at: string;
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ShopChatWidget({ shopId, shopName }: { shopId: string; shopName: string }) {
  const supabase = createClient();
  const storageKey = `poskeng_chat_${shopId}`;
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const t = window.localStorage.getItem(storageKey);
      if (t) setToken(t);
      const savedName = window.localStorage.getItem("poskeng_chat_name");
      const savedPhone = window.localStorage.getItem("poskeng_chat_phone");
      if (savedName) setName(savedName);
      if (savedPhone) setPhone(savedPhone);
    } catch {
      /* localStorage ใช้ไม่ได้ (โหมดส่วนตัวบางเบราว์เซอร์) — แชทได้แต่จะไม่จำห้องเดิม */
    }
  }, [storageKey]);

  const forgetToken = useCallback(() => {
    try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setToken(null);
    setMessages([]);
    lastIdRef.current = 0;
  }, [storageKey]);

  const fetchNew = useCallback(async (tk: string) => {
    const { data, error } = await supabase.rpc("chat_customer_fetch", { p_token: tk, p_after_id: lastIdRef.current });
    if (error) {
      if (/ไม่พบห้องแชท/.test(error.message)) forgetToken();
      return;
    }
    const rows = (data ?? []) as (Msg & { unread: number })[];
    if (rows.length) {
      lastIdRef.current = rows[rows.length - 1].id;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id)).map(({ id, sender, body, created_at }) => ({ id, sender, body, created_at }))];
      });
    }
  }, [supabase, forgetToken]);

  // ขณะเปิดหน้าต่างแชท: ดึงข้อความใหม่ทุก 4 วินาที และถือว่าอ่านแล้ว
  useEffect(() => {
    if (!open || !token) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      await fetchNew(token);
      await supabase.rpc("chat_customer_mark_read", { p_token: token });
      setUnread(0);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [open, token, fetchNew, supabase]);

  // ปิดหน้าต่างอยู่: เช็คข้อความตอบกลับจากร้านทุก 20 วินาที เพื่อแสดงจุดแจ้งเตือน
  useEffect(() => {
    if (open || !token) return;
    const check = async () => {
      const { data } = await supabase.rpc("chat_customer_unread", { p_token: token });
      const n = Number(data ?? 0);
      if (n === -1) forgetToken();
      else setUnread(n);
    };
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, [open, token, supabase, forgetToken]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setErr(null);
    try {
      let tk = token;
      if (!tk) {
        if (!name.trim()) throw new Error("กรุณากรอกชื่อก่อนเริ่มแชท");
        const { data, error } = await supabase.rpc("chat_start", { p_shop_id: shopId, p_name: name.trim(), p_phone: phone.trim() || null });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        tk = row?.token as string;
        if (!tk) throw new Error("เริ่มแชทไม่สำเร็จ");
        try {
          window.localStorage.setItem(storageKey, tk);
          window.localStorage.setItem("poskeng_chat_name", name.trim());
          window.localStorage.setItem("poskeng_chat_phone", phone.trim());
        } catch { /* ignore */ }
        setToken(tk);
      }
      const { error: sendErr } = await supabase.rpc("chat_customer_send", { p_token: tk, p_body: text });
      if (sendErr) throw sendErr;
      setInput("");
      await fetchNew(tk);
    } catch (ex: any) {
      setErr(ex.message ?? "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-indigo-600 py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-xl shadow-indigo-600/30 transition hover:bg-indigo-700 sm:bottom-6"
          aria-label="แชทกับร้าน"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
          แชทกับร้าน
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 text-xs font-bold ring-2 ring-white">{unread}</span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-2xl">
          <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-lg font-bold">{shopName.trim().charAt(0) || "ร"}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{shopName}</p>
              <p className="text-xs text-indigo-100">ปกติร้านจะตอบกลับภายในเวลาทำการ</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-2xl leading-none text-white/80 hover:bg-white/10" aria-label="ปิดแชท">×</button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-4">
            <div className="mx-auto max-w-[85%] rounded-2xl bg-white px-4 py-3 text-center text-sm text-gray-600 shadow-sm">
              สวัสดีครับ/ค่ะ 👋 สอบถามสินค้า ราคา หรือการจัดส่งได้เลย
            </div>
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.sender === "customer" ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md bg-white text-gray-800"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-right text-[10px] ${m.sender === "customer" ? "text-indigo-200" : "text-gray-400"}`}>{timeLabel(m.created_at)}</p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="space-y-2 border-t bg-white p-3">
            {!token && (
              <div className="grid grid-cols-2 gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="ชื่อของคุณ *" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" placeholder="เบอร์โทร (ไม่บังคับ)" className="rounded-lg border px-3 py-2 text-sm" />
              </div>
            )}
            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
                    e.preventDefault();
                    (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder="พิมพ์ข้อความ..."
                className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button type="submit" disabled={sending || !input.trim()} className="h-[42px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-40">
                {sending ? "..." : "ส่ง"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
