import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

interface AiResult {
  result_type: "returned" | "cancelled" | "unclear";
  courier: string | null;
  order_no: string | null;
  tracking_number: string | null;
  phone: string | null;
  confidence: "high" | "medium" | "low";
  raw_text_found: string | null;
}

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยอ่านรูปภาพป้ายพัสดุ/หน้าจอของร้านค้าออนไลน์ในไทย (SPX/Shopee, J&T/TikTok, Flash, Kerry ฯลฯ) เพื่อช่วยพนักงานร้านค้าปลีกระบุว่าพัสดุนี้คือ "ตีกลับ" (ลูกค้าปฏิเสธรับ/ส่งคืน หลังจากส่งไปแล้ว) หรือ "ยกเลิก" (ลูกค้ายกเลิกคำสั่งซื้อก่อนจัดส่ง) หรือดูไม่ออก

สัญญาณที่บ่งบอกว่า "ตีกลับ" (returned): มีตราปั๊ม/ข้อความ "RTS", "Return to Sender", "ตีกลับ", "ส่งคืนภายใน...", มีเลขพัสดุขนส่ง (tracking number) ของ J&T/SPX/Flash/Kerry ปรากฏชัดเจนบนป้ายพัสดุจริง

สัญญาณที่บ่งบอกว่า "ยกเลิก" (cancelled): เป็นภาพหน้าจอแอปแสดงสถานะคำสั่งซื้อว่า "ยกเลิกแล้ว"/"Cancelled" โดยไม่มีป้ายพัสดุขนส่งจริง (เพราะยังไม่เคยจัดส่ง)

จงตอบกลับเป็น JSON เท่านั้น ไม่มีข้อความอื่นใดนอกเหนือจาก JSON object ตาม schema นี้:
{
  "result_type": "returned" | "cancelled" | "unclear",
  "courier": string หรือ null (เช่น "SPX", "J&T Express", "Flash Express", "Kerry"),
  "order_no": string หรือ null (เลข Order ID ของแพลตฟอร์ม เช่น Shopee Order No. ถ้ามีปรากฏในรูป),
  "tracking_number": string หรือ null (เลขพัสดุขนส่งของบริษัทขนส่ง ถ้ามีปรากฏในรูป),
  "phone": string หรือ null (เบอร์โทรลูกค้า ถ้ามีปรากฏในรูป),
  "confidence": "high" | "medium" | "low",
  "raw_text_found": string หรือ null (สรุปข้อความสำคัญทั้งหมดที่อ่านได้จากรูป เพื่อให้พนักงานตรวจสอบเอง)
}

ถ้าอ่านข้อมูลในรูปไม่ชัดเจนหรือไม่ใช่ป้ายพัสดุ/หน้าจอคำสั่งซื้อเลย ให้ตอบ "result_type": "unclear" และ "confidence": "low"`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า AI (ไม่มี API key)" }, { status: 500 });
    }

    const body = await req.json();
    const imageBase64: string | undefined = body?.imageBase64;
    const mediaType: string | undefined = body?.mediaType;
    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ error: "ไม่พบข้อมูลรูปภาพ" }, { status: 400 });
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์รูปภาพ JPEG/PNG/WEBP/GIF" }, { status: 400 });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: "อ่านรูปนี้แล้วตอบกลับเป็น JSON ตาม schema ที่กำหนด",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error", anthropicRes.status, errText);
      return NextResponse.json({ error: "เรียก AI ไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
    }

    const anthropicJson = await anthropicRes.json();
    const textBlock = (anthropicJson?.content ?? []).find((b: any) => b.type === "text");
    const rawText: string = textBlock?.text ?? "";

    let parsed: AiResult | null = null;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : rawText);
    } catch {
      parsed = null;
    }

    if (!parsed || !parsed.result_type) {
      return NextResponse.json({ error: "AI อ่านรูปไม่สำเร็จ กรุณาลองถ่ายใหม่ให้ชัดขึ้น" }, { status: 422 });
    }

    return NextResponse.json({ result: parsed });
  } catch (err: any) {
    console.error("read-return-photo error", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" }, { status: 500 });
  }
}
