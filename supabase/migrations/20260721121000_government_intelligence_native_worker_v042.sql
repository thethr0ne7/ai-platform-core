begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.gi_dispatch_crawl_jobs(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  r record;
  v_request_id bigint;
  v_count integer := 0;
begin
  for r in
    select j.id, j.payload, e.url
    from public.gi_crawl_jobs j
    join public.gi_source_endpoints e on e.id = j.endpoint_id and e.active = true
    where j.status in ('pending', 'retry')
      and j.scheduled_at <= now()
      and j.attempts < j.max_attempts
      and (j.locked_at is null or j.locked_at < now() - interval '20 minutes')
    order by j.priority asc, j.scheduled_at asc, j.created_at asc
    for update of j skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  loop
    begin
      v_request_id := net.http_get(
        url := r.url,
        headers := jsonb_build_object(
          'User-Agent', 'GovernmentIntelligenceBot/0.42',
          'Accept', 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1'
        ),
        timeout_milliseconds := 45000
      );

      update public.gi_crawl_jobs
      set status = 'running',
          attempts = attempts + 1,
          locked_at = now(),
          locked_by = 'pg_net_native_worker',
          started_at = coalesce(started_at, now()),
          payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
            'request_id', v_request_id,
            'endpoint_url', r.url,
            'dispatched_at', now()
          ),
          updated_at = now()
      where id = r.id;

      v_count := v_count + 1;
    exception when others then
      update public.gi_crawl_jobs
      set status = case when attempts + 1 >= max_attempts then 'dead_letter' else 'retry' end,
          attempts = attempts + 1,
          last_error = left(sqlerrm, 4000),
          scheduled_at = now() + interval '15 minutes',
          locked_at = null,
          locked_by = null,
          updated_at = now()
      where id = r.id;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.gi_dispatch_crawl_jobs(integer) from public, anon, authenticated;
grant execute on function public.gi_dispatch_crawl_jobs(integer) to service_role, postgres;

