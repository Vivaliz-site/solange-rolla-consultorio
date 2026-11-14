-- owners: messaging
-- task-contract: docs/task-contracts/messaging-provider-delivery-reconciliation-254.json
-- allow-static-routines: true

alter table public.outbound_messages
  add column provider_message_id text,
  add column provider_delivery_status text
    check (provider_delivery_status in ('sent', 'delivered', 'read', 'failed')),
  add column provider_delivery_updated_at timestamptz,
  add constraint outbound_messages_provider_message_id_nonempty
    check (provider_message_id is null or length(btrim(provider_message_id)) between 1 and 512);

create unique index outbound_messages_provider_message_id_unique
  on public.outbound_messages (provider_message_id)
  where provider_message_id is not null;

alter table public.inbox_events
  add column processed_at timestamptz;

create or replace function public.apply_message_provider_delivery_status(
  p_provider_message_id text,
  p_status text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_current text;
  v_outbound_status text;
  v_should_advance boolean := false;
begin
  if p_provider_message_id is null
     or length(btrim(p_provider_message_id)) = 0
     or p_status not in ('sent', 'delivered', 'read', 'failed') then
    raise exception 'MESSAGE_PROVIDER_DELIVERY_INVALID'
      using errcode = '22023';
  end if;

  select id, provider_delivery_status, status
    into v_id, v_current, v_outbound_status
  from public.outbound_messages
  where provider_message_id = p_provider_message_id
  for update;

  if not found then
    return 'unknown';
  end if;

  if v_current is null then
    v_should_advance := true;
  elsif v_current = p_status or v_current in ('read', 'failed') then
    v_should_advance := false;
  elsif v_current = 'sent' then
    v_should_advance := p_status in ('delivered', 'read', 'failed');
  elsif v_current = 'delivered' then
    v_should_advance := p_status = 'read';
  end if;

  if not v_should_advance then
    return 'ignored';
  end if;

  update public.outbound_messages
  set provider_delivery_status = p_status,
      provider_delivery_updated_at = clock_timestamp(),
      status = case when p_status = 'failed' then 'failed' else v_outbound_status end
  where id = v_id;

  return 'updated';
end;
$$;

create or replace function public.record_message_provider_acceptance(
  p_message_id uuid,
  p_provider_message_id text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_event record;
  v_result text;
begin
  if p_message_id is null
     or p_provider_message_id is null
     or length(btrim(p_provider_message_id)) = 0 then
    raise exception 'MESSAGE_PROVIDER_ACCEPTANCE_INVALID'
      using errcode = '22023';
  end if;

  update public.outbound_messages
  set status = 'sent',
      provider_message_id = p_provider_message_id,
      provider_delivery_status = coalesce(provider_delivery_status, 'sent'),
      provider_delivery_updated_at = coalesce(provider_delivery_updated_at, clock_timestamp())
  where id = p_message_id;

  if not found then
    return 'unknown';
  end if;

  -- A delivery event may arrive before the worker persists the provider ID.
  -- Reconcile any such durable inbox events now that correlation exists.
  for v_event in
    select id, payload ->> 'status' as provider_status
    from public.inbox_events
    where processed_at is null
      and payload ->> 'kind' = 'delivery_status'
      and payload ->> 'providerMessageId' = p_provider_message_id
    order by received_at, id
  loop
    if v_event.provider_status in ('sent', 'delivered', 'read', 'failed') then
      v_result := public.apply_message_provider_delivery_status(
        p_provider_message_id,
        v_event.provider_status
      );
      if v_result <> 'unknown' then
        update public.inbox_events
        set processed_at = clock_timestamp()
        where id = v_event.id
          and processed_at is null;
      end if;
    end if;
  end loop;

  return 'updated';
end;
$$;

revoke all on function public.apply_message_provider_delivery_status(text, text)
  from public, anon, authenticated;
grant execute on function public.apply_message_provider_delivery_status(text, text)
  to service_role;

revoke all on function public.record_message_provider_acceptance(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_message_provider_acceptance(uuid, text)
  to service_role;
