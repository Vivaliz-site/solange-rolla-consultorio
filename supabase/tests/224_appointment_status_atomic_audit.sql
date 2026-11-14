begin;
select plan(13);

select has_function('public','transition_staff_appointment_atomic',array['uuid','text','text'],'staff status RPC exists');
select ok(has_function_privilege('authenticated','public.transition_staff_appointment_atomic(uuid,text,text)','execute'),'authenticated can execute staff RPC');
select ok(not has_function_privilege('anon','public.transition_staff_appointment_atomic(uuid,text,text)','execute'),'anon cannot execute staff RPC');

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values ('aa209000-0000-4000-8000-000000000001','authenticated','authenticated','appointment-atomic-owner@example.test','synthetic',now(),'{}','{}');
insert into public.profiles (user_id,role,display_name,active)
values ('aa209000-0000-4000-8000-000000000001','psychologist_owner','Appointment Atomic Owner',true);
insert into public.appointments
  (id,person_id,service_id,starts_at,ends_at,status,policy_version,cancellation_deadline_at,business_timezone,cancellation_policy_snapshot)
values
  ('aa209000-0000-4000-8000-000000000010','d0000000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001',
  now()+interval '2 days',now()+interval '2 days 50 minutes','scheduled',1,
  now()+interval '1 day','America/Sao_Paulo','{}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aa209000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',true);

select is(public.transition_staff_appointment_atomic(
  'aa209000-0000-4000-8000-000000000010','scheduled','send_confirmation'
),'pending_confirmation','successful transition');
select is((select count(*)::int from public.appointment_status_history where appointment_id='aa209000-0000-4000-8000-000000000010'),1,'exactly one history');
select is((select count(*)::int from public.audit_events where entity_id='aa209000-0000-4000-8000-000000000010' and action='appointment.status_changed'),1,'exactly one audit');

select throws_ok($$ select public.transition_staff_appointment_atomic(
  'aa209000-0000-4000-8000-000000000010','scheduled','send_confirmation') $$,
  '40001','APPOINTMENT_STATUS_CONFLICT','concurrent stale status refused');
reset role;

create or replace function public.test_reject_appointment_atomic_audit()
returns trigger language plpgsql as $$
begin
  if new.action='appointment.status_changed'
     and new.entity_id='aa209000-0000-4000-8000-000000000010' then
    raise exception 'SYNTHETIC_APPOINTMENT_AUDIT_FAILURE' using errcode='55000';
  end if;
  return new;
end;
$$;
create trigger test_reject_appointment_atomic_audit
before insert on public.audit_events for each row
execute function public.test_reject_appointment_atomic_audit();

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aa209000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',true);
select throws_ok($$ select public.transition_staff_appointment_atomic(
  'aa209000-0000-4000-8000-000000000010','pending_confirmation','confirm') $$,
  '55000','SYNTHETIC_APPOINTMENT_AUDIT_FAILURE','audit failure aborts status/history');
select is((select status from public.appointments where id='aa209000-0000-4000-8000-000000000010'),'pending_confirmation','rollback restores appointment status');
select is((select count(*)::int from public.appointment_status_history where appointment_id='aa209000-0000-4000-8000-000000000010'),1,'rollback does not insert history');
select is((select count(*)::int from public.audit_events where entity_id='aa209000-0000-4000-8000-000000000010'),1,'rollback does not insert audit');
select throws_ok($$ select public.transition_staff_appointment_atomic(
  'aa209000-0000-4000-8000-000000000010','pending_confirmation','complete') $$,
  '22023','INVALID_APPOINTMENT_TRANSITION','invalid domain transition denied');
reset role;
drop trigger test_reject_appointment_atomic_audit on public.audit_events;
drop function public.test_reject_appointment_atomic_audit();

set local role anon;
select throws_ok($$ select public.transition_staff_appointment_atomic(
  'aa209000-0000-4000-8000-000000000010','pending_confirmation','confirm') $$,
  '42501',null,'anonymous cannot invoke staff RPC');
reset role;

select * from finish();
rollback;