create or replace function public.gi_collect_crawl_results(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  r record;
  v_text text;
  v_hash text;
  v_title text;
  v_prev_version_id uuid;
  v_prev_hash text;
  v_prev_text text;
  v_document_id uuid;
  v_current_version_id uuid;
  v_current_version_no integer;
  v_change_ratio numeric;
  v_signal_type text;
  v_signal_title text;
  v_signal_key text;
  v_success integer := 0;
  v_retry integer := 0;
  v_dead integer := 0;
  v_unchanged integer := 0;
begin
  for r in
    select
      j.id as job_id,
      j.source_id,
      j.endpoint_id,
      j.attempts,
      j.max_attempts,
      j.payload,
      s.source_key,
      s.name as source_name,
      s.authority,
      s.level,
      s.region,
      s.category_code,
      s.trust_tier,
      e.url,
      e.endpoint_type,
      e.parser_hint,
      h.status_code,
      h.content_type,
      h.content,
      h.timed_out,
      h.error_msg
    from public.gi_crawl_jobs j
    join public.gi_official_sources s on s.id = j.source_id
    left join public.gi_source_endpoints e on e.id = j.endpoint_id
    join net._http_response h on h.id = (j.payload->>'request_id')::bigint
    where j.status = 'running'
    order by h.created asc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    begin
      if coalesce(r.timed_out, false) or r.error_msg is not null or r.status_code not between 200 and 299 then
        raise exception 'fetch_failed status=% timeout=% error=%', r.status_code, r.timed_out, coalesce(r.error_msg, 'none');
      end if;

      if r.content_type !~* '(text/html|text/plain|application/json)' then
        raise exception 'unsupported_content_type:%', coalesce(r.content_type, 'unknown');
      end if;

      v_text := coalesce(r.content, '');
      if r.content_type ~* 'text/html' then
        v_text := regexp_replace(v_text, '<script[^>]*>[\s\S]*?</script>', ' ', 'gi');
        v_text := regexp_replace(v_text, '<style[^>]*>[\s\S]*?</style>', ' ', 'gi');
        v_text := regexp_replace(v_text, '<noscript[^>]*>[\s\S]*?</noscript>', ' ', 'gi');
        v_text := regexp_replace(v_text, '<br\s*/?>', E'\n', 'gi');
        v_text := regexp_replace(v_text, '</(p|div|li|h[1-6])>', E'\n', 'gi');
        v_text := regexp_replace(v_text, '<[^>]+>', ' ', 'g');
      end if;
      v_text := replace(replace(replace(replace(v_text, '&nbsp;', ' '), '&amp;', '&'), '&quot;', '"'), '&#39;', '''');
      v_text := regexp_replace(v_text, '[\t\f\v ]+', ' ', 'g');
      v_text := regexp_replace(v_text, E' *\n *', E'\n', 'g');
      v_text := regexp_replace(v_text, E'\n{3,}', E'\n\n', 'g');
      v_text := btrim(v_text);

      if length(v_text) < 100 then
        raise exception 'content_too_short:%', length(v_text);
      end if;

      select d.id, v.id, v.content_hash, v.extracted_text
      into v_document_id, v_prev_version_id, v_prev_hash, v_prev_text
      from public.gi_source_documents d
      left join lateral (
        select sv.id, sv.content_hash, sv.extracted_text
        from public.gi_source_versions sv
        where sv.document_id = d.id
        order by sv.version_no desc
        limit 1
      ) v on true
      where d.canonical_url = r.url;

      v_hash := encode(extensions.digest(v_text, 'sha256'), 'hex');

      if v_prev_hash = v_hash then
        update public.gi_crawl_jobs
        set status = 'succeeded',
            result = jsonb_build_object('unchanged', true, 'content_hash', v_hash),
            finished_at = now(), locked_at = null, locked_by = null,
            last_error = null, updated_at = now()
        where id = r.job_id;
        update public.gi_source_endpoints set last_checked_at = now(), last_success_at = now(), updated_at = now() where id = r.endpoint_id;
        update public.gi_official_sources set last_checked_at = now(), last_success_at = now(), status = 'active', updated_at = now() where id = r.source_id;
        v_unchanged := v_unchanged + 1;
        continue;
      end if;

      v_title := substring(regexp_replace(coalesce(r.content, ''), '[\s\S]*?<title[^>]*>([\s\S]*?)</title>[\s\S]*', '\1', 'i') for 500);
      if v_title is null or v_title = '' or v_title = r.content then v_title := r.source_name; end if;

      perform public.gi_persist_source_evidence(jsonb_build_object(
        'source_id', r.source_key,
        'canonical_url', r.url,
        'title', v_title,
        'authority', r.authority,
        'checked_at', now(),
        'content_hash', v_hash,
        'extracted_text', v_text,
        'extraction_method', case when r.content_type ~* 'text/html' then 'html_sql' else 'native_sql' end,
        'citations', jsonb_build_array(jsonb_build_object('locator', 'body', 'quote', left(v_text, 700))),
        'metadata', jsonb_build_object(
          'ingestion_runtime', 'supabase-native-worker-v0.42',
          'category_code', r.category_code,
          'endpoint_type', r.endpoint_type,
          'parser_hint', r.parser_hint,
          'trust_tier', r.trust_tier,
          'http_status', r.status_code,
          'content_type', r.content_type,
          'crawl_job_id', r.job_id
        )
      ));

      select d.id, v.id, v.version_no
      into v_document_id, v_current_version_id, v_current_version_no
      from public.gi_source_documents d
      join lateral (
        select sv.id, sv.version_no
        from public.gi_source_versions sv
        where sv.document_id = d.id
        order by sv.version_no desc
        limit 1
      ) v on true
      where d.canonical_url = r.url;

      if v_prev_version_id is not null and v_current_version_id <> v_prev_version_id then
        v_change_ratio := least(1::numeric, abs(length(v_text) - length(coalesce(v_prev_text, '')))::numeric / greatest(1, length(v_text), length(coalesce(v_prev_text, ''))));
        insert into public.gi_change_events(
          document_id, from_version_id, to_version_id, change_type, severity, summary, diff, metadata
        ) values (
          v_document_id,
          v_prev_version_id,
          v_current_version_id,
          'content_changed',
          case when v_change_ratio > 0.25 then 'high' when v_change_ratio > 0.08 then 'medium' else 'low' end,
          format('Изменение текста: %s%%', round(v_change_ratio * 100, 1)),
          jsonb_build_object(
            'before_chars', length(coalesce(v_prev_text, '')),
            'after_chars', length(v_text),
            'change_ratio', v_change_ratio
          ),
          jsonb_build_object('source_key', r.source_key, 'url', r.url)
        );
      end if;

      v_signal_type := null;
      if v_text ~* '(субсид|грант|отбор получател)' then
        v_signal_type := 'support_opportunity';
        v_signal_title := 'Обнаружена мера государственной поддержки';
      elsif v_text ~* '(льготн.{0,20}(кредит|заем|лизинг)|промышленн.{0,10}ипотек)' then
        v_signal_type := 'preferential_finance';
        v_signal_title := 'Обнаружено льготное финансирование';
      elsif v_text ~* '(проект постановлен|проект приказ|общественн.{0,15}обсужден)' then
        v_signal_type := 'regulatory_early_signal';
        v_signal_title := 'Ранний регуляторный сигнал';
      elsif v_text ~* '(закупк|извещение|план-график)' then
        v_signal_type := 'procurement_demand';
        v_signal_title := 'Сигнал государственного спроса';
      end if;

      if v_signal_type is not null then
        v_signal_key := v_signal_type || ':' || r.source_key || ':' || left(v_hash, 16);
        insert into public.gi_analytic_signals(
          signal_key, signal_type, title, summary, level, region, sectors,
          horizon_months, confidence, status, first_detected_at, last_confirmed_at,
          rationale, metadata
        ) values (
          v_signal_key,
          v_signal_type,
          v_signal_title,
          format('Сигнал выявлен в официальном источнике %s.', r.source_name),
          r.level,
          r.region,
          array[coalesce(r.category_code, 'general')],
          case when v_signal_type = 'regulatory_early_signal' then 18 else 6 end,
          case when coalesce(r.trust_tier, 3) = 1 then 0.82 when coalesce(r.trust_tier, 3) = 2 then 0.74 else 0.64 end,
          'active',
          now(), now(),
          jsonb_build_object('source_key', r.source_key, 'matched_by', 'rule_classifier_v042'),
          jsonb_build_object('document_id', v_document_id, 'version_id', v_current_version_id, 'url', r.url)
        )
        on conflict (signal_key) do update set
          last_confirmed_at = excluded.last_confirmed_at,
          confidence = greatest(public.gi_analytic_signals.confidence, excluded.confidence),
          metadata = public.gi_analytic_signals.metadata || excluded.metadata,
          updated_at = now();
      end if;

      update public.gi_crawl_jobs
      set status = 'succeeded',
          result = jsonb_build_object(
            'document_id', v_document_id,
            'version_id', v_current_version_id,
            'version_no', v_current_version_no,
            'content_hash', v_hash,
            'signal_type', v_signal_type
          ),
          finished_at = now(), locked_at = null, locked_by = null,
          last_error = null, updated_at = now()
      where id = r.job_id;

      update public.gi_source_endpoints set last_checked_at = now(), last_success_at = now(), updated_at = now() where id = r.endpoint_id;
      update public.gi_official_sources set last_checked_at = now(), last_success_at = now(), status = 'active', updated_at = now() where id = r.source_id;
      v_success := v_success + 1;

    exception when others then
      if r.attempts >= r.max_attempts then
        update public.gi_crawl_jobs
        set status = 'dead_letter', last_error = left(sqlerrm, 4000),
            finished_at = now(), locked_at = null, locked_by = null, updated_at = now()
        where id = r.job_id;
        v_dead := v_dead + 1;
      else
        update public.gi_crawl_jobs
        set status = 'retry', last_error = left(sqlerrm, 4000),
            scheduled_at = now() + make_interval(mins => least(360, 15 * (2 ^ greatest(0, r.attempts - 1)))),
            locked_at = null, locked_by = null, updated_at = now()
        where id = r.job_id;
        v_retry := v_retry + 1;
      end if;
      update public.gi_source_endpoints set last_checked_at = now(), updated_at = now() where id = r.endpoint_id;
      update public.gi_official_sources set last_checked_at = now(), status = 'degraded', updated_at = now() where id = r.source_id;
    end;
  end loop;

  return jsonb_build_object('succeeded', v_success, 'unchanged', v_unchanged, 'retry', v_retry, 'dead_letter', v_dead);
end;
$$;

revoke all on function public.gi_collect_crawl_results(integer) from public, anon, authenticated;
grant execute on function public.gi_collect_crawl_results(integer) to service_role, postgres;

create or replace function public.gi_recover_stale_crawl_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.gi_crawl_jobs
  set status = case when attempts >= max_attempts then 'dead_letter' else 'retry' end,
      last_error = coalesce(last_error, 'stale_worker_lock'),
      scheduled_at = now() + interval '15 minutes',
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where status = 'running' and locked_at < now() - interval '30 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.gi_recover_stale_crawl_jobs() from public, anon, authenticated;
grant execute on function public.gi_recover_stale_crawl_jobs() to service_role, postgres;

do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname in ('gi-dispatch-crawl-v042','gi-collect-crawl-v042','gi-recover-stale-v042') loop
    perform cron.unschedule(v_job);
  end loop;
end;
$$;

select cron.schedule('gi-dispatch-crawl-v042', '*/5 * * * *', $cron$select public.gi_dispatch_crawl_jobs(5);$cron$);
select cron.schedule('gi-collect-crawl-v042', '*/2 * * * *', $cron$select public.gi_collect_crawl_results(25);$cron$);
select cron.schedule('gi-recover-stale-v042', '*/15 * * * *', $cron$select public.gi_recover_stale_crawl_jobs();$cron$);

commit;
