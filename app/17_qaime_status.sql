-- =====================================================================
--  SimplePOS Cloud — qaimənin statusu dəyişəndə bildiriş
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
alter table public.qaimeler add column if not exists kohne_status text;
alter table public.qaimeler add column if not exists status_deyisib timestamptz;
alter table public.qaimeler add column if not exists status_bax boolean not null default true;
create index if not exists qaimeler_status_bax on public.qaimeler(magaza_id) where not status_bax;
notify pgrst, 'reload schema';
