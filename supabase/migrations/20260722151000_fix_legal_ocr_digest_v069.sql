begin;

-- gi_complete_legal_ocr_job runs with a locked-down search_path. pgcrypto is
-- installed in the extensions schema, so the previous public,pg_temp path
-- could not resolve digest(bytea,text) during OCR completion.
alter function public.gi_complete_legal_ocr_job(
  uuid,
  text,
  jsonb,
  numeric,
  text,
  jsonb
) set search_path = public, extensions, pg_temp;

-- Fail the migration immediately if the expected pgcrypto function is absent.
do $$
begin
  perform extensions.digest(convert_to('legal-ocr-regression','UTF8'),'sha256');
end;
$$;

comment on function public.gi_complete_legal_ocr_job(uuid,text,jsonb,numeric,text,jsonb)
is 'Completes a Tier A OCR job as manual_review. OCR evidence remains unverified. Search path includes the controlled extensions schema for pgcrypto digest.';

commit;
