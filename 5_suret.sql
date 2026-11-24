-- =====================================================================
--  SimplePOS — sürət: giriş yoxlaması hər sətir üçün yox, bir dəfə;
--  müştəri və kassa hesablamaları bir keçiddə. Təkrar işlətmək təhlükəsizdir.
-- =====================================================================

-- 1) Giriş qaydaları: rolum() sorğu başına 1 dəfə hesablansın
do $$
declare t text;
begin
  foreach t in array array['ayarlar','musteriler','satislar','satis_odenisleri','rasxodlar',
                           'isciler','maas_deyisiklikleri','isci_odenisleri','kassa_diger','sifarisler']
  loop
    execute format('drop policy if exists oxu on public.%I', t);
    execute format('drop policy if exists yaz on public.%I', t);
    execute format('create policy oxu on public.%I for select to authenticated using ((select public.rolum()) in (''muhasib'',''sahibkar''))', t);
    execute format('drop policy if exists elave on public.%I', t);
    execute format('create policy elave on public.%I for insert to authenticated with check ((select public.rolum()) = ''muhasib'')', t);
    execute format('drop policy if exists duzelt on public.%I', t);
    execute format('create policy duzelt on public.%I for update to authenticated using ((select public.rolum()) = ''muhasib'') with check ((select public.rolum()) = ''muhasib'')', t);
    execute format('drop policy if exists sil on public.%I', t);
    execute format('create policy sil on public.%I for delete to authenticated using ((select public.rolum()) = ''muhasib'')', t);
  end loop;
end $$;

drop policy if exists oxu on public.istifadeciler;
create policy oxu on public.istifadeciler for select to authenticated
  using (id = (select auth.uid()) or (select public.rolum()) = 'muhasib');
drop policy if exists yaz on public.istifadeciler;
create policy yaz on public.istifadeciler for update to authenticated
  using ((select public.rolum()) = 'muhasib') with check ((select public.rolum()) = 'muhasib');
drop policy if exists oxu on public.jurnal;
create policy oxu on public.jurnal for select to authenticated using ((select public.rolum()) in ('muhasib','sahibkar'));

-- 2) Müştərilər: satışları bir dəfə oxuyur (əvvəl iki dəfə oxuyurdu)
create or replace view public.v_musteriler with (security_invoker = true) as
with p as (
  select satis_id, sum(mebleg) cem, max(tarix) son from public.satis_odenisleri group by satis_id
), s as (
  select s.musteri_id, s.tarix, s.deyer, p.son,
         s.deyer - s.ilkin - coalesce(p.cem, 0) as qaliq,
         case when s.deyer - s.ilkin - coalesce(p.cem, 0) > 0 then
           case when s.ayliq is not null and s.ilk_odenis is not null
                then current_date - (s.ilk_odenis + make_interval(months => floor(coalesce(p.cem,0) / s.ayliq)::int))::date
                else current_date - (greatest(s.tarix, coalesce(p.son, s.tarix)) + 30) end
         end as gec
  from public.satislar s left join p on p.satis_id = s.id
)
select m.id, m.ad, m.unvan, m.telefon, m.qeyd,
       count(s.musteri_id)                 as satis_sayi,
       min(s.tarix)                        as ilk_satis,
       coalesce(sum(s.deyer), 0)           as cem,
       coalesce(sum(s.deyer - s.qaliq), 0) as verilen,
       coalesce(sum(s.qaliq), 0)           as qaliq,
       greatest(max(s.tarix), max(s.son))  as son_tarix,
       max(s.gec)                          as gecikme_gun
from public.musteriler m
left join s on s.musteri_id = m.id
group by m.id;

-- 3) Aylar / kassa: hər cədvəl bir dəfə oxunur (əvvəl hər ay üçün ayrıca)
create or replace view public.v_aylar with (security_invoker = true) as
with bas as (
  select coalesce((select deyer::date from public.ayarlar where acar = 'kassa_baslangic'),
                  (select date_trunc('month', min(tarix))::date from public.satislar)) as d
), aylar as (
  select generate_series(date_trunc('month', (select d from bas)),
                         date_trunc('month', current_date), interval '1 month')::date as ay
), p as (
  select satis_id, sum(mebleg) cem from public.satis_odenisleri group by satis_id
), st as (
  select date_trunc('month', s.tarix)::date ay, sum(s.deyer) satis, count(*) say, sum(s.ilkin) ilkin,
         sum(s.deyer - s.ilkin - coalesce(p.cem, 0)) qalan
  from public.satislar s left join p on p.satis_id = s.id group by 1
), od as (
  select date_trunc('month', tarix)::date ay, sum(mebleg) c from public.satis_odenisleri group by 1
), kd as (
  select date_trunc('month', tarix)::date ay,
         sum(mebleg) filter (where nov = 'Mədaxil') med, sum(mebleg) filter (where nov = 'Məxaric') mex
  from public.kassa_diger group by 1
), rx as (
  select date_trunc('month', tarix)::date ay, sum(mebleg) c from public.rasxodlar group by 1
), io as (
  select date_trunc('month', o.tarix)::date ay,
         sum(o.mebleg) filter (where i.nov = 'İşçi') maas, sum(o.mebleg) filter (where i.nov = 'Sahib') sahib
  from public.isci_odenisleri o join public.isciler i on i.id = o.isci_id
  where o.nov in ('Avans','Maaş') group by 1
)
select a.ay,
  coalesce(st.satis, 0) as satis,
  coalesce(st.say, 0)   as satis_sayi,
  coalesce(st.qalan, 0) as satisdan_qalan,
  coalesce(st.ilkin, 0) as ilkin,
  coalesce(od.c, 0)     as musteri_odenisi,
  coalesce(kd.med, 0)   as diger_medaxil,
  coalesce(rx.c, 0)     as rasxod,
  coalesce(io.maas, 0)  as maas,
  coalesce(io.sahib, 0) as sahib,
  coalesce(kd.mex, 0)   as diger_mexaric
from aylar a
left join st on st.ay = a.ay left join od on od.ay = a.ay left join kd on kd.ay = a.ay
left join rx on rx.ay = a.ay left join io on io.ay = a.ay;

create index if not exists isci_odenisleri_tarix on public.isci_odenisleri(tarix);
create index if not exists kassa_diger_tarix on public.kassa_diger(tarix);
analyze;
