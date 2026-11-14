begin;

select plan(23);

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
  ('fa000000-0000-4000-8000-000000000001','authenticated','authenticated','finance-atomic-owner@example.test','synthetic',now(),'{}','{}'),
  ('fa000000-0000-4000-8000-000000000002','authenticated','authenticated','finance-atomic-accounting@example.test','synthetic',now(),'{}','{}');

insert into public.profiles (user_id,role,display_name,active)
values
  ('fa000000-0000-4000-8000-000000000001','psychologist_owner','Finance Atomic Owner',true),
  ('fa000000-0000-4000-8000-000000000002','accounting','Finance Atomic Accounting',true);

insert into public.vendors (id,legal_name)
values ('fa100000-0000-4000-8000-000000000001','Vendor Setup');

insert into public.expense_categories (id,name)
values ('fa200000-0000-4000-8000-000000000001','atomic setup category');

insert into public.receivables (
  id,source_type,source_id,person_id,payer_person_id,original_amount_cents,idempotency_key,status
) values (
  'fa300000-0000-4000-8000-000000000001','synthetic',
  'fa300000-0000-4000-8000-000000000099',
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  10000,'finance-atomic-receivable','open'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fa000000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.apply_receivable_adjustment_atomic(
    'fa300000-0000-4000-8000-000000000001',-1000,'synthetic discount'
  ) $$,
  'owner applies adjustment atomically'
);
select is(
  (select count(*)::int from public.audit_events
   where action='receivable.adjusted'
     and metadata->>'receivableId'='fa300000-0000-4000-8000-000000000001'),
  1,
  'adjustment emits exactly one audit'
);

select lives_ok(
  $$ select public.create_payable_atomic(
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001',
    'atomic payable',2500,'2026-10-10','2026-10-01','finance-atomic-payable'
  ) $$,
  'payable creation is atomic'
);
select is(
  (select count(*)::int from public.audit_events
   where action='payable.created'
     and entity_id=(select id from public.payables where idempotency_key='finance-atomic-payable')),
  1,
  'payable emits exactly one audit'
);
select is(
  (select public.create_payable_atomic(
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001',
    'atomic payable',2500,'2026-10-10','2026-10-01','finance-atomic-payable'
  ))::text,
  (select id::text from public.payables where idempotency_key='finance-atomic-payable'),
  'payable retry returns the existing id'
);
select is(
  (select count(*)::int from public.audit_events
   where action='payable.created'
     and entity_id=(select id from public.payables where idempotency_key='finance-atomic-payable')),
  1,
  'payable retry does not duplicate audit'
);

select lives_ok(
  $$ select public.create_recurrence_rule_atomic(
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001',
    'atomic recurrence',3000,'2026-10-01',10,'last_day'
  ) $$,
  'recurrence rule creation is atomic'
);
select is(
  (select count(*)::int from public.audit_events
   where action='payable.recurrence_created'
     and entity_id=(select id from public.recurrence_rules where description='atomic recurrence')),
  1,
  'recurrence emits exactly one audit'
);

select lives_ok(
  $$ select public.create_vendor_atomic('atomic vendor created') $$,
  'vendor creation is atomic'
);
select is(
  (select count(*)::int from public.audit_events
   where action='vendor.created'
     and entity_id=(select id from public.vendors where legal_name='atomic vendor created')),
  1,
  'vendor emits exactly one audit'
);

select lives_ok(
  $$ select public.create_expense_category_atomic('atomic category created') $$,
  'expense category creation is atomic'
);
select is(
  (select count(*)::int from public.audit_events
   where action='expense_category.created'
     and entity_id=(select id from public.expense_categories where name='atomic category created')),
  1,
  'expense category emits exactly one audit'
);

reset role;

create or replace function public.test_reject_finance_atomic_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action in (
    'receivable.adjusted','payable.created','payable.recurrence_created',
    'vendor.created','expense_category.created'
  ) then
    raise exception 'SYNTHETIC_FINANCE_AUDIT_FAILURE' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger test_reject_finance_atomic_audit
before insert on public.audit_events
for each row execute function public.test_reject_finance_atomic_audit();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fa000000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.apply_receivable_adjustment_atomic(
    'fa300000-0000-4000-8000-000000000001',500,'rollback increase'
  ) $$,
  '55000','SYNTHETIC_FINANCE_AUDIT_FAILURE',
  'audit failure aborts adjustment'
);
select is(
  (select count(*)::int from public.receivable_adjustments
   where receivable_id='fa300000-0000-4000-8000-000000000001'),
  1,
  'failed adjustment leaves only the successful adjustment'
);

select throws_ok(
  $$ select public.create_payable_atomic(
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001',
    'rollback payable',4000,'2026-11-10','2026-11-01','finance-rollback-payable'
  ) $$,
  '55000','SYNTHETIC_FINANCE_AUDIT_FAILURE',
  'audit failure aborts payable'
);
select is(
  (select count(*)::int from public.payables where idempotency_key='finance-rollback-payable'),
  0,
  'failed payable leaves no row'
);

select throws_ok(
  $$ select public.create_recurrence_rule_atomic(
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001',
    'rollback recurrence',4100,'2026-11-01',11,'last_day'
  ) $$,
  '55000','SYNTHETIC_FINANCE_AUDIT_FAILURE',
  'audit failure aborts recurrence'
);
select is(
  (select count(*)::int from public.recurrence_rules where description='rollback recurrence'),
  0,
  'failed recurrence leaves no row'
);

select throws_ok(
  $$ select public.create_vendor_atomic('rollback vendor') $$,
  '55000','SYNTHETIC_FINANCE_AUDIT_FAILURE',
  'audit failure aborts vendor'
);
select is(
  (select count(*)::int from public.vendors where legal_name='rollback vendor'),
  0,
  'failed vendor leaves no row'
);

select throws_ok(
  $$ select public.create_expense_category_atomic('rollback category') $$,
  '55000','SYNTHETIC_FINANCE_AUDIT_FAILURE',
  'audit failure aborts expense category'
);
select is(
  (select count(*)::int from public.expense_categories where name='rollback category'),
  0,
  'failed expense category leaves no row'
);

reset role;
drop trigger test_reject_finance_atomic_audit on public.audit_events;
drop function public.test_reject_finance_atomic_audit();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fa000000-0000-4000-8000-000000000002","aal":"aal1","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.apply_receivable_adjustment_atomic(
    'fa300000-0000-4000-8000-000000000001',100,'accounting denied'
  ) $$,
  '42501','FINANCE_ADJUSTMENT_FORBIDDEN',
  'accounting cannot adjust receivables'
);

reset role;
select * from finish();
rollback;
