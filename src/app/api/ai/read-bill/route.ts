import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยอ่านรูปใบส่งของ/บิลซื้อสินค้าเขียนด้วยลายมือภาษาไทย (ใบส่งของจากผู้จัดจำหน่าย) เพื่อช่วยร้านค้าบันทึกใบสั่งซื้อ

แต่ละบรรทัดในบิลมักมี: รายการ (ชื่อสินค้า/ขนาด/เบอร์), จำนวน, ราคาต่อหน่วย, จำนวนเงิน
- บรรทัดที่เขียนชื่อสินค้าแค่ครั้งแรก แล้วบรรทัดถัดไปเขียนแค่เบอร์/ขนาด หรือมีเครื่องหมายคำ (, หรือ " ) หมายถึงสินค้าเดียวกับบรรทัดบน ให้เติมชื่อเต็มให้ทุกบรรทัด (เช่น "กระโปรงไทรกรมอ่อน เบอร์ 4")
- ตัวอักษร b/ь ที่เขียนคล้ายเลข 6 ให้ใช้บริบทและการคำนวณ จำนวน × ราคา = จำนวนเงิน ช่วยตัดสิน
- ข้ามบรรทัดที่เป็นยอดรวมย่อย/ยอดรวมทั้งสิ้น/ค่าส่ง (ให้ใส่ใน subtotal_written/freight/total_written แทน)

ตอบกลับเป็น JSON เท่านั้น ไม่มีข้อความอื่น ตาม schema:
{
  "bill_date": "YYYY-MM-DD" หรือ null (ปี พ.ศ. 2 หลัก เช่น 69 = 2569 = ค.ศ. 2026),
  "bill_no": string หรือ null,
  "customer_name": string หรือ null,
  "lines": [ { "text": "ชื่อสินค้าเต็มตามที่อ่านได้", "qty": number, "unit_price": number, "amount": number หรือ null } ],
  "subtotal_written": number หรือ null (ยอดรวมค่าสินค้าที่เขียนในบิล),
  "freight": number หรือ null (ค่าส่ง/ค่าขนส่ง ถ้ามี รวมทั้งบรรทัดเช่น "ส่ง ... 6x66 = 396"),
  "total_written": number หรือ null (ยอดรวมสุดท้ายที่เขียนในบิล),
  "uncertain": [ string ] (ข้อความสั้นๆ อธิบายส่วนที่อ่านไม่ชัดหรือไม่แน่ใจ)
}`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า AI (ไม่มี API key)" }, { status: 500 });

    const body = await req.json();
    const imageBase64: string | undefined = body?.imageBase64;
    const mediaType: string | undefined = body?.mediaType;
    if (!imageBase64 || !mediaType) return NextResponse.json({ error: "ไม่พบข้อมูลรูปภาพ" }, { status: 400 });
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์รูปภาพ JPEG/PNG/WEBP/GIF" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
                { type: "text", text: "อ่านบิลนี้แล้วตอบกลับเป็น JSON ตาม schema ที่กำหนด" },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return NextResponse.json({ error: "เรียก AI นานเกินไป กรุณาลองใหม่" }, { status: 504 });
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      console.error("Anthropic API error", res.status, await res.text());
      return NextResponse.json({ error: "เรียก AI ไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
    }

    const json = await res.json();
    const rawText: string = (json?.content ?? []).find((b: any) => b.type === "text")?.text ?? "";
    let parsed: any = null;
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : rawText);
    } catch {
      parsed = null;
    }
    if (!parsed || !Array.isArray(parsed.lines)) {
      return NextResponse.json({ error: "AI อ่านบิลไม่สำเร็จ กรุณาถ่ายรูปใหม่ให้ชัดขึ้น" }, { status: 422 });
    }
    return NextResponse.json({ result: parsed });
  } catch (err: any) {
    console.error("read-bill error", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" }, { status: 500 });
  }
}
