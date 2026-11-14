begin;

select plan(24);

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
  ('fb000000-0000-4000-8000-000000000001','authenticated','authenticated','events-atomic-owner@example.test','synthetic',now(),'{}','{}'),
  ('fb000000-0000-4000-8000-000000000002','authenticated','authenticated','events-atomic-accounting@example.test','synthetic',now(),'{}','{}');

insert into public.profiles (user_id,role,display_name,active)
values
  ('fb000000-0000-4000-8000-000000000001','psychologist_owner','Events Atomic Owner',true),
  ('fb000000-0000-4000-8000-000000000002','accounting','Events Atomic Accounting',true);

insert into public.events (
  id,title,description,type,starts_at,ends_at,timezone,location,modality,capacity,
  default_price_cents,status
) values (
  'fb100000-0000-4000-8000-000000000001','Atomic Base Event','setup','group',
  '2035-02-10T18:00:00Z','2035-02-10T20:00:00Z','America/Sao_Paulo','Room A',
  'in_person',3,5000,'open'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fb000000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.create_event_atomic(
    'Atomic Created Event','created','group',
    '2035-02-11T18:00:00Z','2035-02-11T20:00:00Z','Room B','in_person',5,2500
  ) $$,
  'event creation is atomic'
);
select is(
  (select count(*)::int from public.audit_events
   where action='event.created'
     and entity_id=(select id from public.events where title='Atomic Created Event')),
  1,
  'event create emits one audit'
);

select lives_ok(
  $$ select public.register_event_participant_atomic(
    'fb100000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    5000,'pending_payment'
  ) $$,
  'paid registration is atomic'
);
select is(
  (select count(*)::int from public.receivables
   where source_type='event_registration'
     and source_id=(select id from public.event_registrations
                    where event_id='fb100000-0000-4000-8000-000000000001'
                      and person_id='d0000000-0000-4000-8000-000000000001')),
  1,
  'paid registration creates one receivable'
);
select is(
  (select count(*)::int from public.audit_events
   where action='event.registration_created'
     and entity_id=(select id from public.event_registrations
                    where event_id='fb100000-0000-4000-8000-000000000001'
                      and person_id='d0000000-0000-4000-8000-000000000001')),
  1,
  'registration emits one audit'
);

select lives_ok(
  $$ select public.update_event_atomic(
    'fb100000-0000-4000-8000-000000000001','Atomic Base Event Updated',
    '2035-02-10T18:30:00Z','2035-02-10T20:30:00Z',2,'hybrid','Room C',6000
  ) $$,
  'event update is atomic'
);
select is(
  (select count(*)::int from public.audit_events
   where action='event.updated' and entity_id='fb100000-0000-4000-8000-000000000001'),
  1,
  'event update emits one audit'
);

select lives_ok(
  $$ select public.update_event_registration_atomic(
    (select id from public.event_registrations
     where event_id='fb100000-0000-4000-8000-000000000001'
       and person_id='d0000000-0000-4000-8000-000000000001'),
    'confirmed','present'
  ) $$,
  'registration update is atomic'
);
select is(
  (select count(*)::int from public.audit_events
   where action='event.registration_updated'
     and entity_id=(select id from public.event_registrations
                    where event_id='fb100000-0000-4000-8000-000000000001'
                      and person_id='d0000000-0000-4000-8000-000000000001')),
  1,
  'registration update emits one audit'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fb000000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);
select lives_ok(
  $ select public.create_event_expense_atomic(
    'fb100000-0000-4000-8000-000000000001','atomic expense',1200,null
  ) $,
  'authorized event manager may create event expense atomically'
);
select is(
  (select count(*)::int from public.audit_events
   where action='event.expense_created'
     and entity_id=(select id from public.event_expenses where description='atomic expense')),
  1,
  'expense emits one audit'
);

reset role;
create or replace function public.test_reject_event_atomic_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action in (
    'event.created','event.updated','event.registration_created',
    'event.registration_updated','event.expense_created'
  ) then
    raise exception 'SYNTHETIC_EVENT_AUDIT_FAILURE' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger test_reject_event_atomic_audit
before insert on public.audit_events
for each row execute function public.test_reject_event_atomic_audit();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fb000000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.create_event_atomic(
    'Rollback Event','rollback','group',
    '2035-03-01T18:00:00Z','2035-03-01T20:00:00Z','Room R','in_person',4,1000
  ) $$,
  '55000','SYNTHETIC_EVENT_AUDIT_FAILURE',
  'audit failure rolls back event create'
);
select is((select count(*)::int from public.events where title='Rollback Event'),0,'failed event create leaves no row');

select throws_ok(
  $$ select public.update_event_atomic(
    'fb100000-0000-4000-8000-000000000001','Rollback Updated Title',
    '2035-02-10T19:00:00Z','2035-02-10T21:00:00Z',2,'online','Room R',7000
  ) $$,
  '55000','SYNTHETIC_EVENT_AUDIT_FAILURE',
  'audit failure rolls back event update'
);
select is(
  (select title from public.events where id='fb100000-0000-4000-8000-000000000001'),
  'Atomic Base Event Updated',
  'failed event update preserves prior title'
);

select throws_ok(
  $$ select public.register_event_participant_atomic(
    'fb100000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    5500,'pending_payment'
  ) $$,
  '55000','SYNTHETIC_EVENT_AUDIT_FAILURE',
  'audit failure rolls back registration and receivable'
);
select is(
  (select count(*)::int from public.event_registrations
   where event_id='fb100000-0000-4000-8000-000000000001'
     and person_id='d0000000-0000-4000-8000-000000000002'),
  0,
  'failed registration leaves no registration'
);
select is(
  (select count(*)::int from public.receivables
   where source_type='event_registration'
     and person_id='d0000000-0000-4000-8000-000000000002'),
  0,
  'failed registration leaves no receivable'
);

select throws_ok(
  $$ select public.update_event_registration_atomic(
    (select id from public.event_registrations
     where event_id='fb100000-0000-4000-8000-000000000001'
       and person_id='d0000000-0000-4000-8000-000000000001'),
    'cancelled','absent'
  ) $$,
  '55000','SYNTHETIC_EVENT_AUDIT_FAILURE',
  'audit failure rolls back registration update'
);
select is(
  (select status||'|'||attendance_status from public.event_registrations
   where event_id='fb100000-0000-4000-8000-000000000001'
     and person_id='d0000000-0000-4000-8000-000000000001'),
  'confirmed|present',
  'failed registration update preserves prior state'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fb000000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);
select lives_ok(
  $ select public.create_event_expense_atomic(
    'fb100000-0000-4000-8000-000000000001','accounting permitted expense',1400,null
  ) $,
  'accounting retains prior expense access under RLS'
);

select throws_ok(
  $ select public.create_event_atomic(
    'Accounting Forbidden Event','forbidden','group',
    '2035-03-02T18:00:00Z','2035-03-02T20:00:00Z','Room F','online',4,1000
  ) $$,
  '42501','EVENT_MANAGE_FORBIDDEN',
  'accounting cannot manage events'
);

reset role;
select * from finish();
rollback;
