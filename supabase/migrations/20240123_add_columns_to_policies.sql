
alter table "public"."policies" 
add column if not exists "commission_amount" numeric default 0,
add column if not exists "employee_id" uuid references auth.users(id),
add column if not exists "company" text,
add column if not exists "plate" text,
add column if not exists "identity_no" text;
