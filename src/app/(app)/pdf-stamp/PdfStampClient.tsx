"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PDFDocument, degrees } from "pdf-lib";
import { createClient } from "@/lib/supabase/client";

type Anchor = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

interface El {
  id: number;
  kind: "text" | "qr" | "image";
  text: string; // ข้อความ หรือ ข้อความ/ลิงก์ที่จะทำ QR
  color: string;
  fontSize: number; // pt (เฉพาะข้อความ)
  bold: boolean;
  img?: string; // data URL (รูปที่อัปโหลด)
  width: number; // pt (รูป/QR)
  opacity: number; // 0-100
  rotate: number; // องศา
  anchor: Anchor;
  dx: number; // เลื่อนไปทางขวา (pt)
  dy: number; // เลื่อนขึ้น (pt)
}

const ANCHORS: { v: Anchor; label: string }[] = [
  { v: "tl", label: "↖" }, { v: "tc", label: "↑" }, { v: "tr", label: "↗" },
  { v: "ml", label: "←" }, { v: "mc", label: "●" }, { v: "mr", label: "→" },
  { v: "bl", label: "↙" }, { v: "bc", label: "↓" }, { v: "br", label: "↘" },
];

const STORE_KEY = "pdfStampElements.v1";
const SCALE = 4; // ความละเอียดตอนแปลงข้อความเป็นรูป

let nextId = 1;
const newEl = (kind: El["kind"], patch: Partial<El> = {}): El => ({
  id: nextId++,
  kind,
  text: kind === "text" ? "ขอบคุณที่อุดหนุน" : "",
  color: "#111111",
  fontSize: 14,
  bold: true,
  width: 70,
  opacity: kind === "text" ? 70 : 100,
  rotate: 0,
  anchor: "bc",
  dx: 0,
  dy: 6,
  ...patch,
});

// ข้อความ (ไทยได้) → รูป PNG โปร่งใส ใช้ฟอนต์ของเบราว์เซอร์ จึงไม่ต้องฝังฟอนต์ใน PDF
function textToPng(text: string, color: string, fontSize: number, bold: boolean) {
  const px = fontSize * SCALE;
  const font = `${bold ? "700" : "400"} ${px}px "Noto Sans Thai", "Sarabun", Tahoma, "Leelawadee UI", sans-serif`;
  const lines = text.split("\n");
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width), 1)) + 8;
  const lineH = Math.ceil(px * 1.5);
  c.width = w;
  c.height = lineH * lines.length + 8;
  const g = c.getContext("2d")!;
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, 4, 4 + i * lineH + px * 0.1));
  return { dataUrl: c.toDataURL("image/png"), w: c.width / SCALE, h: c.height / SCALE };
}

async function toPngDataUrl(src: string): Promise<{ dataUrl: string; ratio: number }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("โหลดรูปไม่ได้"));
    i.src = src;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return { dataUrl: c.toDataURL("image/png"), ratio: img.naturalHeight / img.naturalWidth };
}

const dataUrlToBytes = (d: string) => Uint8Array.from(atob(d.split(",")[1]), (ch) => ch.charCodeAt(0));

function parsePages(spec: string, total: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.add(i - 1);
  }
  return out;
}

