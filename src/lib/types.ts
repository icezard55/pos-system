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
}

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
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string;
  qty: number;
  unit_cost: number;
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
  | "other";

export type RecurringExpenseCategory = Exclude<ExpenseCategory, "shipping">;

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
  other: "อื่นๆ",
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
  "other",
];

export type ExpenseSource = "manual" | "po_freight" | "recurring";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
  note: string | null;
  source: ExpenseSource;
  po_id: string | null;
  recurring_id: string | null;
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
