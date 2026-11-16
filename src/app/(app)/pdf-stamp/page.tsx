import { createClient } from "@/lib/supabase/server";
import PdfStampClient from "./PdfStampClient";

export default async function PdfStampPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const { data: settings } = await supabase
    .from("shop_settings")
    .select("shop_name, receipt_qr_url, pdf_stamp_template")
    .single();
  return (
    <PdfStampClient
      shopName={settings?.shop_name ?? ""}
      receiptQrUrl={settings?.receipt_qr_url ?? null}
      shopTemplate={(settings as any)?.pdf_stamp_template ?? null}
      isAdmin={profile?.role === "admin"}
    />
  );
}