export default function PdfStampClient({
  shopName,
  receiptQrUrl,
  shopTemplate,
  isAdmin,
}: {
  shopName: string;
  receiptQrUrl: string | null;
  shopTemplate: El[] | null;
  isAdmin: boolean;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [els, setEls] = useState<El[]>([]);
  const [pageMode, setPageMode] = useState<"all" | "first" | "range">("all");
  const [pageSpec, setPageSpec] = useState("1");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  // จำค่าที่ตั้งไว้ครั้งก่อน (ข้อความ/ตำแหน่ง/ขนาด — ไม่เก็บรูปที่อัปโหลด)
  useEffect(() => {
    // ลายน้ำประจำร้าน (ตั้งโดยผู้ดูแล) ใช้ก่อน เพื่อให้ทุกเครื่องเหมือนกัน
    if (Array.isArray(shopTemplate) && shopTemplate.length) {
      setEls(shopTemplate.map((e) => ({ ...e, id: nextId++ })));
      return;
    }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved: El[] = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) {
          saved.forEach((e) => (e.id = nextId++));
          setEls(saved);
          return;
        }
      }
    } catch {}
    setEls([newEl("text", { text: shopName || "ขอบคุณที่อุดหนุน" })]);
  }, [shopName, shopTemplate]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(els.map((e) => (e.kind === "image" ? { ...e, img: undefined } : e)).filter((e) => e.kind !== "image")));
    } catch {}
  }, [els]);

  const patch = (id: number, p: Partial<El>) => setEls((prev) => prev.map((e) => (e.id === id ? { ...e, ...p } : e)));

  async function saveShopTemplate() {
    if (!confirm("บันทึกลายน้ำชุดนี้เป็น \"ลายน้ำประจำร้าน\" ให้ทุกเครื่องและทุกพนักงานใช้ร่วมกัน?")) return;
    setMsg(null);
    try {
      const payload = els.map((e) => ({ ...e }));
      const { error } = await supabase.rpc("set_pdf_stamp_template", { p_template: payload });
      if (error) throw error;
      setMsg("✅ บันทึกลายน้ำประจำร้านแล้ว");
    } catch (err: any) {
      setMsg(err.message ?? String(err));
    }
  }

  function loadShopTemplate() {
    if (Array.isArray(shopTemplate) && shopTemplate.length) setEls(shopTemplate.map((e) => ({ ...e, id: nextId++ })));
  }

  async function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg(null);
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      const doc = await PDFDocument.load(b, { ignoreEncryption: true });
      setBytes(b);
      setFileName(f.name);
      setPageCount(doc.getPageCount());
      setResultBytes(null);
      setPreviewUrl(null);
    } catch (err: any) {
      setMsg(`เปิดไฟล์ PDF ไม่ได้: ${err.message ?? err}`);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = URL.createObjectURL(f);
      const { dataUrl } = await toPngDataUrl(url);
      URL.revokeObjectURL(url);
      setEls((p) => [...p, newEl("image", { img: dataUrl, anchor: "br", dx: -6, dy: 6 })]);
    } catch (err: any) {
      setMsg(err.message ?? "เปิดรูปไม่ได้");
    } finally {
      if (imgRef.current) imgRef.current.value = "";
    }
  }

  async function addShopQr() {
    if (!receiptQrUrl) return;
    try {
      const { dataUrl } = await toPngDataUrl(receiptQrUrl);
      setEls((p) => [...p, newEl("image", { img: dataUrl, text: "QR ร้าน", anchor: "br", dx: -6, dy: 6, width: 70 })]);
    } catch {
      setMsg("โหลด QR ร้านจากตั้งค่าไม่ได้ (ลองอัปโหลดรูป QR เองแทน)");
    }
  }

  async function build(): Promise<Uint8Array | null> {
    if (!bytes) return null;
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const target =
      pageMode === "all" ? new Set(pages.map((_, i) => i)) : pageMode === "first" ? new Set([0]) : parsePages(pageSpec, pages.length);
    if (target.size === 0) throw new Error("ไม่ได้เลือกหน้าที่จะใส่");

    for (const el of els) {
      let png: string;
      let w: number;
      let h: number;
      if (el.kind === "text") {
        if (!el.text.trim()) continue;
        const t = textToPng(el.text, el.color, el.fontSize, el.bold);
        png = t.dataUrl; w = t.w; h = t.h;
      } else if (el.kind === "qr") {
        if (!el.text.trim()) continue;
        png = await QRCode.toDataURL(el.text, { margin: 1, width: 600, errorCorrectionLevel: "M" });
        w = el.width; h = el.width;
      } else {
        if (!el.img) continue;
        const r = await toPngDataUrl(el.img);
        png = r.dataUrl; w = el.width; h = el.width * r.ratio;
      }
      const emb = await doc.embedPng(dataUrlToBytes(png));
      const th = (el.rotate * Math.PI) / 180;
      pages.forEach((page, i) => {
        if (!target.has(i)) return;
        const { width: pw, height: ph } = page.getSize();
        const x = el.anchor[1] === "l" ? 0 : el.anchor[1] === "c" ? (pw - w) / 2 : pw - w;
        const y = el.anchor[0] === "b" ? 0 : el.anchor[0] === "m" ? (ph - h) / 2 : ph - h;
        const cx = x + el.dx + w / 2;
        const cy = y + el.dy + h / 2;
        // pdf-lib หมุนรอบมุมซ้ายล่าง → คำนวณให้หมุนรอบกึ่งกลางรูป
        const x0 = cx - ((w / 2) * Math.cos(th) - (h / 2) * Math.sin(th));
        const y0 = cy - ((w / 2) * Math.sin(th) + (h / 2) * Math.cos(th));
        page.drawImage(emb, { x: x0, y: y0, width: w, height: h, opacity: el.opacity / 100, rotate: degrees(el.rotate) });
      });
    }
    return await doc.save();
  }

  async function makePreview() {
    setBusy(true);
    setMsg(null);
    try {
      const out = await build();
      if (!out) return;
      setResultBytes(out);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" })));
    } catch (err: any) {
      setMsg(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!resultBytes) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([resultBytes as BlobPart], { type: "application/pdf" }));
    a.download = fileName.replace(/\.pdf$/i, "") + "_ลายน้ำ.pdf";
    a.click();
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ใส่ลายน้ำ / QR ลงไฟล์ PDF</h1>
      <p className="mb-4 text-sm text-gray-500">
        ใช้กับใบปะหน้าพัสดุหรือ PDF อื่นๆ — ใส่ข้อความ รูป หรือ QR ลงทุกหน้า (หรือเฉพาะบางหน้า) ทำในเครื่องของคุณ ไฟล์ไม่ถูกอัปโหลดไปที่ไหน
      </p>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-5 text-center text-sm text-gray-500 hover:bg-gray-50">
              <span className="text-2xl">📄</span>
              <span className="mt-1 font-medium">{fileName ? `${fileName} (${pageCount} หน้า)` : "เลือกไฟล์ PDF"}</span>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={onPickPdf} className="hidden" />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-600">ใส่ในหน้า:</span>
              <select value={pageMode} onChange={(e) => setPageMode(e.target.value as any)} className="rounded-lg border px-2 py-1">
                <option value="all">ทุกหน้า</option>
                <option value="first">หน้าแรกเท่านั้น</option>
                <option value="range">ระบุหน้า</option>
              </select>
              {pageMode === "range" && (
                <input value={pageSpec} onChange={(e) => setPageSpec(e.target.value)} placeholder="เช่น 1-3,5" className="w-28 rounded-lg border px-2 py-1" />
              )}
            </div>
          </div>

          {els.map((el, idx) => (
            <div key={el.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  {idx + 1}. {el.kind === "text" ? "ข้อความ" : el.kind === "qr" ? "QR จากข้อความ/ลิงก์" : "รูป / QR (อัปโหลด)"}
                </span>
                <button onClick={() => setEls((p) => p.filter((x) => x.id !== el.id))} className="text-sm text-red-500">ลบ</button>
              </div>

              {el.kind === "text" && (
                <>
                  <textarea
                    value={el.text} rows={2}
                    onChange={(e) => patch(el.id, { text: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="ข้อความ (ขึ้นบรรทัดใหม่ได้)"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                    <label>สี <input type="color" value={el.color} onChange={(e) => patch(el.id, { color: e.target.value })} className="ml-1 h-6 w-8 align-middle" /></label>
                    <label>ขนาด <input type="number" min={4} max={80} value={el.fontSize} onChange={(e) => patch(el.id, { fontSize: Number(e.target.value) || 12 })} className="ml-1 w-16 rounded border px-1 py-0.5" /></label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={el.bold} onChange={(e) => patch(el.id, { bold: e.target.checked })} /> ตัวหนา</label>
                  </div>
                </>
              )}
              {el.kind === "qr" && (
                <input
                  value={el.text} onChange={(e) => patch(el.id, { text: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="ลิงก์ร้าน / LINE / เบอร์โทร / ข้อความ"
                />
              )}
              {el.kind !== "text" && (
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  ความกว้าง
                  <input type="range" min={20} max={200} value={el.width} onChange={(e) => patch(el.id, { width: Number(e.target.value) })} className="flex-1" />
                  <span className="w-10 text-right">{el.width}</span>
                </label>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <label className="flex items-center gap-1">โปร่งใส
                  <input type="range" min={5} max={100} value={el.opacity} onChange={(e) => patch(el.id, { opacity: Number(e.target.value) })} className="w-24" />
                  <span>{el.opacity}%</span>
                </label>
                <label>หมุน <input type="number" min={-180} max={180} value={el.rotate} onChange={(e) => patch(el.id, { rotate: Number(e.target.value) || 0 })} className="ml-1 w-16 rounded border px-1 py-0.5" />°</label>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="grid grid-cols-3 gap-0.5">
                  {ANCHORS.map((a) => (
                    <button
                      key={a.v} type="button" onClick={() => patch(el.id, { anchor: a.v })}
                      className={`h-7 w-7 rounded text-xs ${el.anchor === a.v ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >{a.label}</button>
                  ))}
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <label className="flex items-center gap-1">ขยับขวา <input type="number" value={el.dx} onChange={(e) => patch(el.id, { dx: Number(e.target.value) || 0 })} className="w-16 rounded border px-1 py-0.5" /></label>
                  <label className="flex items-center gap-1">ขยับขึ้น <input type="number" value={el.dy} onChange={(e) => patch(el.id, { dy: Number(e.target.value) || 0 })} className="w-16 rounded border px-1 py-0.5" /></label>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEls((p) => [...p, newEl("text")])} className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50">＋ ข้อความ</button>
            <button
              onClick={() => setEls((p) => [...p, newEl("text", { text: "สมัครสมาชิกวันนี้ รับสิทธิ์พิเศษ\nติดต่อร้าน: LINE @xxxx  โทร 08x-xxx-xxxx", fontSize: 8, bold: false, anchor: "bc", dy: 4, opacity: 80 })])}
              className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >＋ ตัวอย่างโฆษณาสมัครสมาชิก</button>
            <button onClick={() => setEls((p) => [...p, newEl("qr", { text: "https://", anchor: "br", dx: -6, dy: 6 })])} className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50">＋ QR จากลิงก์/ข้อความ</button>
            <label className="cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
              ＋ รูป / QR ที่มี
              <input ref={imgRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
            </label>
            {isAdmin && (
              <button onClick={saveShopTemplate} className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100">
                💾 บันทึกเป็นลายน้ำประจำร้าน
              </button>
            )}
            {Array.isArray(shopTemplate) && shopTemplate.length > 0 && (
              <button onClick={loadShopTemplate} className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50">↺ ใช้ลายน้ำประจำร้าน</button>
            )}
            {receiptQrUrl && (
              <button onClick={addShopQr} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-800 hover:bg-blue-100">＋ QR ร้านจากตั้งค่า</button>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={makePreview} disabled={!bytes || busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >{busy ? "กำลังสร้าง..." : "👁️ ดูตัวอย่าง"}</button>
            <button
              onClick={download} disabled={!resultBytes}
              className="rounded-lg border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >⬇️ ดาวน์โหลด PDF</button>
            {msg && <span className={`text-sm ${msg.startsWith("✅") ? "text-emerald-700" : "text-red-600"}`}>{msg}</span>}
          </div>
          {previewUrl ? (
            <iframe src={previewUrl} title="ตัวอย่าง PDF" className="h-[75vh] w-full rounded-2xl border bg-white" />
          ) : (
            <div className="flex h-[40vh] items-center justify-center rounded-2xl border-2 border-dashed text-sm text-gray-400">
              เลือกไฟล์ PDF แล้วกด "ดูตัวอย่าง"
            </div>
          )}
          <p className="mt-2 text-xs text-gray-400">
            หมายเหตุ: ข้อความ/รูปจะวางทับบนหน้าเดิม ถ้าอยากไม่ให้บังข้อมูลบนใบปะหน้า ให้เลือกตำแหน่งที่ว่างและปรับความโปร่งใส
            หลังดาวน์โหลดควรเปิดดูอีกครั้งก่อนปริ้นท์ และตรวจว่าบาร์โค้ดของขนส่งยังสแกนได้
          </p>
        </div>
      </div>
    </div>
  );
}
