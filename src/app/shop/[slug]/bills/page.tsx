import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BillsClient from "./BillsClient";

export const dynamic = "force-dynamic";

export default async function BillsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!shop) notFound();
  return <BillsClient shopId={shop.id as string} slug={slug} />;
}
