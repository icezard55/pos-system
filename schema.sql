-- ============================================================================
-- POS + Inventory Management — Full Database Schema
-- Run this once in Supabase SQL Editor on a fresh project.
-- This reflects the CURRENT, complete schema including all feature additions:
-- void sale (with re-auth on the client + audit log), manual stock
-- adjustment, cash shift reconciliation, admin user management RPC,
-- per-line discounts, split payments, full tax invoice fields, customers /
-- loyalty points / credit sales, suppliers + purchase orders, low-stock
-- webhook notifications (pg_cron + pg_net), profit reporting, audit log,
-- and the RLS-recursion-safe is_admin() helper.
-- ============================================================================

-- extensions used for scheduled low-stock webhook notifications
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'cashier' check (role in ('admin', 'cashier')),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  unit text not null default 'ชิ้น',
  cost_price numeric not null default 0,
  sell_price numeric not null default 0,
  stock_qty numeric not null default 0,
  low_stock_threshold numeric not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  opening_cash numeric not null default 0,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  expected_cash numeric,
  counted_cash numeric,
  difference numeric,
  note text,
  status text not null default 'open' check (status in ('open', 'closed'))
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  points integer not null default 0,
  credit_balance numeric not null default 0,
  credit_limit numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index customers_phone_idx on public.customers (phone);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text not null unique,
  cashier_id uuid references public.profiles(id),
  customer_name text,
  customer_id uuid references public.customers(id),
  customer_tax_id text,
  customer_address text,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card', 'credit', 'split')),
  status text not null default 'completed' check (status in ('completed', 'void')),
  shift_id uuid references public.cash_shifts(id),
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  unit_price numeric not null,
  qty numeric not null,
  line_total numeric not null,
  discount numeric not null default 0,
  cost_price numeric not null default 0
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash', 'transfer', 'card', 'credit')),
  amount numeric not null check (amount > 0)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  change_qty numeric not null,
  reason text not null check (reason in ('import', 'sale', 'adjustment', 'restock', 'void')),
  ref_id uuid,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  note text,
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id),
  status text not null default 'draft' check (status in ('draft', 'received', 'cancelled')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  received_by uuid references public.profiles(id),
  received_at timestamptz
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric not null check (qty > 0),
  unit_cost numeric not null default 0
);

create table public.shop_settings (
  id boolean primary key default true check (id),
  shop_name text not null default 'ร้านค้าของฉัน',
  tax_id text,
  address text,
  phone text,
  low_stock_webhook_url text,
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id) values (true);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- New-user trigger: auto-create a profile (default role: cashier) on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- is_admin(): SECURITY DEFINER helper used by every RLS policy that needs an
-- "is this user an admin" check. This bypasses RLS internally, which avoids
-- the infinite-recursion error you get from a self-referencing policy on
-- profiles (e.g. "select ... from profiles where ... role = 'admin'" inside
-- a policy defined ON profiles itself).
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.cash_shifts enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.shop_settings enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select_own_or_admin on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy profiles_admin_update_any on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

create policy products_select_authenticated on public.products
  for select using (auth.role() = 'authenticated');

create policy products_admin_insert on public.products
  for insert with check (public.is_admin());

create policy products_admin_update on public.products
  for update using (public.is_admin());

create policy products_admin_delete on public.products
  for delete using (public.is_admin());

create policy cash_shifts_select on public.cash_shifts
  for select using (opened_by = auth.uid() or public.is_admin());

create policy sales_select_own_or_admin on public.sales
  for select using (cashier_id = auth.uid() or public.is_admin());

create policy sale_items_select on public.sale_items
  for select using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and (s.cashier_id = auth.uid() or public.is_admin())
    )
  );

create policy sale_payments_select on public.sale_payments
  for select using (
    exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id
        and (s.cashier_id = auth.uid() or public.is_admin())
    )
  );

