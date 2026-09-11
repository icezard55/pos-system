import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// pos-saas is multi-tenant: each shop's public storefront lives at /shop/[slug]
// (looked up against the public.shops table, e.g. /shop/apollo for ร้านอพอลโล่).
// Each shop's Railway service sets NEXT_PUBLIC_SHOP_SLUG to its own slug so the
// plain /shop link customers/QR codes already use (from before the multi-tenant
// split) keeps working by redirecting straight to that shop's storefront.
export default function ShopIndexPage() {
  const slug = process.env.NEXT_PUBLIC_SHOP_SLUG;
  if (slug) redirect(`/shop/${slug}`);

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
      <p className="text-sm text-gray-600">
        กรุณาใช้ลิงก์ร้านค้าของท่าน เช่น <span className="font-mono">/shop/ชื่อร้าน</span>
      </p>
    </div>
  );
}
