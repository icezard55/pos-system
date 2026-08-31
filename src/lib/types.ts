export type Role = "admin" | "cashier";

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string;
  cost_price: number;
  sell_price: number;
  stock_qty: number;
  low_stock_threshold: number;
  is_active: boolean;
  image_url: string | null;
  variant_group: string | null;
  variant_label: string | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  discount: number;
  cost_price: number;
}

export type SaleChannel = "store" | "shopee" | "lazada" | "tiktok" | "online_store" | "other";

export const SALE_CHANNEL_LABEL: Record<SaleChannel, string> = {
  store: "หน้าร้าน",
  shopee: "Shopee",
  lazada: "Lazada",
  tiktok: "TikTok Shop",
  online_store: "ร้านค้าออนไลน์",
  other: "แพลตฟอร์มอื่น",
};

// channels a cashier can pick manually at POS — online_store is set only via confirm_online_order
export const MANUAL_SALE_CHANNELS: SaleChannel[] = ["store", "shopee", "lazada", "tiktok", "other"];

export interface Sale {
  id: string;
  sale_no: string;
  cashier_id: string | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_tax_id: string | null;
  customer_address: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  shift_id: string | null;
  source: "pos" | "imported";
  channel: SaleChannel;
  platform_name: string | null;
  platform_fee_pct: number | null;
  platform_fee_amount: number;
  payment_status: "unpaid" | "paid";
  received_at: string | null;
  note: string | null;
  discount_code: string | null;
  discount_code_amount: number;
  void_type: VoidType | null;
}

export type VoidType = "cancelled" | "returned";

export const VOID_TYPE_LABEL: Record<VoidType, string> = {
  cancelled: "ยกเลิก",
  returned: "ตีกลับ",
};

// ---- โค้ดส่วนลด (discount codes) ----

export type DiscountType = "percent" | "fixed";

export const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  percent: "เปอร์เซ็นต์ (%)",
  fixed: "จำนวนเงินคงที่ (บาท)",
};

export interface DiscountCode {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_order_amount: number;
  max_uses: number | null;
  used_count: number;
  valid_until: string | null;
  is_active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export const SALE_PAYMENT_STATUS_LABEL: Record<"unpaid" | "paid", string> = {
  unpaid: "รอรับเงิน",
  paid: "ได้รับเงินแล้ว",
};

export interface SalePayment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: number;
}

export type PaymentMethod = "cash" | "transfer" | "card" | "credit";

export interface CartLine {
  product: Product;
  qty: number;
  discount: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  points: number;
  credit_balance: number;
  credit_limit: number;
  note: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
}

export type POPaymentStatus = "unpaid" | "pending_transfer" | "paid";

export interface PurchaseOrder {
  id: string;
  supplier_id: string | null;
  status: "draft" | "received" | "cancelled";
  note: string | null;
  created_by: string | null;
  created_at: string;
  received_by: string | null;
  received_at: string | null;
  payment_status: POPaymentStatus;
  paid_at: string | null;
  po_total: number | null;
  supplier_invoice_no: string | null;
  freight_cost: number;
  payment_note: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string;
  qty: number;
  unit_cost: number;
}

// เจ้าหนี้การค้า (general debts not tied to a purchase order — rent, loans, services, etc.)
export type PayableStatus = POPaymentStatus;

export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  unpaid: "ยังไม่จ่าย",
  pending_transfer: "รอโอน",
  paid: "จ่ายแล้ว",
};

