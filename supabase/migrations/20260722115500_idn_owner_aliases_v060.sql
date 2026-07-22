begin;

insert into public.gi_source_endpoints(
  source_id,endpoint_type,url,active,priority,discovery_method,parser_hint,
  evidence_tier,owner_verified,allowed_uses,metadata,last_checked_at,last_success_at,updated_at
)
select s.id,'homepage',v.url,true,1,'verified_idn_alias_v060','edge_fetch',
       'B',true,array['program_description','official_link','discovery','early_signal']::text[],
       jsonb_build_object('alias_for',s.base_url,'verification','known_idn_punycode_equivalent'),
       now(),now(),now()
from public.gi_official_sources s
join (values
  ('dom-rf','https://xn--d1aqf.xn--p1ai/'),
  ('tourism-rf','https://xn--g1abnnjg.xn--p1ai/'),
  ('my-business','https://xn--90aifddrld7a.xn--p1ai/')
) v(source_key,url) on v.source_key=s.source_key
where not exists (
  select 1 from public.gi_source_endpoints e
  where e.source_id=s.id and public.gi_url_owner_key(e.url)=public.gi_url_owner_key(v.url)
);

update public.gi_source_documents d
set owner_validation_status=case when public.gi_source_owns_url(d.source_id,d.canonical_url) then 'verified' else 'needs_review' end
where owner_validation_status<>'verified';

commit;
