begin;

create table if not exists public.gi_measure_directions (
  id uuid primary key default gen_random_uuid(),
  measure_id uuid not null references public.gi_support_measures(id) on delete cascade,
  direction_code text not null,
  title text not null,
  description text not null,
  sector_tags text[] not null default '{}'::text[],
  expense_tags text[] not null default '{}'::text[],
  search_terms text[] not null default '{}'::text[],
  source_version_id uuid references public.gi_source_versions(id) on delete set null,
  source_locator text,
  evidence_quote text,
  extraction_status text not null default 'machine_match',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gi_measure_directions_measure_code_key unique(measure_id,direction_code),
  constraint gi_measure_directions_status_check
    check(extraction_status in ('machine_match','human_verified','needs_review','rejected'))
);

create index if not exists gi_measure_directions_measure_active_idx
  on public.gi_measure_directions(measure_id,active,direction_code);
create index if not exists gi_measure_directions_source_version_idx
  on public.gi_measure_directions(source_version_id)
  where source_version_id is not null;
create index if not exists gi_measure_directions_sector_tags_idx
  on public.gi_measure_directions using gin(sector_tags);
create index if not exists gi_measure_directions_expense_tags_idx
  on public.gi_measure_directions using gin(expense_tags);

alter table public.gi_measure_directions enable row level security;
revoke all on table public.gi_measure_directions from public,anon,authenticated;
grant all on table public.gi_measure_directions to service_role,postgres;

