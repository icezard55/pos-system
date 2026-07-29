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
