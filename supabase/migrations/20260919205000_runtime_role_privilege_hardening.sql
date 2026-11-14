-- owners: audit,forms
-- cross-module-task: docs/task-contracts/runtime-role-privilege-hardening-20260926.json

-- Supabase local/runtime defaults may evolve across CLI releases. Security-sensitive
-- tables must therefore declare the effective runtime grants explicitly instead of
-- depending on bootstrap defaults.

revoke all on public.audit_events from authenticated;
grant insert, select on public.audit_events to authenticated;

revoke all on public.form_templates from service_role;
revoke all on public.form_template_versions from service_role;
revoke all on public.form_submissions from service_role;

grant select on public.form_templates to service_role;
grant select on public.form_template_versions to service_role;
grant select on public.form_submissions to service_role;