with context as (
  select
    m.id as measure_id,
    v.id as source_version_id,
    v.extracted_text
  from public.gi_support_measures m
  join public.gi_source_versions v on v.document_id=m.source_document_id
  where m.code='FED_APK_CONCESSIONAL_CREDIT_2026'
  order by v.version_no desc,v.checked_at desc
  limit 1
), seeds(
  direction_code,title,description,sector_tags,expense_tags,search_terms,
  marker,quote_length,source_locator
) as (values
  (
    'crop_inputs',
    'Оборотные расходы растениеводства',
    'Горюче-смазочные материалы, средства защиты растений, удобрения, семена и посадочный материал.',
    array['agriculture','horticulture','greenhouse']::text[],
    array['fuel','crop_protection','fertilizer','seeds','planting_material']::text[],
    array['растениевод','семена','удобрения','средства защиты','гсм','ягод','сад','теплиц']::text[],
    'приобретение горюче-смазочных материалов',720,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страницы 1–2'
  ),
  (
    'machinery_repair',
    'Ремонт сельхозтехники и оборудования',
    'Запасные части, материалы и услуги по ремонту сельскохозяйственной техники, оборудования, грузовых автомобилей и тракторов.',
    array['agriculture','equipment','agroservice']::text[],
    array['spare_parts','repair','machinery','tractors']::text[],
    array['агросервис','сельхозтехник','трактор','ремонт','оборудован','запчаст']::text[],
    'запасных частей и материалов для ремонта',430,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 2'
  ),
  (
    'irrigation_greenhouse',
    'Орошение и тепличная инфраструктура',
    'Оборудование и материалы для систем орошения, выращивания в защищённом грунте и поддержания тепличной инфраструктуры.',
    array['agriculture','greenhouse','irrigation']::text[],
    array['irrigation','pumps','greenhouse_equipment','energy_center']::text[],
    array['орошен','полив','теплиц','защищенн','насос','дождевальн','микроклимат']::text[],
    'оборудования и материалов, используемых для систем',780,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страницы 2–3'
  ),
  (
    'fishery_repair',
    'Ремонт рыболовецких судов',
    'Запасные части, материалы и услуги по ремонту рыболовецких судов и установленного на них оборудования.',
    array['fisheries','aquaculture']::text[],
    array['vessel_repair','fishery_equipment','spare_parts']::text[],
    array['рыболов','рыбовод','аквакультур','судн','морепродукт']::text[],
    'запасных частей и материалов для ремонта рыболовецких судов',390,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страницы 2–3'
  ),
  (
    'vineyard_care',
    'Уход за виноградниками',
    'Финансирование ухода за виноградными насаждениями возрастом свыше шести лет.',
    array['agriculture','viticulture','winemaking']::text[],
    array['vineyard_care']::text[],
    array['виноград','виноградник','винодель']::text[],
    'уход за виноградными насаждениями возрастом свыше 6 лет',150,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 4'
  ),
  (
    'young_stock',
    'Молодняк, птица и рыбопосадочный материал',
    'Приобретение молодняка сельскохозяйственных животных и птицы, суточных цыплят, инкубационного яйца и рыбопосадочного материала.',
    array['livestock','poultry','aquaculture']::text[],
    array['young_animals','chicks','hatching_eggs','fish_stock']::text[],
    array['животновод','молодняк','птиц','инкубацион','рыбопосад','аквакультур']::text[],
    'приобретение молодняка сельскохозяйственных животных и птицы',250,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 4'
  ),
  (
    'veterinary',
    'Ветеринарные препараты',
    'Приобретение разрешённых к обращению лекарственных препаратов для ветеринарного применения.',
    array['livestock','poultry','aquaculture']::text[],
    array['veterinary_medicines']::text[],
    array['ветеринар','животновод','птицевод','рыбовод']::text[],
    'приобретение лекарственных препаратов для ветеринарного',230,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 4'
  ),
  (
    'wages',
    'Заработная плата',
    'Выплата заработной платы в рамках краткосрочного льготного кредита.',
    array['agriculture','agroprocessing','fisheries']::text[],
    array['payroll']::text[],
    array['заработн','оплата труда','сотрудник','персонал']::text[],
    'выплату заработной платы',90,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 4'
  ),
  (
    'raw_milk',
    'Закупка молока-сырья',
    'Закупка молока-сырья для производства молочной продукции при наличии договора с производителем сырья.',
    array['livestock','dairy','agroprocessing']::text[],
    array['raw_milk','dairy_processing']::text[],
    array['молоко','молочн','сыр','скотовод','переработка молока']::text[],
    'приобретение молока-сырья',780,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страницы 4–5'
  ),
  (
    'feed',
    'Корма и компоненты комбикормов',
    'Закупка зерна на кормовые цели, шротов, жмыхов, премиксов, витаминов и аминокислот.',
    array['livestock','poultry','aquaculture','feed_production']::text[],
    array['feed','grain','meal','premix','vitamins','amino_acids']::text[],
    array['корм','комбикорм','животновод','птицевод','премикс']::text[],
    'закупку кормов',340,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 5'
  ),
  (
    'packaging',
    'Упаковка и фасовка продукции',
    'Приобретение упаковки и материалов для упаковки и фасовки молочной, мясной и хлебобулочной продукции.',
    array['agroprocessing','dairy','meat_processing','bakery']::text[],
    array['packaging','filling','labels']::text[],
    array['упаков','фасов','переработ','молочн','мясн','хлебобулоч']::text[],
    'приобретение упаковки, а также материалов для упаковки и фасовки',520,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 5'
  ),
  (
    'processing_raw_materials',
    'Сырьё для пищевой переработки',
    'Закупка сельскохозяйственного сырья для мукомольной, масложировой, мясной, плодовоовощной, ягодной, винодельческой и другой пищевой переработки.',
    array['agroprocessing','food_processing','horticulture','meat_processing','winemaking']::text[],
    array['grain','oilseeds','meat','vegetables','fruit','berries','grapes','sugar','flour']::text[],
    array['переработ','консерв','ягод','плод','овощ','виноград','масло','мука','сахар','мясо']::text[],
    'закупку выращенных или произведенных',1800,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страницы 5–6'
  ),
  (
    'fish_processing',
    'Рыба и морепродукты для переработки',
    'Закупка рыбы и морепродуктов для производства филе, фарша, жира, готовой или консервированной продукции.',
    array['fisheries','aquaculture','fish_processing']::text[],
    array['fish','seafood','processing']::text[],
    array['рыба','морепродукт','рыбовод','аквакультур','переработка рыбы']::text[],
    'закупку добытых (выловленных), выращенных или произведенных',650,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 6'
  ),
  (
    'digitalization',
    'Цифровизация производства',
    'Лицензии и сопровождение программных продуктов, а также обслуживание техники и оборудования для цифровизации сельхозпроизводства и переработки.',
    array['agriculture','agroprocessing','digitalization']::text[],
    array['software','licenses','it_support','automation']::text[],
    array['цифровизац','информатизац','программ','автоматизац','it','учетная система']::text[],
    'сопровождение (поддержку) программных продуктов',620,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страницы 6–7'
  ),
  (
    'crop_insurance',
    'Страхование урожая и насаждений',
    'Уплата страховых взносов при страховании урожая, многолетних насаждений и питомников.',
    array['agriculture','horticulture']::text[],
    array['crop_insurance','orchard_insurance']::text[],
    array['страхован','урожай','посев','насажден','питомник']::text[],
    'уплату — страховых взносов при страховании урожая',220,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 7'
  ),
  (
    'animal_insurance',
    'Страхование сельскохозяйственных животных',
    'Уплата страховых взносов при страховании сельскохозяйственных животных.',
    array['livestock','poultry']::text[],
    array['animal_insurance']::text[],
    array['страхован','животновод','сельскохозяйственные животные']::text[],
    'уплату страховых взносов при страховании сельскохозяйственных',170,
    'Приказ Минсельхоза России № 187, приложение № 3, пункт 1, страница 7'
  )
), prepared as (
  select
    c.measure_id,
    c.source_version_id,
    s.direction_code,
    s.title,
    s.description,
    s.sector_tags,
    s.expense_tags,
    s.search_terms,
    s.source_locator,
    case
      when strpos(lower(substring(c.extracted_text from 17000)),lower(s.marker))>0
      then substring(
        c.extracted_text
        from strpos(lower(substring(c.extracted_text from 17000)),lower(s.marker))+16999
        for s.quote_length
      )
      else null
    end as evidence_quote,
    s.marker
  from context c cross join seeds s
)
insert into public.gi_measure_directions(
  measure_id,direction_code,title,description,sector_tags,expense_tags,search_terms,
  source_version_id,source_locator,evidence_quote,extraction_status,active,metadata,updated_at
)
select
  measure_id,direction_code,title,description,sector_tags,expense_tags,search_terms,
  source_version_id,source_locator,evidence_quote,
  case when evidence_quote is null then 'needs_review' else 'machine_match' end,
  true,
  jsonb_build_object(
    'extraction_engine','order-187-direction-parser-v0.75',
    'marker',marker,
    'machine_extracted',true,
    'human_reviewed',false,
    'legal_effect','direction_candidate_only'
  ),
  now()
