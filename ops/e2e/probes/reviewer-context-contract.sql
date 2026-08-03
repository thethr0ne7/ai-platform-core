-- Read-only production probe for contextual reviewer evidence.
with active_reviewer as (
  select telegram_user_id
  from public.gi_evidence_reviewers
  where active=true
  order by telegram_user_id
  limit 1
), tasks as (
  select t.*
  from active_reviewer r
  cross join lateral public.gi_list_evidence_review_tasks(r.telegram_user_id,100) t
), checks as (
  select
    'ready_quote_inside_excerpt'::text as check_name,
    case when exists(
      select 1 from tasks
      where verification_ready=true
        and candidate_quote_found=true
        and position(candidate_quote in source_text_excerpt)>0
        and source_excerpt_start is not null
        and source_excerpt_end is not null
        and length(source_text_excerpt)<source_text_total_length
    ) then 'PASS' else 'FAIL' end as result,
    'Every verification-ready task must expose a bounded context containing its exact quote.'::text as detail
  union all
  select
    'missing_quote_exposes_no_text',
    case when not exists(
      select 1 from tasks
      where task_type='quote_locator'
        and length(btrim(coalesce(candidate_quote,'')))<40
        and length(coalesce(source_text_excerpt,''))>0
    ) then 'PASS' else 'FAIL' end,
    'Quote tasks without an exact candidate must not expose an arbitrary source prefix.'
  union all
  select
    'unmatched_quote_cannot_verify',
    case when not exists(
      select 1 from tasks
      where task_type='quote_locator'
        and candidate_quote_found=false
        and verification_ready=true
    ) then 'PASS' else 'FAIL' end,
    'An unmatched candidate quote must fail closed.'
  union all
  select
    'legacy_6000_prefix_removed',
    case when position(
      'left(coalesce(ver.extracted_text,''''),6000)'
      in pg_get_functiondef('public.gi_list_evidence_review_tasks(bigint,integer)'::regprocedure)
    )=0 then 'PASS' else 'FAIL' end,
    'The reviewer RPC must not return the first 6000 source characters.'
)
select * from checks order by check_name;