export const PAYABLE_STATUS_BADGE_CLASS: Record<PayableStatus, string> = {
  unpaid: "bg-red-100 text-red-700",
  pending_transfer: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

export interface Payable {
  id: string;
  creditor_name: string;
  amount: number;
  due_date: string | null;
  note: string | null;
  payment_status: PayableStatus;
  paid_at: string | null;
  payment_note: string | null;
  expense_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseCategory =
  | "water"
  | "electricity"
  | "salary"
  | "tax"
  | "fee"
  | "transport"
  | "investment"
  | "damaged_goods"
  | "shipping"
  | "travel"
  | "main_food"
  | "dessert"
  | "platform_fee"
  | "product_shipping"
  | "personal"
  | "other"
  | "debt_payment"
  | "vehicle_maintenance"
  | "building_maintenance"
  | "paper_supplies";

export type RecurringExpenseCategory = Exclude<ExpenseCategory, "shipping" | "platform_fee" | "debt_payment">;

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  water: "ค่าน้ำ",
  electricity: "ค่าไฟ",
  salary: "เงินเดือน",
  tax: "ภาษี",
  fee: "ค่าธรรมเนียม",
  transport: "ค่าเดินทาง",
  investment: "เงินลงทุน/ออม",
  damaged_goods: "สินค้าเสียหาย",
  shipping: "ค่าขนส่ง (รับสินค้าเข้า)",
  travel: "ท่องเที่ยว",
  main_food: "อาหารหลัก",
  dessert: "ของหวาน",
  platform_fee: "ค่าธรรมเนียมแพลตฟอร์ม",
  product_shipping: "ขนส่งสินค้า",
  personal: "รายจ่ายส่วนตัว",
  other: "อื่นๆ",
  debt_payment: "ชำระหนี้เจ้าหนี้การค้า",
  vehicle_maintenance: "ค่าซ่อมบำรุงรถ",
  building_maintenance: "ค่าซ่อมบำรุงบ้าน",
  paper_supplies: "กระดาษสิ้นเปลือง",
};

export const RECURRING_EXPENSE_CATEGORIES: RecurringExpenseCategory[] = [
  "water",
  "electricity",
  "salary",
  "tax",
  "fee",
  "transport",
  "investment",
  "damaged_goods",
  "travel",
  "main_food",
  "dessert",
  "product_shipping",
  "personal",
  "other",
  "vehicle_maintenance",
  "building_maintenance",
  "paper_supplies",
];

export type ExpenseSource = "manual" | "po_freight" | "recurring" | "platform_fee" | "payable";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
  note: string | null;
  source: ExpenseSource;
  po_id: string | null;
  recurring_id: string | null;
  sale_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RecurringExpense {
  id: string;
  category: RecurringExpenseCategory;
  amount: number;
  day_of_month: number;
  months: number[];
  note: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  last_generated_month: string | null;
}

export const THAI_MONTH_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export interface ShopSettings {
  id: boolean;
  shop_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  low_stock_webhook_url: string | null;
  baht_per_point: number;
  show_vat_on_receipt: boolean;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface CashShift {
  id: string;
  opened_by: string | null;
  opened_at: string;
  opening_cash: number;
  closed_by: string | null;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  note: string | null;
  status: "open" | "closed";
}

export const VAT_RATE = 0.07;

export function splitVat(totalIncludingVat: number) {
  const base = totalIncludingVat / (1 + VAT_RATE);
  const vat = totalIncludingVat - base;
  return { base, vat };
}

// ---- ร้านค้าออนไลน์ (storefront) ----

export interface StorefrontProduct {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  sell_price: number;
  stock_qty: number;
  image_url: string | null;
  variant_group: string | null;
  variant_label: string | null;
}

export type OnlineOrderDeliveryMethod = "delivery" | "pickup";
export type OnlineOrderPaymentMethod = "bank_transfer" | "cod" | "gateway";
export type OnlineOrderStatus =
  | "pending_payment"
  | "pending_confirmation"
  | "confirmed"
  | "packed"
  | "shipped"
  | "completed"
  | "cancelled";

export const ONLINE_ORDER_STATUS_LABEL: Record<OnlineOrderStatus, string> = {
  pending_payment: "รอชำระเงิน",
  pending_confirmation: "รอยืนยันออเดอร์",
  confirmed: "ยืนยันแล้ว",
  packed: "แพ็คสินค้าแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

export const ONLINE_ORDER_DELIVERY_LABEL: Record<OnlineOrderDeliveryMethod, string> = {
  delivery: "จัดส่ง",
  pickup: "รับที่ร้าน",
};

export const ONLINE_ORDER_PAYMENT_LABEL: Record<OnlineOrderPaymentMethod, string> = {
  bank_transfer: "โอนเงิน + แนบสลิป",
  cod: "เก็บเงินปลายทาง/รับที่ร้าน",
  gateway: "ชำระผ่านเกตเวย์ออนไลน์ (เร็วๆ นี้)",
};

export interface OnlineOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  qty: number;
  line_total: number;
}

export interface OnlineOrder {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string | null;
  delivery_method: OnlineOrderDeliveryMethod;
  payment_method: OnlineOrderPaymentMethod;
  payment_slip_url: string | null;
  status: OnlineOrderStatus;
  subtotal: number;
  discount: number;
  discount_code: string | null;
  discount_code_amount: number;
  total: number;
  note: string | null;
  sale_id: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  online_order_items?: OnlineOrderItem[];
}

export interface CartItem {
  product_id: string;
  name: string;
  unit: string;
  sell_price: number;
  stock_qty: number;
  qty: number;
}
