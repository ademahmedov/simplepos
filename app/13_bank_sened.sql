-- =====================================================================
--  SimplePOS Cloud — bank çıxarışı idxalı: sənəd nömrəsi (təkrar yükləmənin qarşısı)
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
alter table public.bank_emeliyyatlari add column if not exists sened text;
alter table public.qaime_odenisleri add column if not exists sened text;
create index if not exists bank_emeliyyatlari_sened on public.bank_emeliyyatlari(magaza_id, sened) where sened is not null;
create index if not exists qaime_odenisleri_sened on public.qaime_odenisleri(magaza_id, sened) where sened is not null;
-- görünüş o.* sütunlarını yenidən götürsün
drop view if exists public.v_qaime_odenisleri;
create view public.v_qaime_odenisleri with (security_invoker = true) as
select o.*, date_trunc('month', o.tarix)::date as ay, q.istiqamet, q.voen, q.kontragent, q.seriya, q.nomre, q.tarix as qaime_tarix,
       q.esas as qaime_esas, q.edv as qaime_edv
from public.qaime_odenisleri o join public.qaimeler q on q.id = o.qaime_id;
grant select on public.v_qaime_odenisleri to authenticated;
notify pgrst, 'reload schema';
