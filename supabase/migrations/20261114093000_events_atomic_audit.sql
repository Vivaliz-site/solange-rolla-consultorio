-- owners: audit,events,receivables
-- cross-module-task: docs/task-contracts/events-atomic-audit-210.json
-- allow-static-routines: true

create or replace function public.create_event_atomic(
  p_title text,
  p_description text,
  p_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_modality text,
  p_capacity integer,
  p_default_price_cents bigint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  event_id uuid;
begin
  if actor is null
    or public.current_app_role() not in ('psychologist_owner','secretary')
    or not public.has_permission('events.manage') then
    raise exception 'EVENT_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = '' or p_type is null or btrim(p_type) = ''
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or p_modality not in ('in_person','online','hybrid')
    or p_capacity is null or p_capacity <= 0
    or p_default_price_cents is null or p_default_price_cents < 0 then
    raise exception 'EVENT_INPUT_INVALID' using errcode = '22023';
  end if;

  insert into public.events (
    title,description,type,starts_at,ends_at,timezone,location,modality,capacity,
    default_price_cents,status
  ) values (
    btrim(p_title),coalesce(p_description,''),btrim(p_type),p_starts_at,p_ends_at,
    'America/Sao_Paulo',coalesce(p_location,''),p_modality,p_capacity,
    p_default_price_cents,'open'
  )
  returning id into event_id;

  insert into public.audit_events (
    actor_user_id,action,entity_type,entity_id,correlation_id,metadata
  ) values (
    actor,'event.created','event',event_id,event_id::text,
    jsonb_build_object('startsAt',p_starts_at,'endsAt',p_ends_at,'capacity',p_capacity)
  );

  return event_id;
end;
$$;

create or replace function public.update_event_atomic(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_modality text,
  p_location text,
  p_default_price_cents bigint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  active_registrations integer;
begin
  if actor is null
    or public.current_app_role() not in ('psychologist_owner','secretary')
    or not public.has_permission('events.manage') then
    raise exception 'EVENT_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = ''
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or p_capacity is null or p_capacity <= 0
    or p_modality not in ('in_person','online','hybrid')
    or p_default_price_cents is null or p_default_price_cents < 0 then
    raise exception 'EVENT_INPUT_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
  perform 1 from public.events where id=p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer into active_registrations
  from public.event_registrations
  where event_id=p_event_id and status <> 'cancelled';
  if active_registrations > p_capacity then
    raise exception 'EVENT_CAPACITY_BELOW_REGISTRATIONS' using errcode = '23514';
  end if;

  update public.events
  set title=btrim(p_title),
      starts_at=p_starts_at,
      ends_at=p_ends_at,
      capacity=p_capacity,
      modality=p_modality,
      location=coalesce(p_location,''),
      default_price_cents=p_default_price_cents
  where id=p_event_id;

  insert into public.audit_events (
    actor_user_id,action,entity_type,entity_id,correlation_id,metadata
  ) values (
    actor,'event.updated','event',p_event_id,p_event_id::text,
    jsonb_build_object('startsAt',p_starts_at,'endsAt',p_ends_at,'capacity',p_capacity)
  );

  return p_event_id;
end;
$$;

create or replace function public.register_event_participant_atomic(
  p_event_id uuid,
  p_person_id uuid,
  p_price_cents bigint,
  p_status text
)
returns setof uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  registration_id uuid;
begin
  if actor is null
    or public.current_app_role() not in ('psychologist_owner','secretary')
    or not public.has_permission('events.manage') then
    raise exception 'EVENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_price_cents is null or p_price_cents < 0
    or p_status not in ('confirmed','pending_payment','waitlisted') then
    raise exception 'EVENT_REGISTRATION_INPUT_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));

  if not exists (
    select 1 from public.events
    where id=p_event_id and status in ('open','planned')
  ) then
    raise exception 'EVENT_NOT_OPEN';
  end if;
  if (
    select count(*) from public.event_registrations
    where event_id=p_event_id and status <> 'cancelled'
  ) >= (
    select capacity from public.events where id=p_event_id
  ) then
    raise exception 'EVENT_FULL';
  end if;

  insert into public.event_registrations (
    event_id,person_id,price_cents,status
  ) values (
    p_event_id,p_person_id,p_price_cents,p_status
  )
  returning id into registration_id;

  if p_price_cents > 0 then
    insert into public.receivables (
      source_type,source_id,person_id,payer_person_id,original_amount_cents,idempotency_key
    ) values (
      'event_registration',registration_id,p_person_id,p_person_id,p_price_cents,
      format('event-registration:%s',registration_id)
    );
  end if;

  insert into public.audit_events (
    actor_user_id,action,entity_type,entity_id,correlation_id,metadata
  ) values (
    actor,'event.registration_created','event_registration',registration_id,registration_id::text,
    jsonb_build_object(
      'eventId',p_event_id,'personId',p_person_id,'priceCents',p_price_cents,'status',p_status
    )
  );

  return next registration_id;
  return;
end;
$$;

create or replace function public.update_event_registration_atomic(
  p_registration_id uuid,
  p_status text,
  p_attendance_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null
    or public.current_app_role() not in ('psychologist_owner','secretary')
    or not public.has_permission('events.manage') then
    raise exception 'EVENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('confirmed','pending_payment','waitlisted','cancelled')
    or p_attendance_status not in ('present','absent','unknown') then
    raise exception 'EVENT_REGISTRATION_STATE_INVALID' using errcode = '22023';
  end if;

  update public.event_registrations
  set status=p_status, attendance_status=p_attendance_status
  where id=p_registration_id;
  if not found then
    raise exception 'EVENT_REGISTRATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    actor_user_id,action,entity_type,entity_id,correlation_id,metadata
  ) values (
    actor,'event.registration_updated','event_registration',p_registration_id,p_registration_id::text,
    jsonb_build_object('status',p_status,'attendance',p_attendance_status)
  );

  return p_registration_id;
end;
$$;

create or replace function public.create_event_expense_atomic(
  p_event_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_paid_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  expense_id uuid;
begin
  if actor is null
    or public.current_app_role() not in ('psychologist_owner','accounting') then
    raise exception 'EVENT_EXPENSE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_description is null or btrim(p_description)=''
    or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'EVENT_EXPENSE_INVALID' using errcode = '22023';
  end if;

  insert into public.event_expenses (
    event_id,description,amount_cents,paid_at
  ) values (
    p_event_id,btrim(p_description),p_amount_cents,p_paid_at
  )
  returning id into expense_id;

  insert into public.audit_events (
    actor_user_id,action,entity_type,entity_id,correlation_id,metadata
  ) values (
    actor,'event.expense_created','event_expense',expense_id,expense_id::text,
    jsonb_build_object(
      'eventId',p_event_id,'amountCents',p_amount_cents,'description',btrim(p_description)
    )
  );

  return expense_id;
end;
$$;

revoke all on function public.create_event_atomic(text,text,text,timestamptz,timestamptz,text,text,integer,bigint) from public,anon;
revoke all on function public.update_event_atomic(uuid,text,timestamptz,timestamptz,integer,text,text,bigint) from public,anon;
revoke all on function public.register_event_participant_atomic(uuid,uuid,bigint,text) from public,anon;
revoke all on function public.update_event_registration_atomic(uuid,text,text) from public,anon;
revoke all on function public.create_event_expense_atomic(uuid,text,bigint,timestamptz) from public,anon;

grant execute on function public.create_event_atomic(text,text,text,timestamptz,timestamptz,text,text,integer,bigint) to authenticated;
grant execute on function public.update_event_atomic(uuid,text,timestamptz,timestamptz,integer,text,text,bigint) to authenticated;
grant execute on function public.register_event_participant_atomic(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.update_event_registration_atomic(uuid,text,text) to authenticated;
grant execute on function public.create_event_expense_atomic(uuid,text,bigint,timestamptz) to authenticated;
