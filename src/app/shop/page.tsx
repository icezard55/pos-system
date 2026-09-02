export const dynamic = "force-dynamic";

// pos-saas is multi-tenant: each shop's public storefront lives at /shop/[slug]
// (looked up against the public.shops table, e.g. /shop/apollo for ร้านอพอลโล่).
// There is no single default shop to fall back to here, so a bare /shop with no
// slug just explains that to the visitor instead of guessing which shop to show.
export default function ShopIndexPage() {
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
      <p className="text-sm text-gray-600">
        กรุณาใช้ลิงก์ร้านค้าของท่าน เช่น <span className="font-mono">/shop/ชื่อร้าน</span>
      </p>
    </div>
  );
}
