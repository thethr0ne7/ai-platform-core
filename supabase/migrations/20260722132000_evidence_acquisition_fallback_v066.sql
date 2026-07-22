begin;

update public.gi_evidence_verification_queue
set target_url='https://rg.ru/documents/2025/05/05/minselhoz-prikaz187-site-dok.html',
    status='pending',
    notes='Официальный правовой документ остаётся publication.pravo.gov.ru. Российская газета используется только как официальный канал получения идентичной PDF-копии; после извлечения обязательна ручная сверка публикационного номера, редакции, цитат и локаторов.',
    result='{}'::jsonb,
    updated_at=now()
where task_code='apk_187_extract';

update public.gi_evidence_verification_queue
set target_url='https://rg.ru/documents/2025/10/23/minselhoz-prikaz592-site-dok.html',
    status='pending',
    notes='Официальный правовой документ остаётся publication.pravo.gov.ru. Российская газета используется только как официальный канал получения идентичной PDF-копии; после извлечения обязательна ручная сверка публикационного номера, редакции, цитат и локаторов.',
    result='{}'::jsonb,
    updated_at=now()
where task_code='apk_592_amendment';

update public.gi_evidence_verification_queue
set status='pending',result='{}'::jsonb,updated_at=now()
where task_code in ('rural_696_tier_a','rural_1876_edition')
  and status='blocked';

update public.gi_source_documents
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'acquisition_fallback','https://rg.ru/documents/2025/05/05/minselhoz-prikaz187-site-dok.html',
  'acquisition_role','official_gazette_copy',
  'canonical_legal_source','https://publication.pravo.gov.ru/document/0001202504300025',
  'human_comparison_required',true
)
where canonical_url='https://publication.pravo.gov.ru/document/0001202504300025';

update public.gi_source_documents
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'acquisition_fallback','https://rg.ru/documents/2025/10/23/minselhoz-prikaz592-site-dok.html',
  'acquisition_role','official_gazette_copy',
  'canonical_legal_source','https://publication.pravo.gov.ru/document/0001202510220015',
  'human_comparison_required',true
)
where canonical_url='https://publication.pravo.gov.ru/document/0001202510220015';

commit;
