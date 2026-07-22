begin;

update public.gi_measure_directions
set search_terms=array['цифровизац','информатизац','программ','автоматизац','учетная система']::text[],
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'matching_fix','removed_ambiguous_short_term_it',
      'matching_version','v0.75.1'
    ),
    updated_at=now()
where direction_code='digitalization';

commit;
