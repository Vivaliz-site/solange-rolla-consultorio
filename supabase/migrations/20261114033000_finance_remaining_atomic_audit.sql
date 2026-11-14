-- owners: audit,payables,receivables
-- cross-module-task: docs/task-contracts/finance-remaining-atomic-audit-211.json
-- allow-static-routines: true

create or replace function public.apply_receivable_adjustment_atomic(
  p_receivable_id uuid,
  p_adjustment_cents bigint,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_status text;
  original_cents bigint;
  adjustment_id uuid;
  adjustment_total bigint;
  paid_cents bigint;
  refunded_cents bigint;
  charge_cents bigint;
  net_paid_cents bigint;
  next_status text;
begin
  if actor is null
    or public.current_app_role() <> 'psychologist_owner'
    or not public.has_permission('finance.adjust') then
    raise exception 'FINANCE_ADJUSTMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_adjustment_cents is null or p_adjustment_cents = 0 then
    raise exception 'FINANCE_ADJUSTMENT_INVALID' using errcode = '22023';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'FINANCE_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  select original_amount_cents, status
  into original_cents, current_status
  from public.receivables
  where id = p_receivable_id
  for update;
  if not found then
    raise exception 'FINANCE_RECEIVABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.receivable_adjustments (
    receivable_id, adjustment_cents, reason, actor_id
  ) values (
    p_receivable_id, p_adjustment_cents, btrim(p_reason), actor
  )
  returning id into adjustment_id;

  select coalesce(sum(adjustment_cents), 0)
  into adjustment_total
  from public.receivable_adjustments
  where receivable_id = p_receivable_id;

  select coalesce(sum(amount_cents), 0)
  into paid_cents
  from public.payments
  where receivable_id = p_receivable_id;

  select coalesce(sum(amount_cents), 0)
  into refunded_cents
  from public.payment_refunds
  where payment_id in (
    select id from public.payments where receivable_id = p_receivable_id
  );

  charge_cents := greatest(0, original_cents + adjustment_total);
  net_paid_cents := paid_cents - refunded_cents;
  next_status := case
    when current_status = 'voided' then 'voided'
    when charge_cents <= 0 and net_paid_cents > 0 then 'refund_due'
    when charge_cents <= 0 then 'voided'
    when net_paid_cents > charge_cents then 'refund_due'
    when net_paid_cents = charge_cents then 'paid'
    when refunded_cents > 0 and net_paid_cents <= 0 then 'refunded'
    when current_status = 'overdue' then 'overdue'
    when net_paid_cents > 0 then 'partial'
    else 'open'
  end;

  update public.receivables set status = next_status where id = p_receivable_id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, correlation_id, metadata
  ) values (
    actor, 'receivable.adjusted', 'receivable_adjustment', adjustment_id, adjustment_id::text,
    jsonb_build_object(
      'receivableId', p_receivable_id,
      'adjustmentCents', p_adjustment_cents,
      'reason', btrim(p_reason)
    )
  );

  return adjustment_id;
end;
$$;

create or replace function public.create_payable_atomic(
  p_vendor_id uuid,
  p_category_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_due_date date,
  p_competence date,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  existing public.payables%rowtype;
  payable_id uuid;
begin
  if actor is null or public.current_app_role() not in ('psychologist_owner', 'accounting') then
    raise exception 'FINANCE_PAYABLE_CREATE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_description is null or btrim(p_description) = '' or p_amount_cents is null or p_amount_cents <= 0
    or p_due_date is null or p_competence is null
    or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'FINANCE_PAYABLE_INPUT_INVALID' using errcode = '22023';
  end if;

  select * into existing from public.payables where idempotency_key = p_idempotency_key;
  if found then
    if existing.vendor_id <> p_vendor_id
      or existing.category_id <> p_category_id
      or existing.description <> btrim(p_description)
      or existing.amount_cents <> p_amount_cents
      or existing.due_date <> p_due_date
      or existing.competence <> p_competence then
      raise exception 'FINANCE_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  insert into public.payables (
    vendor_id, category_id, description, amount_cents, due_date, competence, idempotency_key
  ) values (
    p_vendor_id, p_category_id, btrim(p_description), p_amount_cents, p_due_date, p_competence, p_idempotency_key
  )
  returning id into payable_id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, correlation_id, metadata
  ) values (
    actor, 'payable.created', 'payable', payable_id, payable_id::text,
    jsonb_build_object(
      'vendorId', p_vendor_id,
      'categoryId', p_category_id,
      'amountCents', p_amount_cents,
      'dueDate', p_due_date,
      'competence', p_competence
    )
  );

  return payable_id;
