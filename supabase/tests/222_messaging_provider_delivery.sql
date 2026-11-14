begin;
select plan(20);

select has_column('public', 'outbound_messages', 'provider_message_id', 'outbound messages persist provider message id');
select has_column('public', 'outbound_messages', 'provider_delivery_status', 'outbound messages persist provider delivery status');
select has_column('public', 'outbound_messages', 'provider_delivery_updated_at', 'outbound messages timestamp provider delivery updates');
select has_column('public', 'inbox_events', 'processed_at', 'provider inbox events track processing completion');

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'outbound_messages'
      and indexname = 'outbound_messages_provider_message_id_unique'
  ),
  'provider message ids are uniquely correlated'
);

select is(
  public.apply_message_provider_delivery_status('provider-unknown', 'delivered'),
  'unknown',
  'unknown provider message is not fabricated'
);

insert into public.outbound_messages (
  idempotency_key, channel, recipient, template_key, payload, status,
  provider_message_id, provider_delivery_status
)
values (
  'delivery-test-1', 'email', 'synthetic@example.test', 'appointment_confirmation',
  '{}'::jsonb, 'sent', 'provider-message-1', 'sent'
);

select is(
  public.apply_message_provider_delivery_status('provider-message-1', 'delivered'),
  'updated',
  'sent advances to delivered'
);
select is(
  (select provider_delivery_status from public.outbound_messages where provider_message_id = 'provider-message-1'),
  'delivered',
  'delivered state is persisted'
);
select is(
  public.apply_message_provider_delivery_status('provider-message-1', 'sent'),
  'ignored',
  'older sent event cannot regress delivered'
);
select is(
  public.apply_message_provider_delivery_status('provider-message-1', 'read'),
  'updated',
  'delivered advances to read'
);
select is(
  (select provider_delivery_status from public.outbound_messages where provider_message_id = 'provider-message-1'),
  'read',
  'read is persisted'
);
select is(
  public.apply_message_provider_delivery_status('provider-message-1', 'failed'),
  'ignored',
  'read remains terminal if a stale failure arrives'
);

insert into public.outbound_messages (
  idempotency_key, channel, recipient, template_key, payload, status,
  provider_message_id, provider_delivery_status
)
values (
  'delivery-test-2', 'whatsapp', '+5500000000000', 'appointment_confirmation',
  '{}'::jsonb, 'sent', 'provider-message-2', 'sent'
);

select is(
  public.apply_message_provider_delivery_status('provider-message-2', 'failed'),
  'updated',
  'accepted delivery can become terminally failed'
);
select is(
  (select status from public.outbound_messages where provider_message_id = 'provider-message-2'),
  'failed',
  'asynchronous provider failure is operationally visible'
);

select throws_ok(
  $sql$ select public.apply_message_provider_delivery_status('', 'delivered') $sql$,
  '22023',
  'MESSAGE_PROVIDER_DELIVERY_INVALID',
  'invalid delivery input fails closed'
);

insert into public.outbound_messages (
  id, idempotency_key, channel, recipient, template_key, payload, status
)
values (
  '00000000-0000-0000-0000-000000000254'::uuid,
  'delivery-race-test', 'whatsapp', '+5500000000000',
  'appointment_confirmation', '{}'::jsonb, 'queued'
);

insert into public.inbox_events (provider, provider_event_id, payload)
values (
  'meta-whatsapp',
  'delivery-race-event',
  '{"kind":"delivery_status","providerMessageId":"provider-race-1","status":"failed"}'::jsonb
);

select is(
  public.record_message_provider_acceptance(
    '00000000-0000-0000-0000-000000000254'::uuid,
    'provider-race-1'
  ),
  'updated',
  'provider acceptance is persisted even when its webhook arrived first'
);
select is(
  (select provider_message_id from public.outbound_messages where id = '00000000-0000-0000-0000-000000000254'::uuid),
  'provider-race-1',
  'early webhook is correlated after provider acceptance'
);
select is(
  (select provider_delivery_status from public.outbound_messages where id = '00000000-0000-0000-0000-000000000254'::uuid),
  'failed',
  'early terminal provider status is reconciled'
);
select is(
  (select status from public.outbound_messages where id = '00000000-0000-0000-0000-000000000254'::uuid),
  'failed',
  'early provider failure becomes operationally visible'
);
select ok(
  (select processed_at is not null from public.inbox_events where provider_event_id = 'delivery-race-event'),
  'reconciled early webhook is marked processed'
);

select * from finish();
rollback;
