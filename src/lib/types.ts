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
}

export interface Sale {
  id: string;
  sale_no: string;
  cashier_id: string | null;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export interface CartLine {
  product: Product;
  qty: number;
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
