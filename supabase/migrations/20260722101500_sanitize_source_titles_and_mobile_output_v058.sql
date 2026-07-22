create or replace function public.gi_clean_display_text(p_value text, p_fallback text default null)
returns text
language plpgsql
immutable
as $$
declare
  v_text text := coalesce(p_value, '');
begin
  v_text := split_part(v_text, '<', 1);
  v_text := regexp_replace(v_text, E'[\r\n\t]+', ' ', 'g');
  v_text := regexp_replace(v_text, '\s+', ' ', 'g');
  v_text := btrim(v_text);

  if lower(v_text) ~ '(\sfunction\s|\s\(function\s|\swindow\.|\sdocument\.|\svar\s|\sconst\s|\slet\s)' then
    v_text := regexp_replace(v_text, '(?is)(\sfunction\s|\s\(function\s|\swindow\.|\sdocument\.|\svar\s|\sconst\s|\slet\s).*$', '');
  end if;

  v_text := btrim(v_text);
  if length(v_text) > 160 then
    v_text := left(v_text, 157) || '…';
  end if;

  return coalesce(nullif(v_text, ''), nullif(btrim(coalesce(p_fallback, '')), ''), 'Официальный документ');
end;
$$;

create or replace function public.gi_sanitize_source_document()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_name text;
begin
  select name into v_source_name
  from public.gi_official_sources
  where id = new.source_id;

  new.title := public.gi_clean_display_text(new.title, v_source_name);
  if new.authority is not null then
    new.authority := public.gi_clean_display_text(new.authority, v_source_name);
  end if;
  return new;
end;
$$;

drop trigger if exists gi_source_documents_sanitize on public.gi_source_documents;
create trigger gi_source_documents_sanitize
before insert or update of title, authority, source_id
on public.gi_source_documents
for each row execute function public.gi_sanitize_source_document();

update public.gi_source_documents d
set title = public.gi_clean_display_text(d.title, s.name),
    authority = case when d.authority is null then null else public.gi_clean_display_text(d.authority, s.name) end
from public.gi_official_sources s
where s.id = d.source_id;

create or replace function public.gi_normalize_change_event()
returns trigger
language plpgsql
as $$
begin
  if new.change_type = 'content_changed' then
    new.change_type := 'amended';
  end if;
  new.summary := public.gi_clean_display_text(new.summary, 'Обнаружена новая версия официального документа');
  return new;
end;
$$;

drop trigger if exists gi_change_events_normalize on public.gi_change_events;
create trigger gi_change_events_normalize
before insert or update of change_type, summary
on public.gi_change_events
for each row execute function public.gi_normalize_change_event();

update public.gi_change_events
set change_type = case when change_type = 'content_changed' then 'amended' else change_type end,
    summary = public.gi_clean_display_text(summary, 'Обнаружена новая версия официального документа');
