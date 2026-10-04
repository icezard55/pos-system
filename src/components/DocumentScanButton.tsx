"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ถ่ายรูปบิล/เอกสาร (ได้หลายหน้า) -> รวมเป็น PDF ไฟล์เดียว -> เก็บใน Supabase Storage (bucket "documents", แยกโฟลเดอร์ตามร้าน)
// แล้วผูก path ไว้กับใบสั่งซื้อ/รายจ่ายผ่าน RPC set_record_document

type Kind = "po" | "expense";

interface Page {
  id: string;
  dataUrl: string; // JPEG ที่ย่อ/ปรับแล้ว
  w: number;
  h: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    };
    img.src = url;
  });
}

// ย่อรูป (ด้านยาวสุด 2000px) + ถ้าเปิดโหมดเอกสาร: แปลงเป็นโทนขาวดำและเพิ่มความคมชัดให้ตัวหนังสืออ่านง่าย
async function processImage(file: File, docMode: boolean): Promise<Page> {
  const img = await loadImage(file);
  const maxDim = 2000;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > maxDim || h > maxDim) {
    const s = maxDim / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ประมวลผลรูปไม่สำเร็จ");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  if (docMode) {
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    // หาจุดดำ/ขาว (percentile 2% / 92%) แล้วยืดคอนทราสต์ — ลบเงาเทาๆ ของกระดาษ
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      hist[y | 0]++;
    }
    const total = w * h;
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.08) { hi = v; break; } }
    if (hi - lo < 40) { lo = Math.max(0, lo - 20); hi = Math.min(255, hi + 20); }
    const range = hi - lo || 1;
    for (let i = 0; i < d.length; i += 4) {
      const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      let v = ((y - lo) / range) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      // เส้นโค้งเล็กน้อยให้ตัวหนังสือเข้มขึ้น
      v = 255 * Math.pow(v / 255, 1.25);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(im, 0, 0);
  }
  return { id: Math.random().toString(36).slice(2), dataUrl: canvas.toDataURL("image/jpeg", 0.8), w, h };
}

async function buildPdf(pages: Page[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const A4W = 210, A4H = 297, M = 8;
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const p of pages) {
    const landscape = p.w > p.h;
    const pw = landscape ? A4H : A4W;
    const ph = landscape ? A4W : A4H;
    if (!pdf) pdf = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait", compress: true });
    else pdf.addPage("a4", landscape ? "landscape" : "portrait");
    const s = Math.min((pw - M * 2) / p.w, (ph - M * 2) / p.h);
    const iw = p.w * s, ih = p.h * s;
    pdf.addImage(p.dataUrl, "JPEG", (pw - iw) / 2, (ph - ih) / 2, iw, ih, undefined, "FAST");
  }
  if (!pdf) throw new Error("ยังไม่มีหน้าเอกสาร");
  return pdf.output("blob");
}

