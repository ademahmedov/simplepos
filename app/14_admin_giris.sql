-- =====================================================================
--  SimplePOS Cloud — admin bütün müəssisələrə bir kliklə girə bilsin
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
alter table public.uzvler add column if not exists admin_giris boolean not null default false;

create or replace function public.admin_firmaya_gir(m bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.adminem() then raise exception 'İcazə yoxdur'; end if;
  if not exists (select 1 from public.magazalar where id = m) then raise exception 'Müəssisə tapılmadı'; end if;
  insert into public.uzvler(user_id, magaza_id, rol, ad, email, secili, admin_giris)
    values (auth.uid(), m, 'muhasib', (select p.ad from public.profiller p where p.user_id = auth.uid()), (select email from auth.users where id = auth.uid()), false, true)
  on conflict (user_id, magaza_id) do update set rol = case when uzvler.rol = 'bloklu' then 'muhasib' else uzvler.rol end;
  update public.uzvler set secili = (magaza_id = m) where user_id = auth.uid();
end $$;
grant execute on function public.admin_firmaya_gir(bigint) to authenticated;

drop function if exists public.admin_magazalar();
create function public.admin_magazalar() returns table(id bigint, ad text, sahib_ad text, telefon text, email text, qeydiyyat timestamptz, abune_bitir date, dayandirilib boolean, admin_qeyd text, aktiv boolean,
  uzv_sayi bigint, musteri_sayi bigint, satis_sayi bigint, son_aktivlik timestamptz, odenilib numeric, son_odenis date, sahe text, qaime_sayi bigint, uzvler text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.adminem() then raise exception 'İcazə yoxdur'; end if;
  return query
  select m.id, m.ad, m.sahib_ad, m.telefon, m.email, m.qeydiyyat, m.abune_bitir, m.dayandirilib, m.admin_qeyd,
         (not m.dayandirilib and m.abune_bitir >= public.bugun()),
         (select count(*) from uzvler u where u.magaza_id = m.id and not u.admin_giris),
         (select count(*) from musteriler x where x.magaza_id = m.id),
         (select count(*) from satislar x where x.magaza_id = m.id),
         (select max(j.zaman) from jurnal j where j.magaza_id = m.id),
         coalesce((select sum(o.mebleg) from abune_odenisleri o where o.magaza_id = m.id), 0),
         (select max(o.tarix) from abune_odenisleri o where o.magaza_id = m.id),
         m.sahe,
         (select count(*) from qaimeler x where x.magaza_id = m.id),
         (select string_agg(coalesce(u.email, '') || ' (' || u.rol || ')', ', ' order by u.yaradildi) from uzvler u where u.magaza_id = m.id and not u.admin_giris)
  from magazalar m order by m.qeydiyyat desc;
end $$;
grant execute on function public.admin_magazalar() to authenticated;
notify pgrst, 'reload schema';