end;
$$;

create or replace function public.create_recurrence_rule_atomic(
  p_vendor_id uuid,
  p_category_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_start_date date,
  p_day_of_month integer,
  p_month_end_fallback text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  rule_id uuid;
begin
  if actor is null or public.current_app_role() not in ('psychologist_owner', 'accounting') then
    raise exception 'FINANCE_RECURRENCE_CREATE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_description is null or btrim(p_description) = '' or p_amount_cents is null or p_amount_cents <= 0
    or p_start_date is null or p_day_of_month not between 1 and 31
    or p_month_end_fallback not in ('last_day', 'reject') then
    raise exception 'FINANCE_RECURRENCE_INPUT_INVALID' using errcode = '22023';
  end if;

  insert into public.recurrence_rules (
    vendor_id, category_id, description, amount_cents, start_date, day_of_month, month_end_fallback
  ) values (
    p_vendor_id, p_category_id, btrim(p_description), p_amount_cents, p_start_date, p_day_of_month, p_month_end_fallback
  )
  returning id into rule_id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, correlation_id, metadata
  ) values (
    actor, 'payable.recurrence_created', 'recurrence_rule', rule_id, rule_id::text,
    jsonb_build_object(
      'vendorId', p_vendor_id,
      'categoryId', p_category_id,
      'amountCents', p_amount_cents,
      'startDate', p_start_date,
      'dayOfMonth', p_day_of_month,
      'fallback', p_month_end_fallback
    )
  );

  return rule_id;
end;
$$;

create or replace function public.create_vendor_atomic(p_legal_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  vendor_id uuid;
begin
  if actor is null or public.current_app_role() not in ('psychologist_owner', 'accounting') then
    raise exception 'FINANCE_VENDOR_CREATE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_legal_name is null or btrim(p_legal_name) = '' then
    raise exception 'FINANCE_VENDOR_INPUT_INVALID' using errcode = '22023';
  end if;

  insert into public.vendors (legal_name) values (btrim(p_legal_name)) returning id into vendor_id;
  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, correlation_id, metadata
  ) values (
    actor, 'vendor.created', 'vendor', vendor_id, vendor_id::text,
    jsonb_build_object('legalName', btrim(p_legal_name))
  );
  return vendor_id;
end;
$$;

create or replace function public.create_expense_category_atomic(p_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  category_id uuid;
begin
  if actor is null or public.current_app_role() not in ('psychologist_owner', 'accounting') then
    raise exception 'FINANCE_EXPENSE_CATEGORY_CREATE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'FINANCE_EXPENSE_CATEGORY_INPUT_INVALID' using errcode = '22023';
  end if;

  insert into public.expense_categories (name) values (btrim(p_name)) returning id into category_id;
  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, correlation_id, metadata
  ) values (
    actor, 'expense_category.created', 'expense_category', category_id, category_id::text,
    jsonb_build_object('name', btrim(p_name))
  );
  return category_id;
end;
$$;

revoke all on function public.apply_receivable_adjustment_atomic(uuid,bigint,text) from public, anon;
revoke all on function public.create_payable_atomic(uuid,uuid,text,bigint,date,date,text) from public, anon;
revoke all on function public.create_recurrence_rule_atomic(uuid,uuid,text,bigint,date,integer,text) from public, anon;
revoke all on function public.create_vendor_atomic(text) from public, anon;
revoke all on function public.create_expense_category_atomic(text) from public, anon;

grant execute on function public.apply_receivable_adjustment_atomic(uuid,bigint,text) to authenticated;
grant execute on function public.create_payable_atomic(uuid,uuid,text,bigint,date,date,text) to authenticated;
grant execute on function public.create_recurrence_rule_atomic(uuid,uuid,text,bigint,date,integer,text) to authenticated;
grant execute on function public.create_vendor_atomic(text) to authenticated;
grant execute on function public.create_expense_category_atomic(text) to authenticated;