export default function DocumentScanButton({
  kind,
  recordId,
  shopId,
  documentPath,
  onChanged,
}: {
  kind: Kind;
  recordId: string;
  shopId: string;
  documentPath: string | null;
  onChanged: (newPath: string | null) => void;
}) {
  const supabase = createClient();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [docMode, setDocMode] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setProcessing(true);
    setErr(null);
    try {
      const out: Page[] = [];
      for (const f of files) out.push(await processImage(f, docMode));
      setPages((prev) => [...prev, ...out]);
    } catch (ex: any) {
      setErr(ex.message ?? "ประมวลผลรูปไม่สำเร็จ");
    } finally {
      setProcessing(false);
    }
  }

  function move(idx: number, dir: -1 | 1) {
    setPages((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    if (pages.length === 0 || !shopId) return;
    setSaving(true);
    setErr(null);
    try {
      const blob = await buildPdf(pages);
      const path = `${shopId}/${kind}/${recordId}/${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { error: rpcErr } = await supabase.rpc("set_record_document", { p_kind: kind, p_id: recordId, p_path: path });
      if (rpcErr) {
        await supabase.storage.from("documents").remove([path]);
        throw rpcErr;
      }
      if (documentPath && documentPath !== path) await supabase.storage.from("documents").remove([documentPath]);
      setPages([]);
      setOpen(false);
      onChanged(path);
    } catch (ex: any) {
      setErr(ex.message ?? "บันทึก PDF ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleView() {
    if (!documentPath) return;
    // เปิดหน้าต่างไว้ก่อน (ภายใน user gesture) กัน popup blocker บนมือถือ แล้วค่อยใส่ลิงก์ทีหลัง
    const win = window.open("", "_blank");
    setViewing(true);
    try {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(documentPath, 600);
      if (error || !data?.signedUrl) throw error ?? new Error("เปิดไฟล์ไม่สำเร็จ");
      if (win) win.location.href = data.signedUrl;
      else window.location.href = data.signedUrl;
    } catch (ex: any) {
      win?.close();
      alert(ex.message ?? "เปิดไฟล์ไม่สำเร็จ");
    } finally {
      setViewing(false);
    }
  }

  async function handleDownload() {
    if (!documentPath) return;
    setViewing(true);
    try {
      const { data, error } = await supabase.storage.from("documents").download(documentPath);
      if (error || !data) throw error ?? new Error("ดาวน์โหลดไม่สำเร็จ");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind === "po" ? "ใบสั่งซื้อ" : "รายจ่าย"}-${recordId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (ex: any) {
      alert(ex.message ?? "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setViewing(false);
    }
  }

  async function handleDelete() {
    if (!documentPath) return;
    if (!confirm("ลบไฟล์ PDF บิลที่แนบไว้?")) return;
    setViewing(true);
    try {
      const { error } = await supabase.rpc("set_record_document", { p_kind: kind, p_id: recordId, p_path: null });
      if (error) throw error;
      await supabase.storage.from("documents").remove([documentPath]);
      onChanged(null);
    } catch (ex: any) {
      alert(ex.message ?? "ลบไม่สำเร็จ");
    } finally {
      setViewing(false);
    }
  }


  return (
    <>
      <span className={`inline-flex flex-wrap items-center gap-2 text-xs`}>
        {documentPath ? (
          <>
            <button type="button" onClick={handleView} disabled={viewing} className="rounded-lg bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:underline disabled:opacity-50">
              📄 ดูบิล PDF
            </button>
            <button type="button" onClick={handleDownload} disabled={viewing} className="text-gray-500 hover:text-brand hover:underline disabled:opacity-50">
              ดาวน์โหลด
            </button>
            <button type="button" onClick={() => { setOpen(true); setErr(null); }} className="text-gray-500 hover:text-brand hover:underline">
              ถ่ายใหม่
            </button>
            <button type="button" onClick={handleDelete} disabled={viewing} className="text-red-400 hover:text-red-600 hover:underline disabled:opacity-50">
              ลบ
            </button>
          </>
        ) : (
          <button type="button" onClick={() => { setOpen(true); setErr(null); }} className="text-gray-500 hover:text-brand hover:underline">
            📷 ถ่ายบิลเป็น PDF
          </button>
        )}
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !saving && setOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 text-left sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">ถ่ายบิลแล้วแปลงเป็น PDF</h3>
              <button type="button" onClick={() => !saving && setOpen(false)} className="text-2xl leading-none text-gray-400">×</button>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              ถ่ายได้หลายหน้า ระบบจะรวมเป็น PDF ไฟล์เดียวและเก็บไว้กับ{kind === "po" ? "ใบสั่งซื้อ" : "รายการรายจ่าย"}นี้
              {documentPath ? " (จะแทนที่ไฟล์เดิม)" : ""}
            </p>

            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} />
            <input ref={pickRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => camRef.current?.click()} disabled={processing || saving} className="rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">
                📷 {pages.length ? "ถ่ายหน้าถัดไป" : "ถ่ายรูปบิล"}
              </button>
              <button type="button" onClick={() => pickRef.current?.click()} disabled={processing || saving} className="rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 disabled:opacity-50">
                🖼️ เลือกจากรูปในเครื่อง
              </button>
            </div>

            <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={docMode} onChange={(e) => setDocMode(e.target.checked)} />
              ปรับเป็นโทนเอกสาร (ขาวดำ คมชัด อ่านง่าย)
            </label>

            {processing && <p className="mb-2 text-sm text-gray-500">กำลังประมวลผลรูป...</p>}

            {pages.length > 0 ? (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {pages.map((p, i) => (
                  <div key={p.id} className="relative overflow-hidden rounded-lg border bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={`หน้า ${i + 1}`} className="h-32 w-full object-contain" />
                    <div className="flex items-center justify-between bg-white/90 px-1.5 py-1 text-[11px]">
                      <span className="font-medium">หน้า {i + 1}</span>
                      <span className="flex gap-1.5">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30">◀</button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === pages.length - 1} className="disabled:opacity-30">▶</button>
                        <button type="button" onClick={() => setPages((prev) => prev.filter((x) => x.id !== p.id))} className="text-red-500">✕</button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !processing && <div className="mb-4 rounded-xl border-2 border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">ยังไม่มีรูป — กด "ถ่ายรูปบิล" เพื่อเริ่ม</div>
            )}

            {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

            <button
              type="button"
              onClick={handleSave}
              disabled={pages.length === 0 || saving || processing}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "กำลังสร้าง PDF และบันทึก..." : `บันทึกเป็น PDF (${pages.length} หน้า)`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
