-- =====================================================================
--  SimplePOS Cloud — ödəniş üsulu: Nağd, POS, Parçalı, Borc. Təkrar işlətmək təhlükəsizdir.
--  Kassa yalnız nağd pulu sayır; POS (kartla) ödənişlər ayrıca göstərilir.
-- =====================================================================
alter table public.satislar add column if not exists odenis_usulu text not null default 'Borc';
alter table public.satislar add column if not exists ilkin_pos numeric(12,2) not null default 0;
alter table public.satislar drop constraint if exists satislar_odenis_usulu_check;
alter table public.satislar add constraint satislar_odenis_usulu_check check (odenis_usulu in ('Nağd','POS','Parçalı','Borc'));
alter table public.satislar drop constraint if exists satislar_ilkin_pos_check;
alter table public.satislar add constraint satislar_ilkin_pos_check check (ilkin_pos >= 0 and ilkin_pos <= ilkin);
-- köhnə satışlar: ilk gündə tam ödənibsə "Nağd", qalanı "Borc"
update public.satislar set odenis_usulu = 'Nağd' where odenis_usulu = 'Borc' and ilkin >= deyer and ayliq is null;
alter table public.satis_odenisleri add column if not exists usul text not null default 'Nağd';
alter table public.satis_odenisleri drop constraint if exists satis_odenisleri_usul_check;
alter table public.satis_odenisleri add constraint satis_odenisleri_usul_check check (usul in ('Nağd','POS'));

