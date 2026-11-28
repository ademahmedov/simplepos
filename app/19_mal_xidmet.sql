-- SimplePOS Cloud — gələn qaimələrin mal / xidmət təsnifatı. Təkrar işlətmək təhlükəsizdir.
alter table public.qaimeler add column if not exists nov text;
alter table public.kontragentler add column if not exists nov text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qaimeler_nov_check') then
    alter table public.qaimeler add constraint qaimeler_nov_check check (nov is null or nov in ('mal', 'xidmet')); end if;
  if not exists (select 1 from pg_constraint where conname = 'kontragentler_nov_check') then
    alter table public.kontragentler add constraint kontragentler_nov_check check (nov is null or nov in ('mal', 'xidmet', 'qarisiq')); end if;
end $$;
notify pgrst, 'reload schema';
