-- =====================================================================
--  SimplePOS Cloud — dəvət kodu ilə qoşulma müəssisənin təsdiqi ilə
--  Kodla qoşulan şəxs "gözləyir" rolunda olur, müəssisənin mühasibi rol verənə qədər heç nə görmür.
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.uzvler'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%sahibkar%';
  if c is not null then execute format('alter table public.uzvler drop constraint %I', c); end if;
end $$;
alter table public.uzvler add constraint uzvler_rol_check check (rol in ('muhasib', 'sahibkar', 'kuryer', 'bloklu', 'gozleyir'));

create or replace function public.magazam() returns bigint
language sql stable security definer set search_path = public as $$
  select magaza_id from public.uzvler
  where user_id = auth.uid() and rol not in ('bloklu', 'gozleyir') and (not admin_giris or secili)
  order by secili desc, yaradildi, magaza_id
  limit 1
$$;

create or replace function public.magaza_sec(m bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.uzvler where user_id = auth.uid() and magaza_id = m and rol not in ('bloklu', 'gozleyir')) then
    raise exception 'Bu müəssisəyə girişiniz yoxdur';
  end if;
  update public.uzvler set secili = false where user_id = auth.uid() and secili and magaza_id <> m;
  update public.uzvler set secili = true where user_id = auth.uid() and magaza_id = m;
end $$;

create or replace function public.uzvluklerim() returns table(id bigint, ad text, rol text)
language sql stable security definer set search_path = public as $$
  select m.id, m.ad, u.rol from public.uzvler u join public.magazalar m on m.id = u.magaza_id
  where u.user_id = auth.uid() and u.rol not in ('bloklu', 'gozleyir') and not u.admin_giris order by m.ad
$$;

create or replace function public.firma_qosul(kod text) returns text
language plpgsql security definer set search_path = public as $$
declare m bigint; mad text; u uuid := auth.uid();
begin
  if u is null then raise exception 'Daxil olun'; end if;
  select id, magazalar.ad into m, mad from public.magazalar where devet_kodu = upper(trim(kod)) and not dayandirilib;
  if m is null then raise exception 'Dəvət kodu səhvdir'; end if;
  if exists (select 1 from public.uzvler where user_id = u and magaza_id = m) then raise exception 'Bu müəssisəyə artıq sorğu göndərmisiniz'; end if;
  insert into public.uzvler(user_id, magaza_id, rol, ad, email, secili)
    values (u, m, 'gozleyir', (select p.ad from public.profiller p where p.user_id = u), (select email from auth.users where id = u), false);
  return mad;
end $$;

create or replace function public.yeni_istifadeci() returns trigger
language plpgsql security definer set search_path = public as $$
declare md jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); m bigint; kod text;
        muh boolean := coalesce(md->>'hesab', '') = 'muhasib';
begin
  insert into public.profiller(user_id, nov, ad, telefon, meqsed)
    values (new.id, case when muh then 'muhasib' else 'dukan' end, nullif(trim(md->>'ad'), ''), nullif(trim(md->>'telefon'), ''),
            case when muh then 'muhasib' else nullif(trim(coalesce(md->>'sahe', '')), '') end)
  on conflict (user_id) do nothing;
  kod := upper(trim(coalesce(md->>'devet_kodu', '')));
  if kod <> '' then
    select id into m from public.magazalar where devet_kodu = kod;
    if m is null then raise exception 'Dəvət kodu səhvdir'; end if;
    insert into public.uzvler(user_id, magaza_id, rol, ad, email)
      values (new.id, m, 'gozleyir', nullif(trim(md->>'ad'), ''), new.email);
  elsif coalesce(trim(md->>'magaza_adi'), '') <> '' then
    insert into public.magazalar(ad, sahib_ad, telefon, email, abune_bitir, sahe)
      values (trim(md->>'magaza_adi'), nullif(trim(md->>'ad'), ''), nullif(trim(md->>'telefon'), ''), new.email,
              public.bugun() + coalesce((select deyer::int from public.sistem where acar = 'sinaq_gun'), 14),
              coalesce(nullif(trim(md->>'sahe'), ''), 'mebel'))
      returning id into m;
    insert into public.uzvler(user_id, magaza_id, rol, ad, email)
      values (new.id, m, 'muhasib', nullif(trim(md->>'ad'), ''), new.email);
    perform public.magaza_hazirla(m);
  end if;
  return new;
end $$;

-- müəssisələr siyahısı: təsdiq gözləyən müəssisənin rəqəmləri göstərilmir
create or replace function public.firmalarim() returns table(id bigint, ad text, sahe text, rol text, secili boolean, abune_bitir date, dayandirilib boolean, musteri bigint, borc numeric, gecikan bigint, gecikmis_borc numeric, bu_ay numeric, bu_gun numeric, q_say bigint, kreditor numeric, debitor numeric)
language sql stable security definer set search_path = public as $$
  select m.id, m.ad, m.sahe, u.rol, (m.id = public.magazam()), m.abune_bitir, m.dayandirilib,
         coalesce(v.mus, 0), coalesce(v.borc, 0), coalesce(v.gec, 0), coalesce(v.gecm, 0),
         coalesce(o.ay, 0), coalesce(o.gun, 0),
         coalesce(qq.say, 0), coalesce(qq.kred, 0), coalesce(qq.deb, 0)
  from public.uzvler u
  join public.magazalar m on m.id = u.magaza_id
  left join lateral (select count(*) mus,
                            sum(x.qaliq) filter (where x.qaliq > 0) borc,
                            count(*) filter (where x.qaliq > 0 and x.gecikme_gun > 0) gec,
                            sum(x.qaliq) filter (where x.qaliq > 0 and x.gecikme_gun > 0) gecm
                     from public.v_musteriler x where x.magaza_id = m.id and m.sahe <> 'muhasibat' and u.rol <> 'gozleyir') v on true
  left join lateral (select sum(s.mebleg) filter (where s.tarix >= date_trunc('month', public.bugun())::date) ay,
                            sum(s.mebleg) filter (where s.tarix = public.bugun()) gun
                     from public.satis_odenisleri s
                     where s.magaza_id = m.id and s.tarix >= date_trunc('month', public.bugun())::date and u.rol <> 'gozleyir') o on true
  left join lateral (select count(*) filter (where y.tarix >= date_trunc('month', public.bugun())::date) say,
                            sum(y.qaliq) filter (where y.istiqamet = 'gelen' and y.qaliq > 0) kred,
                            sum(y.qaliq) filter (where y.istiqamet = 'geden' and y.qaliq > 0) deb
                     from public.v_qaimeler y where y.magaza_id = m.id and m.sahe = 'muhasibat' and u.rol <> 'gozleyir') qq on true
  where u.user_id = auth.uid() and u.rol <> 'bloklu' and not u.admin_giris
  order by (m.id = public.magazam()) desc, m.ad
$$;
notify pgrst, 'reload schema';
