create or replace function public.gi_get_source_catalog_for_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with source_rows as (
    select
      s.source_key,
      s.name,
      s.authority,
      s.level,
      s.region,
      s.base_url as url,
      s.status as technical_status,
      s.active,
      s.last_checked_at,
      s.last_success_at,
      h.status as health_status,
      h.error_type,
      h.last_error,
      h.adapter_used,
      h.success_rate,
      h.trust_score,
      h.next_retry_at,
      count(distinct d.id) as documents_count,
      count(distinct v.id) as versions_count,
      count(distinct er.id) as evidence_count
    from public.gi_official_sources s
    left join public.gi_source_health h on h.source_id = s.id
    left join public.gi_source_documents d on d.source_id = s.id
    left join public.gi_source_versions v on v.document_id = d.id
    left join public.gi_evidence_records er on er.source_version_id = v.id
    where s.active = true
    group by s.id, h.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_key', source_key,
    'name', name,
    'authority', authority,
    'level', level,
    'region', region,
    'url', url,
    'status', case
      when technical_status = 'active' and documents_count > 0 then format('Работает · документов: %s', documents_count)
      when technical_status = 'active' then 'Работает'
      when documents_count > 0 and technical_status in ('degraded','blocked') then format('Данные сохранены · документов: %s · обновление задержано', documents_count)
      when technical_status = 'blocked' then 'Доступ ограничен сайтом'
      when technical_status = 'degraded' and error_type = 'timeout' then 'Сайт отвечает слишком медленно'
      when technical_status = 'degraded' and error_type = 'dns_error' then 'Адрес сайта временно не определяется'
      when technical_status = 'degraded' and error_type = 'tls_error' then 'Ошибка сертификата сайта'
      when technical_status = 'degraded' and error_type = 'http_503' then 'Сайт временно перегружен'
      when technical_status = 'degraded' then 'Временно недоступен'
      when technical_status = 'pending' then 'Проверяется'
      else 'Состояние уточняется'
    end,
    'technical_status', technical_status,
    'data_available', documents_count > 0,
    'documents_count', documents_count,
    'versions_count', versions_count,
    'evidence_count', evidence_count,
    'last_checked_at', last_checked_at,
    'last_success_at', last_success_at,
    'health_status', health_status,
    'error_type', error_type,
    'error_label', case error_type
      when 'access_blocked' then 'Сайт ограничивает доступ из облачных сетей'
      when 'timeout' then 'Сайт отвечает слишком медленно'
      when 'dns_error' then 'Адрес сайта временно не определяется'
      when 'tls_error' then 'Ошибка сертификата сайта'
      when 'http_503' then 'Сайт временно перегружен'
      when 'network_error' then 'Сетевая ошибка'
      else null
    end,
    'last_error', last_error,
    'adapter_used', adapter_used,
    'success_rate', success_rate,
    'trust_score', trust_score,
    'next_retry_at', next_retry_at
  ) order by
    case when technical_status = 'active' then 0 when documents_count > 0 then 1 when technical_status = 'pending' then 2 when technical_status = 'degraded' then 3 else 4 end,
    case level when 'regional' then 0 when 'federal' then 1 else 2 end,
    name), '[]'::jsonb)
  from source_rows;
$$;

update public.gi_project_reports
set sources = public.gi_get_source_catalog_for_report(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source_health_engine','official-source-ingestion-v0.59','source_catalog_updated_at',now())
where status in ('completed','partial','ready');
