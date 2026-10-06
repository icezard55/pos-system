import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReceiptClient from "@/app/receipt/[id]/ReceiptClient";

export const dynamic = "force-dynamic";

// ใบเสร็จสำหรับลูกค้า (เปิดจากหน้า "ค้นหาบิลของฉัน") — ดาวน์โหลด PDF ได้อย่างเดียว ไม่มีปุ่มพิมพ์/ขายต่อ
export default async function CustomerReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ download?: string }>;
}) {
  const { slug, id } = await params;
  const { download } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!shop) notFound();
  const { data } = await supabase.rpc("get_public_receipt", { p_shop_id: shop.id, p_sale_id: id });
  const r = data as any;
  if (!r?.sale) notFound();

  return (
    <ReceiptClient
      sale={r.sale}
      items={r.items ?? []}
      payments={r.payments ?? []}
      shopSettings={r.settings ?? null}
      customerMode
      backHref={`/shop/${slug}/bills`}
      autoDownload={download === "1"}
    />
  );
}
