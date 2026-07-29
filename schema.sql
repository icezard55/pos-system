-- ============================================================
-- POS + Inventory System - Supabase schema
-- Run this whole file once in Supabase SQL editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- PROFILES (users + roles) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'cashier' check (role in ('admin','cashier')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'cashier')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- PRODUCTS ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  unit text not null default 'ชิ้น',
  cost_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  stock_qty numeric(12,2) not null default 0,
  low_stock_threshold numeric(12,2) not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- STOCK MOVEMENTS ----------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  change_qty numeric(12,2) not null,
  reason text not null check (reason in ('import','sale','adjustment','restock','void')),
  ref_id uuid,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- SALES ----------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text unique not null,
  cashier_id uuid references public.profiles(id),
  customer_name text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash','transfer','card')),
  status text not null default 'completed' check (status in ('completed','void')),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  unit_price numeric(12,2) not null,
  qty numeric(12,2) not null,
  line_total numeric(12,2) not null
);

create index if not exists idx_sales_created_at on public.sales(created_at desc);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_stock_movements_product on public.stock_movements(product_id);

-- ============================================================
-- RPC: create_sale
-- Atomically creates a sale + line items, checks & deducts stock.
-- ============================================================
create or replace function public.create_sale(
  p_items jsonb,              -- [{product_id, qty}]
  p_discount numeric default 0,
  p_payment_method text default 'cash',
  p_customer_name text default null
)
returns table (sale_id uuid, sale_no text, total numeric)
language plpgsql
security definer set search_path = public
as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_sale_no text;
  v_item jsonb;
  v_product record;
  v_qty numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_line_total numeric;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนบันทึกการขาย';
  end if;

  v_sale_no := to_char(now(), 'YYYYMMDD') || '-' || substr(v_sale_id::text, 1, 8);

  -- validate stock first
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
    if not found then
      raise exception 'ไม่พบสินค้า (id=%)', v_item->>'product_id';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 then
      raise exception 'จำนวนสินค้าต้องมากกว่า 0';
    end if;
    if v_product.stock_qty < v_qty then
      raise exception 'สต๊อกไม่พอสำหรับสินค้า "%": เหลือ % แต่ขอขาย %', v_product.name, v_product.stock_qty, v_qty;
    end if;
  end loop;

  insert into public.sales (id, sale_no, cashier_id, customer_name, subtotal, discount, total, payment_method)
  values (v_sale_id, v_sale_no, auth.uid(), p_customer_name, 0, coalesce(p_discount,0), 0, coalesce(p_payment_method,'cash'));

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_line_total := v_product.sell_price * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.sale_items (sale_id, product_id, product_name, unit_price, qty, line_total)
    values (v_sale_id, v_product.id, v_product.name, v_product.sell_price, v_qty, v_line_total);

    update public.products set stock_qty = stock_qty - v_qty, updated_at = now() where id = v_product.id;

    insert into public.stock_movements (product_id, change_qty, reason, ref_id, created_by)
    values (v_product.id, -v_qty, 'sale', v_sale_id, auth.uid());
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount,0), 0);
  update public.sales set subtotal = v_subtotal, total = v_total where id = v_sale_id;

  return query select v_sale_id, v_sale_no, v_total;
end;
$$;

-- ============================================================
-- RPC: import_products  (bulk upsert from Excel import)
-- ============================================================
create or replace function public.import_products(p_rows jsonb)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_count integer := 0;
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'admin' then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าสินค้าได้';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.products (sku, name, category, unit, cost_price, sell_price, stock_qty, low_stock_threshold)
    values (
      nullif(v_row->>'sku',''),
      v_row->>'name',
      nullif(v_row->>'category',''),
      coalesce(nullif(v_row->>'unit',''), 'ชิ้น'),
      coalesce((v_row->>'cost_price')::numeric, 0),
      coalesce((v_row->>'sell_price')::numeric, 0),
      coalesce((v_row->>'stock_qty')::numeric, 0),
      coalesce((v_row->>'low_stock_threshold')::numeric, 5)
    )
    on conflict (sku) do update set
      name = excluded.name,
      category = excluded.category,
      unit = excluded.unit,
      cost_price = excluded.cost_price,
      sell_price = excluded.sell_price,
      stock_qty = public.products.stock_qty + excluded.stock_qty,
      low_stock_threshold = excluded.low_stock_threshold,
      updated_at = now()
    where public.products.sku is not null;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles for select
  using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- products: everyone logged in can read; only admin can write
drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated" on public.products for select
  using (auth.role() = 'authenticated');

drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert" on public.products for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update" on public.products for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "products_admin_delete" on public.products;
create policy "products_admin_delete" on public.products for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- stock_movements: admin can read all; inserts happen via security-definer RPCs
drop policy if exists "stock_movements_admin_select" on public.stock_movements;
create policy "stock_movements_admin_select" on public.stock_movements for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- sales: cashier sees own, admin sees all
drop policy if exists "sales_select_own_or_admin" on public.sales;
create policy "sales_select_own_or_admin" on public.sales for select
  using (cashier_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- sale_items: visible if parent sale is visible
drop policy if exists "sale_items_select" on public.sale_items;
create policy "sale_items_select" on public.sale_items for select
  using (exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and (s.cashier_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  ));

-- ============================================================
-- Make the first-ever signed-up user an admin automatically
-- (optional convenience: run manually after your first signup)
-- update public.profiles set role = 'admin' where id = 'PUT-YOUR-USER-UUID-HERE';
-- ============================================================