from prepared
on conflict(measure_id,direction_code) do update set
  title=excluded.title,
  description=excluded.description,
  sector_tags=excluded.sector_tags,
  expense_tags=excluded.expense_tags,
  search_terms=excluded.search_terms,
  source_version_id=excluded.source_version_id,
  source_locator=excluded.source_locator,
  evidence_quote=excluded.evidence_quote,
  extraction_status=excluded.extraction_status,
  active=true,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.gi_enrich_measure_matches_with_directions(
  p_project_id uuid,
  p_telegram_user_id bigint,
  p_matches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.gi_projects%rowtype;
  v_haystack text;
  v_match jsonb;
  v_measure_id uuid;
  v_directions jsonb;
  v_total integer;
  v_result jsonb:='[]'::jsonb;
begin
  select * into v_project
  from public.gi_projects
  where id=p_project_id and telegram_user_id=p_telegram_user_id;
  if not found then raise exception 'project_not_found'; end if;

  select lower(concat_ws(' ',
    v_project.activity,
    v_project.region,
    coalesce(string_agg(f.value::text,' '),'')
  ))
  into v_haystack
  from public.gi_project_facts f
  where f.project_id=p_project_id and f.telegram_user_id=p_telegram_user_id;

  for v_match in select value from jsonb_array_elements(coalesce(p_matches,'[]'::jsonb)) loop
    begin
      v_measure_id:=(v_match->>'measure_id')::uuid;
    exception when others then
      v_measure_id:=null;
    end;

    if v_measure_id is null then
      v_result:=v_result||jsonb_build_array(v_match);
      continue;
    end if;

    select count(*) into v_total
    from public.gi_measure_directions d
    where d.measure_id=v_measure_id and d.active=true and d.extraction_status<>'rejected';

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',ranked.id,
      'code',ranked.direction_code,
      'title',ranked.title,
      'description',ranked.description,
      'sector_tags',ranked.sector_tags,
      'expense_tags',ranked.expense_tags,
      'matched_terms',ranked.matched_terms,
      'relevance_score',ranked.relevance_score,
      'source_locator',ranked.source_locator,
      'evidence_quote',ranked.evidence_quote,
      'extraction_status',ranked.extraction_status,
      'human_reviewed',coalesce((ranked.metadata->>'human_reviewed')::boolean,false),
      'legal_effect','relevance_hint_only'
    ) order by ranked.relevance_score desc,ranked.title),'[]'::jsonb)
    into v_directions
    from (
      select *
      from (
        select
          d.*,
          coalesce((
            select array_agg(term order by term)
            from unnest(d.search_terms) term
            where v_haystack like '%'||lower(term)||'%'
          ),'{}'::text[]) as matched_terms,
          least(100,40+15*(
            select count(*)
            from unnest(d.search_terms) term
            where v_haystack like '%'||lower(term)||'%'
          ))::integer as relevance_score
        from public.gi_measure_directions d
        where d.measure_id=v_measure_id
          and d.active=true
          and d.extraction_status<>'rejected'
      ) scored
      where cardinality(scored.matched_terms)>0
      order by scored.relevance_score desc,scored.title
      limit 6
    ) ranked;

    v_result:=v_result||jsonb_build_array(
      v_match||jsonb_build_object(
        'direction_matches',v_directions,
        'directions_total',v_total,
        'direction_match_note','Направления показывают тематическую релевантность расходов и не заменяют проверку требований меры.'
      )
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.gi_enrich_measure_matches_with_directions(uuid,bigint,jsonb)
  from public,anon,authenticated;
grant execute on function public.gi_enrich_measure_matches_with_directions(uuid,bigint,jsonb)
  to service_role,postgres;

commit;
