import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DealsClient, { type StorefrontDeals } from "./DealsClient";

export const dynamic = "force-dynamic";

export default async function DealsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!shop) notFound();
  const { data } = await supabase.rpc("get_storefront_deals", { p_shop_id: shop.id });
  const deals = (data as StorefrontDeals) ?? { codes: [], promotions: [] };
  return <DealsClient slug={slug} deals={deals} />;
}
