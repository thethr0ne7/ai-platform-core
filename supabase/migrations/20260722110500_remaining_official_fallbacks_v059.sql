with fallback(source_key,url,role) as (
  values
    ('budget-support','https://t.me/s/minfin','Официальный канал Минфина России — профильный источник финансовой поддержки'),
    ('frp-kbr','https://t.me/s/pravitelstvokbr','Официальный канал Администрации Главы КБР — сведения о региональном ФРП'),
    ('gisp','https://t.me/s/minpromtorg_ru','Официальный канал Минпромторга России — профильный источник ГИСП'),
    ('msp-platform','https://t.me/s/corpmspof','Официальный канал Корпорации МСП'),
    ('torgi-gov','https://t.me/s/gis_torgi_prodaji','Информационный канал Федерального казначейства о ГИС Торги'),
    ('duma-russia','https://t.me/s/duma_gov_ru','Официальный канал Государственной Думы'),
    ('pravo-publication','https://t.me/s/minjust_russia','Официальный канал Минюста России — резервный правовой источник')
)
insert into public.gi_source_endpoints(
  source_id,endpoint_type,url,active,priority,discovery_method,parser_hint,metadata
)
select s.id,'telegram_public_channel',f.url,true,1,'official_channel_registry_v059','telegram_public_html',jsonb_build_object('role',f.role,'official_fallback',true)
from fallback f
join public.gi_official_sources s on s.source_key=f.source_key
on conflict (source_id,url) do update set
  active=true,
  priority=least(public.gi_source_endpoints.priority,1),
  endpoint_type='telegram_public_channel',
  discovery_method='official_channel_registry_v059',
  parser_hint='telegram_public_html',
  metadata=coalesce(public.gi_source_endpoints.metadata,'{}'::jsonb) || excluded.metadata,
  updated_at=now();

update public.gi_official_sources s
set status='pending',
    metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object('official_fallback_added_at',now()),
    updated_at=now()
where s.source_key in ('budget-support','frp-kbr','gisp','msp-platform','torgi-gov','duma-russia','pravo-publication');
