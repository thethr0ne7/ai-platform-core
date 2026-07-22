update public.gi_official_sources
set active = false,
    status = 'blocked',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('disabled_reason','obsolete_duplicate_of:economy-kbr'),
    updated_at = now()
where source_key = 'kbr-economy';

with fallback(source_key,url,role) as (
  values
    ('agro-ministry-kbr','https://t.me/s/mcxkbr','Официальный канал министерства'),
    ('economy-kbr','https://t.me/s/mineckbr','Официальный канал министерства'),
    ('kbr-tourism-ministry','https://t.me/s/mkit_kbr07','Официальный канал министерства'),
    ('kbr-tourism-portal','https://t.me/s/mkit_kbr07','Официальный канал профильного министерства'),
    ('kbr-government','https://t.me/s/pravitelstvokbr','Официальный канал Администрации Главы КБР'),
    ('kbr-land-property','https://t.me/s/pravitelstvokbr','Официальный резервный канал Правительства КБР'),
    ('mybusiness-kbr','https://t.me/s/moibizKBR','Официальный канал Центра Мой бизнес КБР')
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
where s.source_key in ('agro-ministry-kbr','economy-kbr','kbr-tourism-ministry','kbr-tourism-portal','kbr-government','kbr-land-property','mybusiness-kbr');