create or replace view public.v_aylar with (security_invoker = true) as
with mg as (
  select m.id as magaza_id,
         coalesce((select nullif(deyer, '')::date from public.ayarlar a where a.magaza_id = m.id and a.acar = 'kassa_baslangic'),
                  (select date_trunc('month', min(tarix))::date from public.satislar s where s.magaza_id = m.id),
                  date_trunc('month', current_date)::date) as d
  from public.magazalar m
), aylar as (
  select mg.magaza_id, generate_series(date_trunc('month', mg.d), date_trunc('month', current_date), interval '1 month')::date as ay from mg
), p as (
  select satis_id, sum(mebleg) cem from public.satis_odenisleri group by satis_id
), c as (
  select satis_id, sum(cem) cem from (
    select satis_id, mebleg cem from public.satis_cerimeleri
    union all select satis_id, geri_pul from public.satis_qaytarmalari) x group by satis_id
), st as (
  select s.magaza_id, date_trunc('month', s.tarix)::date ay, sum(s.deyer) satis, count(*) say, sum(s.ilkin - s.ilkin_pos) ilkin, sum(s.ilkin_pos) ilkin_pos,
         sum(s.deyer - s.ilkin - coalesce(p.cem, 0) + coalesce(c.cem, 0)) qalan
  from public.satislar s left join p on p.satis_id = s.id left join c on c.satis_id = s.id group by 1, 2
), od as (
  select magaza_id, date_trunc('month', tarix)::date ay, sum(mebleg) filter (where usul = 'Nağd') c, sum(mebleg) filter (where usul = 'POS') pos
  from public.satis_odenisleri group by 1, 2
), kd as (
  select magaza_id, date_trunc('month', tarix)::date ay,
         sum(mebleg) filter (where nov = 'Mədaxil') med, sum(mebleg) filter (where nov = 'Məxaric') mex
  from public.kassa_diger group by 1, 2
), rx as (
  select magaza_id, date_trunc('month', tarix)::date ay, sum(mebleg) c from public.rasxodlar group by 1, 2
), io as (
  select o.magaza_id, date_trunc('month', o.tarix)::date ay,
         sum(o.mebleg) filter (where i.nov = 'İşçi') maas, sum(o.mebleg) filter (where i.nov = 'Sahib') sahib
  from public.isci_odenisleri o join public.isciler i on i.id = o.isci_id
  where o.nov in ('Avans','Maaş') group by 1, 2
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
  coalesce(kd.mex, 0)   as diger_mexaric,
  a.magaza_id,
  coalesce(st.ilkin_pos, 0) + coalesce(od.pos, 0) as pos
from aylar a
left join st on st.magaza_id = a.magaza_id and st.ay = a.ay
left join od on od.magaza_id = a.magaza_id and od.ay = a.ay
left join kd on kd.magaza_id = a.magaza_id and kd.ay = a.ay
left join rx on rx.magaza_id = a.magaza_id and rx.ay = a.ay
left join io on io.magaza_id = a.magaza_id and io.ay = a.ay;

create or replace view public.v_satislar with (security_invoker = true) as
select s.id, s.satis_no, s.tarix, s.musteri_id, m.ad as musteri, m.unvan, m.telefon,
       s.mal, s.deyer, s.ilkin, s.qeyd,
       coalesce(p.cem, 0)                                          as odenilen,
       s.deyer - s.ilkin - coalesce(p.cem, 0) + coalesce(c.cem, 0) + coalesce(g.cem, 0) as qaliq,
       coalesce(p.say, 0)                                          as odenis_sayi,
       p.son                                                       as son_odenis,
       date_trunc('month', s.tarix)::date                          as ay,
       s.magaza_id,
       coalesce(c.cem, 0)                                          as cerime,
       coalesce(g.cem, 0)                                          as geri,
       s.odenis_usulu, s.ilkin_pos
from public.satislar s
join public.musteriler m on m.id = s.musteri_id
left join (select satis_id, sum(mebleg) cem, count(*) say, max(tarix) son
           from public.satis_odenisleri group by satis_id) p on p.satis_id = s.id
left join (select satis_id, sum(mebleg) cem from public.satis_cerimeleri group by satis_id) c on c.satis_id = s.id
left join (select satis_id, sum(geri_pul) cem from public.satis_qaytarmalari group by satis_id) g on g.satis_id = s.id;

drop view if exists public.v_kassa;
create view public.v_kassa with (security_invoker = true) as
select x.*,
  x.ilkin + x.musteri_odenisi + x.diger_medaxil         as medaxil,
  x.rasxod + x.maas + x.sahib + x.diger_mexaric         as mexaric,
  coalesce((select nullif(deyer, '')::numeric from public.ayarlar a where a.magaza_id = x.magaza_id and a.acar = 'kassa_ilkin'), 0)
   + sum(x.ilkin + x.musteri_odenisi + x.diger_medaxil - x.rasxod - x.maas - x.sahib - x.diger_mexaric)
       over (partition by x.magaza_id order by x.ay)   as ay_sonu_kassa
from public.v_aylar x;
grant select on public.v_aylar, public.v_kassa to authenticated;

create or replace function public.kassa_qaliq(t date) returns numeric
language sql stable security invoker set search_path = public as $$
  with b as (
    select coalesce((select nullif(deyer, '')::date from ayarlar where magaza_id = magazam() and acar = 'kassa_baslangic'),
                    (select date_trunc('month', min(tarix))::date from satislar)) as d
  )
  select coalesce((select nullif(deyer, '')::numeric from ayarlar where magaza_id = magazam() and acar = 'kassa_ilkin'), 0)
       + coalesce((select sum(ilkin - ilkin_pos) from satislar where tarix >= (select d from b) and tarix <= t), 0)
       + coalesce((select sum(mebleg) from satis_odenisleri where usul = 'Nağd' and tarix >= (select d from b) and tarix <= t), 0)
       + coalesce((select sum(case when nov = 'Mədaxil' then mebleg else -mebleg end) from kassa_diger where tarix >= (select d from b) and tarix <= t), 0)
       - coalesce((select sum(mebleg) from rasxodlar       where tarix >= (select d from b) and tarix <= t), 0)
       - coalesce((select sum(mebleg) from isci_odenisleri where nov in ('Avans','Maaş') and tarix >= (select d from b) and tarix <= t), 0)
$$;

create or replace function public.telegram_metn(d date default null, mg bigint default null) returns text
language plpgsql stable security definer set search_path = public as $f$
declare
  g date := coalesce(d, public.bugun());
  m bigint;
  aylar text[] := array['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'];
  firma text; s_say int; s_cem numeric; ilk numeric; od numeric; pos numeric; dmed numeric; dmex numeric; rx numeric; maas numeric; sah numeric;
  a record; kassa numeric; borc numeric; borc_say int; gec numeric; gec_say int;
  sab_say int; sab_cem numeric; sab_list text; xalis numeric; t text;
begin
  if auth.uid() is not null then
    if coalesce(public.rolum(), '') not in ('muhasib','sahibkar') then raise exception 'İcazə yoxdur'; end if;
    m := public.magazam();
  else
    m := mg;
  end if;
  select coalesce(nullif(deyer, ''), 'SimplePOS') into firma from ayarlar where magaza_id = m and acar = 'firma_adi';
  select count(*), coalesce(sum(deyer), 0), coalesce(sum(ilkin - ilkin_pos), 0), coalesce(sum(ilkin_pos), 0) into s_say, s_cem, ilk, pos from satislar where magaza_id = m and tarix = g;
  select coalesce(sum(mebleg) filter (where usul = 'Nağd'), 0), pos + coalesce(sum(mebleg) filter (where usul = 'POS'), 0) into od, pos from satis_odenisleri where magaza_id = m and tarix = g;
  select coalesce(sum(mebleg) filter (where nov = 'Mədaxil'), 0), coalesce(sum(mebleg) filter (where nov = 'Məxaric'), 0)
    into dmed, dmex from kassa_diger where magaza_id = m and tarix = g;
  select coalesce(sum(mebleg), 0) into rx from rasxodlar where magaza_id = m and tarix = g;
  select coalesce(sum(o.mebleg) filter (where i.nov = 'İşçi'), 0), coalesce(sum(o.mebleg) filter (where i.nov = 'Sahib'), 0)
    into maas, sah from isci_odenisleri o join isciler i on i.id = o.isci_id
    where o.magaza_id = m and o.tarix = g and o.nov in ('Avans','Maaş');
  select * into a from v_kassa where magaza_id = m and ay = date_trunc('month', g)::date;
  select ay_sonu_kassa into kassa from v_kassa where magaza_id = m order by ay desc limit 1;
  select coalesce(sum(qaliq), 0), count(*) filter (where qaliq > 0),
         coalesce(sum(qaliq) filter (where qaliq > 0 and gecikme_gun > 0), 0), count(*) filter (where qaliq > 0 and gecikme_gun > 0)
    into borc, borc_say, gec, gec_say from v_musteriler where magaza_id = m;
  select count(*), coalesce(sum(q.novbeti_mebleg), 0),
         string_agg('  • ' || tg_h(mu.ad) || ' — ' || tg_m(q.novbeti_mebleg), chr(10) order by q.novbeti_mebleg desc)
    into sab_say, sab_cem, sab_list
    from (select * from v_qrafik where magaza_id = m and qaliq > 0 and novbeti_tarix = g + 1) q join musteriler mu on mu.id = q.musteri_id;
  xalis := ilk + od + dmed - rx - maas - sah - dmex;

  t := '📊 <b>' || tg_h(firma) || '</b> — ' || to_char(g, 'DD.MM.YYYY') || chr(10) || chr(10)
    || '<b>Bu gün</b>' || chr(10)
    || '🛋 Satış: ' || s_say || ' ədəd · ' || tg_m(s_cem) || chr(10)
    || '💵 Kassaya daxil: ' || tg_m(ilk + od + dmed)
       || case when ilk + od + dmed > 0 then ' (ilkin ' || tg_m(ilk) || ', ödənişlər ' || tg_m(od)
          || case when dmed > 0 then ', digər ' || tg_m(dmed) else '' end || ')' else '' end || chr(10)
    || case when pos > 0 then '💳 POS / kartla: ' || tg_m(pos) || chr(10) else '' end
    || '💸 Çıxan: ' || tg_m(rx + maas + sah + dmex)
       || case when rx + maas + sah + dmex > 0 then ' (xərc ' || tg_m(rx) || ', maaş ' || tg_m(maas)
          || case when sah > 0 then ', sahib ' || tg_m(sah) else '' end
          || case when dmex > 0 then ', digər ' || tg_m(dmex) else '' end || ')' else '' end || chr(10)
    || (case when xalis < 0 then '🔻' else '🔹' end) || ' Xalis: ' || tg_m(xalis) || chr(10) || chr(10)
    || '<b>Bu ay (' || aylar[extract(month from g)::int] || ')</b>' || chr(10)
    || 'Satış: ' || coalesce(a.satis_sayi, 0) || ' ədəd · ' || tg_m(a.satis) || chr(10)
    || 'Kassaya daxil: ' || tg_m(a.medaxil) || chr(10)
    || 'Xərclər: ' || tg_m(a.rasxod) || chr(10) || chr(10)
    || '<b>Vəziyyət</b>' || chr(10)
    || '🏦 Kassada: ' || tg_m(kassa) || chr(10)
    || '📋 Müştəri borcu: ' || tg_m(borc) || ' (' || borc_say || ' müştəri)' || chr(10)
    || '⚠️ Gecikən: ' || tg_m(gec) || ' (' || gec_say || ' müştəri)';
  if sab_say > 0 then
    t := t || chr(10) || chr(10) || '<b>Sabah ödəniş günüdür</b> — ' || sab_say || ' müştəri · ' || tg_m(sab_cem) || chr(10)
      || array_to_string((string_to_array(sab_list, chr(10)))[1:10], chr(10))
      || case when sab_say > 10 then chr(10) || '  … və daha ' || (sab_say - 10) || ' müştəri' else '' end;
  end if;
  return t;
end $f$;

select (select count(*) from public.v_kassa) kassa_aylari, (select coalesce(sum(qaliq),0) from public.v_musteriler) borc;
