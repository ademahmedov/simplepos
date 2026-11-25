-- =====================================================================
--  SimplePOS Cloud — Məhsulda 4 qiymət növü (Qiymət 1 əsas + 2, 3, 4)
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
alter table public.mehsullar add column if not exists qiymet2 numeric(12,2) check (qiymet2 is null or qiymet2 >= 0);
alter table public.mehsullar add column if not exists qiymet3 numeric(12,2) check (qiymet3 is null or qiymet3 >= 0);
alter table public.mehsullar add column if not exists qiymet4 numeric(12,2) check (qiymet4 is null or qiymet4 >= 0);

-- Görünüş m.* yeni sütunları da götürsün deyə yenidən qurulur
drop view if exists public.v_mehsullar;
create view public.v_mehsullar with (security_invoker = true) as
select m.*, coalesce(x.miqdar, 0) as satilib, coalesce(x.cem, 0) as satis_cemi, x.son as son_satis,
       coalesce(h.miqdar, 0) - coalesce(x.miqdar, 0) as anbar,
       h.son_alis
from public.mehsullar m
left join (select sm.mehsul_id, sum(sm.miqdar) miqdar, sum(sm.miqdar * sm.qiymet) cem, max(s.tarix) son
           from public.satis_mallari sm join public.satislar s on s.id = sm.satis_id
           group by sm.mehsul_id) x on x.mehsul_id = m.id
left join (select mehsul_id, sum(miqdar) miqdar, max(tarix) filter (where nov = 'Mədaxil') son_alis
           from public.anbar_hereketleri group by mehsul_id) h on h.mehsul_id = m.id;
grant select on public.v_mehsullar to authenticated;
notify pgrst, 'reload schema';
