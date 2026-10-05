"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Conversation {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_admin: number;
  unread_customer: number;
  created_at: string;
}

interface Msg {
  id: number;
  sender: "customer" | "shop";
  body: string;
  created_at: string;
}

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "เมื่อสักครู่";
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function msgTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ChatClient({ initialConversations }: { initialConversations: Conversation[] }) {
  const supabase = createClient();
  const [convs, setConvs] = useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const lastIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => convs.find((c) => c.id === activeId) ?? null, [convs, activeId]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) => c.customer_name.toLowerCase().includes(q) || (c.customer_phone ?? "").includes(q));
  }, [convs, search]);

  const loadConvs = useCallback(async () => {
    const { data } = await supabase
      .from("chat_conversations")
      .select("id, customer_name, customer_phone, last_message_at, last_message_preview, unread_admin, unread_customer, created_at")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data) setConvs(data as Conversation[]);
  }, [supabase]);

  const loadMessages = useCallback(async (convId: string, reset: boolean) => {
    if (reset) lastIdRef.current = 0;
    const { data } = await supabase
      .from("chat_messages")
      .select("id, sender, body, created_at")
      .eq("conversation_id", convId)
      .gt("id", lastIdRef.current)
      .order("id", { ascending: true })
      .limit(500);
    const rows = (data ?? []) as Msg[];
    if (reset) setMessages(rows);
    else if (rows.length) setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...rows.filter((r) => !seen.has(r.id))];
    });
    if (rows.length) {
      lastIdRef.current = rows[rows.length - 1].id;
      if (rows.some((r) => r.sender === "customer")) {
        await supabase.rpc("chat_admin_mark_read", { p_conversation_id: convId });
        setConvs((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_admin: 0 } : c)));
      }
    }
  }, [supabase]);

  // รายการห้องแชท: รีเฟรชทุก 5 วินาที
  useEffect(() => {
    const id = setInterval(loadConvs, 5000);
    return () => clearInterval(id);
  }, [loadConvs]);

  // ห้องที่เปิดอยู่: ดึงข้อความใหม่ทุก 3 วินาที
  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId, true);
    const id = setInterval(() => loadMessages(activeId, false), 3000);
    return () => clearInterval(id);
  }, [activeId, loadMessages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("chat_admin_send", { p_conversation_id: activeId, p_body: text });
      if (error) throw error;
      setInput("");
      await loadMessages(activeId, false);
      loadConvs();
    } catch (ex: any) {
      setErr(ex.message ?? "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  const totalUnread = convs.reduce((s, c) => s + c.unread_admin, 0);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">แชทลูกค้า</h1>
          <p className="text-sm text-gray-500">ข้อความจากลูกค้าในหน้าร้านค้าออนไลน์ {totalUnread > 0 && <span className="font-semibold text-rose-600">· ยังไม่อ่าน {totalUnread} ข้อความ</span>}</p>
        </div>
      </div>

      <div className="flex h-[calc(100vh-12rem)] min-h-[420px] overflow-hidden rounded-2xl border bg-white shadow-sm">
        {/* รายชื่อห้องแชท */}
        <div className={`${activeId ? "hidden md:flex" : "flex"} w-full flex-col border-r md:w-80 md:shrink-0`}>
          <div className="border-b p-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / เบอร์โทร" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-400">
                {convs.length === 0 ? "ยังไม่มีลูกค้าทักแชทเข้ามา — ลูกค้ากดปุ่ม \"แชทกับร้าน\" ในหน้าร้านค้าออนไลน์ได้" : "ไม่พบห้องแชท"}
              </p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-start gap-3 border-b px-3 py-3 text-left transition hover:bg-gray-50 ${activeId === c.id ? "bg-indigo-50" : ""}`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                  {c.customer_name.trim().charAt(0) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm ${c.unread_admin > 0 ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>{c.customer_name}</p>
                    <span className="shrink-0 text-[11px] text-gray-400">{relTime(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-xs ${c.unread_admin > 0 ? "text-gray-800" : "text-gray-500"}`}>{c.last_message_preview ?? "—"}</p>
                    {c.unread_admin > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{c.unread_admin}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ห้องแชทที่เลือก */}
        <div className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {!active ? (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-gray-400">เลือกห้องแชททางซ้ายเพื่อเริ่มตอบลูกค้า</div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <button type="button" onClick={() => setActiveId(null)} className="text-xl text-gray-500 md:hidden" aria-label="กลับ">←</button>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-indigo-100 font-semibold text-indigo-700">{active.customer_name.trim().charAt(0) || "?"}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{active.customer_name}</p>
                  <p className="text-xs text-gray-500">
                    {active.customer_phone ? <a href={`tel:${active.customer_phone}`} className="text-indigo-600 hover:underline">📞 {active.customer_phone}</a> : "ไม่ได้ให้เบอร์โทร"}
                    {" · "}เริ่มแชท {msgTime(active.created_at)}
                  </p>
                </div>
              </div>
              <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "shop" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.sender === "shop" ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md bg-white text-gray-800"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-0.5 text-right text-[10px] ${m.sender === "shop" ? "text-indigo-200" : "text-gray-400"}`}>{msgTime(m.created_at)}</p>
                    </div>
                  </div>
                ))}
                {active.unread_customer > 0 && messages.length > 0 && (
                  <p className="text-right text-[11px] text-gray-400">ลูกค้ายังไม่ได้เปิดอ่าน</p>
                )}
              </div>
              <form onSubmit={handleSend} className="border-t p-3">
                {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
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
                    placeholder="พิมพ์ข้อความตอบลูกค้า... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                    className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <button type="submit" disabled={sending || !input.trim()} className="h-[42px] rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-40">
                    {sending ? "..." : "ส่ง"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
