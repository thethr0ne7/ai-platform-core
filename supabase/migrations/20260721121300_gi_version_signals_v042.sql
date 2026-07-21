begin;
create or replace function public.gi_on_source_version_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_prev record; v_doc record; v_signal_type text; v_signal_title text; v_signal_key text;
begin
  select id,extracted_text into v_prev
  from public.gi_source_versions
  where document_id=new.document_id and version_no<new.version_no
  order by version_no desc limit 1;

  select d.id,d.canonical_url,d.source_key,s.name source_name,s.level,s.region,s.category_code,s.trust_tier
  into v_doc
  from public.gi_source_documents d
  join public.gi_official_sources s on s.id=d.source_id
  where d.id=new.document_id;

  if v_prev.id is not null then
    insert into public.gi_change_events(document_id,from_version_id,to_version_id,change_type,severity,summary,diff,metadata)
    values(
      new.document_id,v_prev.id,new.id,'content_changed',
      case when abs(length(coalesce(new.extracted_text,''))-length(coalesce(v_prev.extracted_text,'')))>5000 then 'high'
           when abs(length(coalesce(new.extracted_text,''))-length(coalesce(v_prev.extracted_text,'')))>1000 then 'medium'
           else 'low' end,
      'Обнаружена новая версия официального документа',
      jsonb_build_object('before_chars',length(coalesce(v_prev.extracted_text,'')),'after_chars',length(coalesce(new.extracted_text,''))),
      jsonb_build_object('source_key',v_doc.source_key,'url',v_doc.canonical_url)
    );
  end if;

  if coalesce(new.extracted_text,'')~*'(субсид|грант|отбор получател)' then
    v_signal_type:='support_opportunity'; v_signal_title:='Обнаружена мера государственной поддержки';
  elsif coalesce(new.extracted_text,'')~*'(льготн.{0,20}(кредит|заем|лизинг)|промышленн.{0,10}ипотек)' then
    v_signal_type:='preferential_finance'; v_signal_title:='Обнаружено льготное финансирование';
  elsif coalesce(new.extracted_text,'')~*'(проект постановлен|проект приказ|общественн.{0,15}обсужден)' then
    v_signal_type:='regulatory_early_signal'; v_signal_title:='Ранний регуляторный сигнал';
  elsif coalesce(new.extracted_text,'')~*'(закупк|извещение|план-график)' then
    v_signal_type:='procurement_demand'; v_signal_title:='Сигнал государственного спроса';
  end if;

  if v_signal_type is not null then
    v_signal_key:=v_signal_type||':'||v_doc.source_key||':'||left(new.content_hash,16);
    insert into public.gi_analytic_signals(
      signal_key,signal_type,title,summary,level,region,sectors,horizon_months,confidence,status,
      first_detected_at,last_confirmed_at,rationale,metadata
    ) values(
      v_signal_key,v_signal_type,v_signal_title,
      format('Сигнал выявлен в официальном источнике %s.',v_doc.source_name),
      v_doc.level,v_doc.region,array[coalesce(v_doc.category_code,'general')],
      case when v_signal_type='regulatory_early_signal' then 18 else 6 end,
      case when coalesce(v_doc.trust_tier,3)=1 then 0.82 when coalesce(v_doc.trust_tier,3)=2 then 0.74 else 0.64 end,
      'active',now(),now(),
      jsonb_build_object('source_key',v_doc.source_key,'matched_by','version_trigger_v042'),
      jsonb_build_object('document_id',new.document_id,'version_id',new.id,'url',v_doc.canonical_url)
    ) on conflict(signal_key) do update set
      last_confirmed_at=excluded.last_confirmed_at,
      confidence=greatest(public.gi_analytic_signals.confidence,excluded.confidence),
      metadata=public.gi_analytic_signals.metadata||excluded.metadata,
      updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists gi_source_version_insert_trigger on public.gi_source_versions;
create trigger gi_source_version_insert_trigger
after insert on public.gi_source_versions
for each row execute function public.gi_on_source_version_insert();
commit;
