-- ============================================================================
-- POS + Inventory Management — Full Database Schema
-- Run this once in Supabase SQL Editor on a fresh project.
-- This reflects the CURRENT, complete schema including all feature additions:
-- void sale, manual stock adjustment, cash shift reconciliation, admin user
-- management RPC, and the RLS-recursion-safe is_admin() helper.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
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

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text not null unique,
  cashier_id uuid references public.profiles(id),
  customer_name text,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card')),
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
  line_total numeric not null
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
alter table public.stock_movements enable row level security;

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

create policy stock_movements_admin_select on public.stock_movements
  for select using (public.is_admin());

-- Note: sales, sale_items, cash_shifts, and stock_movements have no direct
-- INSERT/UPDATE/DELETE policies for regular users — all writes to these
-- tables go exclusively through the SECURITY DEFINER RPC functions below,
-- which run with elevated privileges and enforce their own business rules
-- (stock checks, admin-only actions, ownership checks, etc).

-- ---------------------------------------------------------------------------
-- RPC: create_sale — records a sale, decrements stock, logs stock movements
-- ---------------------------------------------------------------------------

create or replace function public.create_sale(
  p_items jsonb,
  p_discount numeric default 0,
  p_payment_method text default 'cash',
  p_customer_name text default null
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
  v_product record;
  v_qty numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_line_total numeric;
  v_shift_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนบันทึกการขาย';
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
    if v_qty <= 0 then
      raise exception 'จำนวนสินค้าต้องมากกว่า 0';
    end if;
    if v_product.stock_qty < v_qty then
      raise exception 'สต๊อกไม่พอสำหรับสินค้า "%": เหลือ % แต่ขอขาย %', v_product.name, v_product.stock_qty, v_qty;
    end if;
  end loop;

  insert into public.sales (id, sale_no, cashier_id, customer_name, subtotal, discount, total, payment_method, shift_id)
  values (v_sale_id, v_sale_no, auth.uid(), p_customer_name, 0, coalesce(p_discount,0), 0, coalesce(p_payment_method,'cash'), v_shift_id);

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

-- ---------------------------------------------------------------------------
-- RPC: void_sale — admin-only, cancels a sale and restores stock
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

  update public.sales set status = 'void' where id = p_sale_id;
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
  returning stock_qty into v_new_qty;

  if not found then
    raise exception 'ไม่พบสินค้า';
  end if;

  insert into public.stock_movements (product_id, change_qty, reason, created_by, note)
  values (p_product_id, p_change_qty, 'adjustment', auth.uid(), p_note);

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
-- (profiles has no email column; auth.users isn't directly queryable by anon/
-- authenticated clients, so this SECURITY DEFINER function bridges the two
-- for the in-app "จัดการผู้ใช้" user-management page)
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
-- Lock down every RPC: revoke the default PUBLIC execute grant (which
-- Postgres applies to every new function automatically, and which anon
-- would otherwise inherit), then explicitly grant execute only to
-- authenticated users. Each function additionally enforces its own
-- authorization/role checks internally (see function bodies above).
-- ---------------------------------------------------------------------------

revoke execute on function public.create_sale(jsonb, numeric, text, text) from public;
revoke execute on function public.create_sale(jsonb, numeric, text, text) from anon;
grant execute on function public.create_sale(jsonb, numeric, text, text) to authenticated;

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

-- ============================================================================
-- End of schema
-- ============================================================================
