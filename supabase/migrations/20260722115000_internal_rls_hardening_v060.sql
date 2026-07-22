begin;

alter table public.learning_events enable row level security;
alter table public.learned_skills enable row level security;
alter table public.skill_versions enable row level security;

revoke all on table public.learning_events from anon,authenticated;
revoke all on table public.learned_skills from anon,authenticated;
revoke all on table public.skill_versions from anon,authenticated;

revoke execute on function public.gi_enrich_project_report(uuid,bigint,jsonb) from public,anon,authenticated;
revoke execute on function public.gi_on_source_version_insert() from public,anon,authenticated;
revoke execute on function public.gi_sanitize_source_document() from public,anon,authenticated;

grant execute on function public.gi_enrich_project_report(uuid,bigint,jsonb) to service_role,postgres;
grant execute on function public.gi_on_source_version_insert() to service_role,postgres;
grant execute on function public.gi_sanitize_source_document() to service_role,postgres;

commit;
