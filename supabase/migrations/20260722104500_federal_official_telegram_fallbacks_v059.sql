with fallback(source_key,url,role) as (
  values
    ('government-russia','https://t.me/s/government_rus','Официальный канал Правительства России'),
    ('industry-russia','https://t.me/s/minpromtorg_ru','Официальный канал Минпромторга России'),
    ('minselkhoz-russia','https://t.me/s/mcx_ru','Официальный канал Минсельхоза России'),
    ('economy-russia','https://t.me/s/minec_russia','Официальный канал Минэкономразвития России')
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
where s.source_key in ('government-russia','industry-russia','minselkhoz-russia','economy-russia');
