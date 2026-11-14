-- owners: appointments,audit
-- cross-module-task: docs/task-contracts/appointment-status-atomic-209.json
-- allow-static-routines: true

create or replace function public.transition_staff_appointment_atomic(
  p_appointment_id uuid, p_expected_status text, p_command text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  original public.appointments%rowtype;
  updated public.appointments%rowtype;
  next_status text;
  needed_permission text;
  action_name text;
  audit_metadata jsonb;
begin
  if actor is null or public.current_app_role() not in ('psychologist_owner','secretary') then
    raise exception 'APPOINTMENT_STATUS_FORBIDDEN' using errcode = '42501';
  end if;
  select * into original from public.appointments where id=p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_status is null or original.status <> p_expected_status then
    raise exception 'APPOINTMENT_STATUS_CONFLICT' using errcode = '40001';
  end if;
  select transitions.to_status into next_status from (values
    ('scheduled','send_confirmation','pending_confirmation'),
    ('scheduled','cancel_in_time','cancelled_in_time'),
    ('scheduled','cancel_late','cancelled_late'),
    ('scheduled','cancel_by_provider','cancelled_by_provider'),
    ('pending_confirmation','confirm','confirmed'),
    ('pending_confirmation','request_reschedule','reschedule_requested'),
    ('pending_confirmation','cancel_in_time','cancelled_in_time'),
    ('pending_confirmation','cancel_late','cancelled_late'),
    ('pending_confirmation','cancel_by_provider','cancelled_by_provider'),
    ('confirmed','check_in','checked_in'),
    ('confirmed','request_reschedule','reschedule_requested'),
    ('confirmed','mark_no_show','no_show'),
    ('confirmed','cancel_in_time','cancelled_in_time'),
    ('confirmed','cancel_late','cancelled_late'),
    ('confirmed','cancel_by_provider','cancelled_by_provider'),
    ('checked_in','start','in_progress'),
    ('checked_in','cancel_by_provider','cancelled_by_provider'),
    ('in_progress','complete','completed'),
    ('reschedule_requested','reschedule','rescheduled'),
    ('reschedule_requested','cancel_by_provider','cancelled_by_provider'),
    ('rescheduled','send_confirmation','pending_confirmation'),
    ('rescheduled','confirm','confirmed'),
    ('rescheduled','request_reschedule','reschedule_requested'),
    ('rescheduled','cancel_in_time','cancelled_in_time'),
    ('rescheduled','cancel_late','cancelled_late'),
    ('rescheduled','cancel_by_provider','cancelled_by_provider')
  ) as transitions(from_status, command, to_status)
  where transitions.from_status=original.status and transitions.command=p_command;
  if next_status is null then
    raise exception 'INVALID_APPOINTMENT_TRANSITION' using errcode = '22023';
  end if;
  needed_permission := case p_command
    when 'send_confirmation' then 'appointments.confirm'
    when 'confirm' then 'appointments.confirm'
    when 'check_in' then 'appointments.checkin'
    when 'start' then 'clinical.create'
    when 'request_reschedule' then 'appointments.reschedule'
    when 'reschedule' then 'appointments.reschedule'
    when 'cancel_in_time' then 'appointments.cancel'
    when 'cancel_late' then 'appointments.cancel'
    when 'cancel_by_provider' then 'appointments.cancel'
    when 'mark_no_show' then 'appointments.no_show'
    when 'complete' then 'appointments.complete'
    else null
  end;
  if needed_permission is null or not public.has_permission(needed_permission) then
    raise exception 'APPOINTMENT_STATUS_FORBIDDEN' using errcode = '42501';
  end if;
  if p_command in ('start','complete') and (
    public.current_aal() <> 'aal2' or not public.has_permission('clinical.create')
  ) then
    raise exception 'APPOINTMENT_CLINICAL_FORBIDDEN' using errcode = '42501';
  end if;

  update public.appointments set status=next_status
  where id=p_appointment_id returning * into updated;

  insert into public.appointment_status_history (
    appointment_id, from_status, to_status, changed_by_user_id
  ) values (p_appointment_id, original.status, next_status, actor);

  action_name := case p_command
    when 'start' then 'appointment.care_started'
    when 'complete' then 'appointment.care_completed'
    else 'appointment.status_changed'
  end;
  audit_metadata := case
    when p_command in ('start','complete') then
      jsonb_build_object('personId', updated.person_id)
    else jsonb_build_object(
      'fromStatus', original.status, 'toStatus', next_status, 'command', p_command
    )
  end;
  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, correlation_id, metadata
  ) values (
    actor, action_name, 'appointment', p_appointment_id,
    p_appointment_id::text, audit_metadata
  );
  return next_status;
end;
$$;

revoke all on function public.transition_staff_appointment_atomic(uuid,text,text) from public, anon;
grant execute on function public.transition_staff_appointment_atomic(uuid,text,text) to authenticated;
