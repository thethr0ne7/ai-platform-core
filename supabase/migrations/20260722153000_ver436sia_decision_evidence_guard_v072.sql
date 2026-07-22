begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='gi_decision_cards_published_evidence_check'
      and conrelid='public.gi_decision_cards'::regclass
  ) then
    alter table public.gi_decision_cards
      add constraint gi_decision_cards_published_evidence_check
      check (publish_status <> 'published' or evidence_id is not null);
  end if;
end $$;

commit;