create policy stock_movements_admin_select on public.stock_movements
  for select using (public.is_admin());

-- customers: any authenticated staff can read/search (needed at POS) and
-- create new customers at the counter; only admins can change credit limits.
create policy customers_select on public.customers
  for select using (auth.role() = 'authenticated');
create policy customers_insert_authenticated on public.customers
  for insert with check (auth.role() = 'authenticated');
create policy customers_admin_update on public.customers
  for update using (public.is_admin()) with check (public.is_admin());

create policy suppliers_admin_select on public.suppliers
  for select using (public.is_admin());
create policy suppliers_admin_insert on public.suppliers
  for insert with check (public.is_admin());
create policy suppliers_admin_update on public.suppliers
  for update using (public.is_admin());
create policy suppliers_admin_delete on public.suppliers
  for delete using (public.is_admin());

create policy po_admin_select on public.purchase_orders
  for select using (public.is_admin());
create policy po_items_admin_select on public.purchase_order_items
  for select using (public.is_admin());

create policy shop_settings_select on public.shop_settings
  for select using (auth.role() = 'authenticated');
create policy shop_settings_admin_update on public.shop_settings
  for update using (public.is_admin()) with check (public.is_admin());

create policy audit_log_admin_select on public.audit_log
  for select using (public.is_admin());

-- Note: sales, sale_items, sale_payments, cash_shifts, stock_movements,
-- purchase_orders/items, and audit_log have no direct client-side
-- INSERT/UPDATE/DELETE policies — all writes to these tables go exclusively
-- through the SECURITY DEFINER RPC functions below, which run with elevated
-- privileges and enforce their own business rules (stock checks, admin-only
-- actions, ownership checks, credit limits, etc).

-- ---------------------------------------------------------------------------
-- RPC: create_sale — records a sale with per-line discounts, split
-- payments (cash/transfer/card/credit), an optional linked customer (loyalty
-- points + credit sales), and optional tax-invoice fields.
-- ---------------------------------------------------------------------------

