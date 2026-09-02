import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrackClient from "./TrackClient";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order_no?: string; phone?: string }>;
}) {
  const { slug } = await params;
  const { order_no, phone } = await searchParams;
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!shop) notFound();

  return (
    <TrackClient shopId={shop.id as string} initialOrderNo={order_no ?? ""} initialPhone={phone ?? ""} />
  );
}