create or replace function public.create_sale(
  p_items jsonb,           -- [{product_id, qty, discount}]
  p_payments jsonb,        -- [{method, amount}]
  p_bill_discount numeric default 0,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_tax_id text default null,
  p_customer_address text default null
)
returns table(sale_id uuid, sale_no text, total numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_sale_no text;
  v_item jsonb;
  v_payment jsonb;
  v_product record;
  v_qty numeric;
  v_line_discount numeric;
  v_subtotal numeric := 0;
  v_line_discounts_total numeric := 0;
  v_total numeric := 0;
  v_line_total numeric;
  v_shift_id uuid;
  v_payments_sum numeric := 0;
  v_credit_amount numeric := 0;
  v_payment_method_count integer;
  v_summary_method text;
  v_customer record;
  v_points integer;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนบันทึกการขาย';
  end if;

  if p_customer_id is not null then
    select * into v_customer from public.customers where id = p_customer_id;
    if not found then
      raise exception 'ไม่พบลูกค้า';
    end if;
  end if;

  select id into v_shift_id from public.cash_shifts
    where opened_by = auth.uid() and status = 'open'
    limit 1;

  v_sale_no := to_char(now(), 'YYYYMMDD') || '-' || substr(v_sale_id::text, 1, 8);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
    if not found then
      raise exception 'ไม่พบสินค้า (id=%)', v_item->>'product_id';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    v_line_discount := coalesce((v_item->>'discount')::numeric, 0);
    if v_qty <= 0 then
      raise exception 'จำนวนสินค้าต้องมากกว่า 0';
    end if;
    if v_product.stock_qty < v_qty then
      raise exception 'สต๊อกไม่พอสำหรับสินค้า "%": เหลือ % แต่ขอขาย %', v_product.name, v_product.stock_qty, v_qty;
    end if;
    v_subtotal := v_subtotal + (v_product.sell_price * v_qty);
    v_line_discounts_total := v_line_discounts_total + v_line_discount;
  end loop;

  v_total := greatest(v_subtotal - v_line_discounts_total - coalesce(p_bill_discount, 0), 0);

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_payments_sum := v_payments_sum + (v_payment->>'amount')::numeric;
    if (v_payment->>'method') = 'credit' then
      v_credit_amount := v_credit_amount + (v_payment->>'amount')::numeric;
    end if;
  end loop;

  if abs(v_payments_sum - v_total) > 0.01 then
    raise exception 'ยอดชำระ (%) ไม่เท่ากับยอดสุทธิ (%)', v_payments_sum, v_total;
  end if;

  if v_credit_amount > 0 then
    if p_customer_id is null then
      raise exception 'การขายเชื่อต้องระบุลูกค้า';
    end if;
    if v_customer.credit_limit = 0 then
      raise exception 'ลูกค้ารายนี้ยังไม่ได้รับอนุมัติวงเงินเชื่อ';
    end if;
    if v_customer.credit_balance + v_credit_amount > v_customer.credit_limit then
      raise exception 'วงเงินเชื่อของลูกค้าไม่พอ (คงเหลือวงเงิน % บาท)', v_customer.credit_limit - v_customer.credit_balance;
    end if;
  end if;

  select count(distinct (p->>'method')) into v_payment_method_count from jsonb_array_elements(p_payments) p;
  if v_payment_method_count > 1 then
    v_summary_method := 'split';
  else
    select p->>'method' into v_summary_method from jsonb_array_elements(p_payments) p limit 1;
  end if;

  insert into public.sales (
    id, sale_no, cashier_id, customer_name, customer_id, customer_tax_id, customer_address,
    subtotal, discount, total, payment_method, shift_id
  )
  values (
    v_sale_id, v_sale_no, auth.uid(), p_customer_name, p_customer_id, p_customer_tax_id, p_customer_address,
    v_subtotal, v_line_discounts_total + coalesce(p_bill_discount, 0), v_total, v_summary_method, v_shift_id
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_line_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_line_total := (v_product.sell_price * v_qty) - v_line_discount;

    insert into public.sale_items (sale_id, product_id, product_name, unit_price, qty, line_total, discount, cost_price)
    values (v_sale_id, v_product.id, v_product.name, v_product.sell_price, v_qty, v_line_total, v_line_discount, v_product.cost_price);

    update public.products set stock_qty = stock_qty - v_qty, updated_at = now() where id = v_product.id;

    insert into public.stock_movements (product_id, change_qty, reason, ref_id, created_by)
    values (v_product.id, -v_qty, 'sale', v_sale_id, auth.uid());
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.sale_payments (sale_id, method, amount)
    values (v_sale_id, v_payment->>'method', (v_payment->>'amount')::numeric);
  end loop;

  if p_customer_id is not null then
    v_points := floor(v_total / 100); -- 1 point per 100 baht spent
    update public.customers
    set points = points + v_points,
        credit_balance = credit_balance + v_credit_amount
    where id = p_customer_id;
  end if;

  return query select v_sale_id, v_sale_no, v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: void_sale — admin-only, cancels a sale, restores stock, reverses any
-- credit taken against a customer, and writes an audit_log entry.
-- (The client additionally requires the admin to re-enter their password
-- before calling this, as a second confirmation step for an irreversible action.)
-- ---------------------------------------------------------------------------

create or replace function public.void_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item record;
  v_sale record;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยกเลิกบิลได้';
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'ไม่พบรายการขายนี้';
  end if;
  if v_sale.status = 'void' then
    raise exception 'บิลนี้ถูกยกเลิกไปแล้ว';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id
  loop
    update public.products set stock_qty = stock_qty + v_item.qty, updated_at = now()
      where id = v_item.product_id;

    insert into public.stock_movements (product_id, change_qty, reason, ref_id, created_by, note)
    values (v_item.product_id, v_item.qty, 'void', p_sale_id, auth.uid(), 'ยกเลิกบิล ' || v_sale.sale_no);
  end loop;

  if v_sale.customer_id is not null then
    update public.customers
    set credit_balance = greatest(credit_balance - coalesce((
      select sum(amount) from public.sale_payments where sale_id = p_sale_id and method = 'credit'
    ), 0), 0)
    where id = v_sale.customer_id;
  end if;

  update public.sales set status = 'void' where id = p_sale_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (auth.uid(), 'void_sale', 'sales', p_sale_id, jsonb_build_object('sale_no', v_sale.sale_no, 'total', v_sale.total));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: adjust_stock — admin-only manual stock correction (+/-), with audit log
-- ---------------------------------------------------------------------------

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_change_qty numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new_qty numeric;
  v_product_name text;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ปรับสต๊อกได้';
  end if;
  if p_change_qty = 0 then
    raise exception 'จำนวนที่ปรับต้องไม่เท่ากับ 0';
  end if;

  update public.products
  set stock_qty = stock_qty + p_change_qty, updated_at = now()
  where id = p_product_id
  returning stock_qty, name into v_new_qty, v_product_name;

  if not found then
    raise exception 'ไม่พบสินค้า';
  end if;

  insert into public.stock_movements (product_id, change_qty, reason, created_by, note)
  values (p_product_id, p_change_qty, 'adjustment', auth.uid(), p_note);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (auth.uid(), 'adjust_stock', 'products', p_product_id, jsonb_build_object('product_name', v_product_name, 'change_qty', p_change_qty, 'note', p_note));

  return v_new_qty;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: import_products — admin-only bulk upsert from the Excel importer
-- ---------------------------------------------------------------------------

create or replace function public.import_products(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
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

-- ---------------------------------------------------------------------------
-- RPC: open_shift / close_shift — cash drawer reconciliation
-- ---------------------------------------------------------------------------

create or replace function public.open_shift(p_opening_cash numeric default 0)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select id into v_existing from public.cash_shifts
    where opened_by = auth.uid() and status = 'open'
    limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.cash_shifts (opened_by, opening_cash)
  values (auth.uid(), coalesce(p_opening_cash, 0))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.close_shift(
  p_shift_id uuid,
  p_counted_cash numeric,
  p_note text default null
)
returns table(expected_cash numeric, counted_cash numeric, difference numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_shift record;
  v_cash_sales numeric := 0;
  v_expected numeric;
begin
  select * into v_shift from public.cash_shifts where id = p_shift_id;
  if not found then
    raise exception 'ไม่พบกะที่ระบุ';
  end if;
  if v_shift.opened_by <> auth.uid() and not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์ปิดกะนี้';
  end if;
  if v_shift.status = 'closed' then
    raise exception 'กะนี้ปิดไปแล้ว';
  end if;

  select coalesce(sum(total), 0) into v_cash_sales
  from public.sales
  where shift_id = p_shift_id and payment_method = 'cash' and status = 'completed';

  v_expected := v_shift.opening_cash + v_cash_sales;

  update public.cash_shifts
  set status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      expected_cash = v_expected,
      counted_cash = p_counted_cash,
      difference = p_counted_cash - v_expected,
      note = p_note
  where id = p_shift_id;

  return query select v_expected, p_counted_cash, (p_counted_cash - v_expected);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin_list_users — admin-only, joins auth.users to expose email
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email::text, p.full_name, p.role, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin_update_role — replaces direct profile updates, writes audit_log
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนสิทธิ์ผู้ใช้ได้';
  end if;
  if p_role not in ('admin', 'cashier') then
    raise exception 'สิทธิ์ไม่ถูกต้อง';
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (auth.uid(), 'update_role', 'profiles', p_user_id, jsonb_build_object('new_role', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_shop_settings — admin-only, shop info shown on receipts
-- ---------------------------------------------------------------------------

create or replace function public.update_shop_settings(
  p_shop_name text,
  p_tax_id text default null,
  p_address text default null,
  p_phone text default null,
  p_low_stock_webhook_url text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขข้อมูลร้านได้';
  end if;
  update public.shop_settings
  set shop_name = coalesce(p_shop_name, shop_name),
      tax_id = p_tax_id,
      address = p_address,
      phone = p_phone,
      low_stock_webhook_url = p_low_stock_webhook_url,
      updated_at = now()
  where id = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: pay_customer_credit — record a repayment against a customer's credit
-- ---------------------------------------------------------------------------

create or replace function public.pay_customer_credit(
  p_customer_id uuid,
  p_amount numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_amount <= 0 then
    raise exception 'จำนวนเงินต้องมากกว่า 0';
  end if;

  update public.customers
  set credit_balance = greatest(credit_balance - p_amount, 0)
  where id = p_customer_id
  returning credit_balance into v_new_balance;

  if not found then
    raise exception 'ไม่พบลูกค้า';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (auth.uid(), 'pay_credit', 'customers', p_customer_id, jsonb_build_object('amount', p_amount, 'note', p_note));

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create_purchase_order / receive_purchase_order — procurement
-- ---------------------------------------------------------------------------

create or replace function public.create_purchase_order(
  p_supplier_id uuid,
  p_items jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_po_id uuid;
  v_item jsonb;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่สร้างใบสั่งซื้อได้';
  end if;

  insert into public.purchase_orders (supplier_id, note, created_by)
  values (p_supplier_id, p_note, auth.uid())
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.purchase_order_items (po_id, product_id, qty, unit_cost)
    values (
      v_po_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'qty')::numeric,
      coalesce((v_item->>'unit_cost')::numeric, 0)
    );
  end loop;

  return v_po_id;
end;
$$;

create or replace function public.receive_purchase_order(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_po record;
  v_item record;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่รับสินค้าเข้าได้';
  end if;

  select * into v_po from public.purchase_orders where id = p_po_id;
  if not found then
    raise exception 'ไม่พบใบสั่งซื้อนี้';
  end if;
  if v_po.status <> 'draft' then
    raise exception 'ใบสั่งซื้อนี้ถูกรับเข้าหรือยกเลิกไปแล้ว';
  end if;

  for v_item in select * from public.purchase_order_items where po_id = p_po_id
  loop
    update public.products
    set stock_qty = stock_qty + v_item.qty,
        cost_price = v_item.unit_cost,
        updated_at = now()
    where id = v_item.product_id;

    insert into public.stock_movements (product_id, change_qty, reason, ref_id, created_by, note)
    values (v_item.product_id, v_item.qty, 'restock', p_po_id, auth.uid(), 'รับสินค้าเข้าจากใบสั่งซื้อ');
  end loop;

  update public.purchase_orders
  set status = 'received', received_by = auth.uid(), received_at = now()
  where id = p_po_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (auth.uid(), 'receive_po', 'purchase_orders', p_po_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: check_low_stock / notify_low_stock — low-stock webhook notifications
-- notify_low_stock() is scheduled daily via pg_cron below; check_low_stock()
-- is exposed to the client for a manual "check now" button in Settings.
-- ---------------------------------------------------------------------------

create or replace function public.check_low_stock()
returns table(id uuid, name text, sku text, stock_qty numeric, low_stock_threshold numeric)
language sql
security definer
set search_path to 'public'
as $$
  select id, name, sku, stock_qty, low_stock_threshold
  from public.products
  where is_active = true and stock_qty <= low_stock_threshold and public.is_admin()
  order by stock_qty asc;
$$;

create or replace function public.notify_low_stock()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_webhook text;
  v_items jsonb;
  v_count integer;
begin
  select low_stock_webhook_url into v_webhook from public.shop_settings where id = true;
  if v_webhook is null or v_webhook = '' then
    return;
  end if;

  select jsonb_agg(jsonb_build_object('name', name, 'sku', sku, 'stock_qty', stock_qty, 'threshold', low_stock_threshold)),
         count(*)
    into v_items, v_count
  from public.products
  where is_active = true and stock_qty <= low_stock_threshold;

  if v_count is null or v_count = 0 then
    return;
  end if;

  perform net.http_post(
    url := v_webhook,
    body := jsonb_build_object(
      'text', 'แจ้งเตือนสต๊อกต่ำ: มี ' || v_count || ' รายการที่ต่ำกว่าจุดสั่งซื้อ',
      'items', v_items
    )
  );
end;
$$;

select cron.schedule(
  'daily-low-stock-check',
  '0 1 * * *', -- 08:00 Asia/Bangkok (UTC+7)
  $$select public.notify_low_stock();$$
);

-- ---------------------------------------------------------------------------
-- Lock down every RPC: revoke the default PUBLIC execute grant (which
-- Postgres applies to every new function automatically, and which anon
-- would otherwise inherit), then explicitly grant execute only to
-- authenticated users. Each function additionally enforces its own
-- authorization/role checks internally (see function bodies above).
-- ---------------------------------------------------------------------------

revoke execute on function public.create_sale(jsonb, jsonb, numeric, uuid, text, text, text) from public;
revoke execute on function public.create_sale(jsonb, jsonb, numeric, uuid, text, text, text) from anon;
grant execute on function public.create_sale(jsonb, jsonb, numeric, uuid, text, text, text) to authenticated;

revoke execute on function public.void_sale(uuid) from public;
revoke execute on function public.void_sale(uuid) from anon;
grant execute on function public.void_sale(uuid) to authenticated;

revoke execute on function public.adjust_stock(uuid, numeric, text) from public;
revoke execute on function public.adjust_stock(uuid, numeric, text) from anon;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;

revoke execute on function public.import_products(jsonb) from public;
revoke execute on function public.import_products(jsonb) from anon;
grant execute on function public.import_products(jsonb) to authenticated;

revoke execute on function public.open_shift(numeric) from public;
revoke execute on function public.open_shift(numeric) from anon;
grant execute on function public.open_shift(numeric) to authenticated;

revoke execute on function public.close_shift(uuid, numeric, text) from public;
revoke execute on function public.close_shift(uuid, numeric, text) from anon;
grant execute on function public.close_shift(uuid, numeric, text) to authenticated;

revoke execute on function public.admin_list_users() from public;
revoke execute on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;

revoke execute on function public.admin_update_role(uuid, text) from public;
revoke execute on function public.admin_update_role(uuid, text) from anon;
grant execute on function public.admin_update_role(uuid, text) to authenticated;

revoke execute on function public.update_shop_settings(text, text, text, text, text) from public;
revoke execute on function public.update_shop_settings(text, text, text, text, text) from anon;
grant execute on function public.update_shop_settings(text, text, text, text, text) to authenticated;

revoke execute on function public.pay_customer_credit(uuid, numeric, text) from public;
revoke execute on function public.pay_customer_credit(uuid, numeric, text) from anon;
grant execute on function public.pay_customer_credit(uuid, numeric, text) to authenticated;

revoke execute on function public.create_purchase_order(uuid, jsonb, text) from public;
revoke execute on function public.create_purchase_order(uuid, jsonb, text) from anon;
grant execute on function public.create_purchase_order(uuid, jsonb, text) to authenticated;

revoke execute on function public.receive_purchase_order(uuid) from public;
revoke execute on function public.receive_purchase_order(uuid) from anon;
grant execute on function public.receive_purchase_order(uuid) to authenticated;

revoke execute on function public.check_low_stock() from public;
revoke execute on function public.check_low_stock() from anon;
grant execute on function public.check_low_stock() to authenticated;

-- ============================================================================
-- End of schema
-- ============================================================================
