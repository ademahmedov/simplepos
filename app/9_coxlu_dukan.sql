-- =====================================================================
--  SimplePOS Cloud — bir hesabda bir neçə dükan (mühasib rejimi),
--  dükan dəyişdirici, dükanın sahəsi (mebel, elektronika, ...).
--  Təkrar işlətmək təhlükəsizdir. Mövcud dükanlar olduğu kimi işləyir.
-- =====================================================================

-- 1. Dükanın sahəsi
alter table public.magazalar add column if not exists sahe text not null default 'mebel';

-- 2. İstifadəçi profili: adi (dükan) və ya mühasib hesabı
create table if not exists public.profiller (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nov       text not null default 'dukan' check (nov in ('dukan','muhasib')),
  ad        text,
  telefon   text,
  yaradildi timestamptz not null default now()
);
alter table public.profiller enable row level security;
drop policy if exists oxu on public.profiller;
create policy oxu on public.profiller for select to authenticated using (user_id = (select auth.uid()));
grant select on public.profiller to authenticated;
insert into public.profiller(user_id, ad)
  select distinct on (user_id) user_id, ad from public.uzvler order by user_id, yaradildi
on conflict (user_id) do nothing;

-- 3. Üzvlük: bir istifadəçi bir neçə dükanda; "secili" = hazırda açıq olan dükan
alter table public.uzvler add column if not exists secili boolean not null default true;
do $$
begin
  if (select array_length(conkey, 1) from pg_constraint
      where conrelid = 'public.uzvler'::regclass and contype = 'p') = 1 then
    alter table public.uzvler drop constraint uzvler_pkey;
    alter table public.uzvler add constraint uzvler_pkey primary key (user_id, magaza_id);
  end if;
end $$;
create unique index if not exists uzvler_bir_secili on public.uzvler(user_id) where secili;

-- Açıq dükan: seçilmiş (bloklanmamış) üzvlük; yoxdursa ən köhnəsi
create or replace function public.magazam() returns bigint
language sql stable security definer set search_path = public as $$
  select magaza_id from public.uzvler
  where user_id = auth.uid() and rol <> 'bloklu'
  order by secili desc, yaradildi, magaza_id
  limit 1
$$;
create or replace function public.rolum() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.uzvler where user_id = auth.uid() and magaza_id = public.magazam()
$$;

-- 4. Dükan dəyişdirici
create or replace function public.magaza_sec(m bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.uzvler where user_id = auth.uid() and magaza_id = m and rol <> 'bloklu') then
    raise exception 'Bu dükana girişiniz yoxdur';
  end if;
  update public.uzvler set secili = false where user_id = auth.uid() and secili and magaza_id <> m;
  update public.uzvler set secili = true where user_id = auth.uid() and magaza_id = m;
end $$;

-- 5. Yeni firma (dükan) yaratmaq — yaradan onun mühasibi olur, sınaq müddəti verilir
create or replace function public.firma_yarat(ad text, telefon text default null, sahe text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare m bigint; u uuid := auth.uid(); em text; pad text;
begin
  if u is null then raise exception 'Daxil olun'; end if;
  if coalesce(trim(ad), '') = '' then raise exception 'Firmanın adını yazın'; end if;
  if (select count(*) from public.uzvler where user_id = u) >= 100 then raise exception 'Firma sayı limiti dolub'; end if;
  select email into em from auth.users where id = u;
  select p.ad into pad from public.profiller p where p.user_id = u;
  insert into public.magazalar(ad, sahib_ad, telefon, email, abune_bitir, sahe)
    values (trim(ad), pad, nullif(trim(coalesce(telefon, '')), ''), em,
            public.bugun() + coalesce((select deyer::int from public.sistem where acar = 'sinaq_gun'), 14),
            coalesce(nullif(trim(coalesce(sahe, '')), ''), 'diger'))
    returning id into m;
  update public.uzvler set secili = false where user_id = u and secili;
  insert into public.uzvler(user_id, magaza_id, rol, ad, email, secili) values (u, m, 'muhasib', pad, em, true);
  perform public.magaza_hazirla(m);
  return m;
end $$;

-- 6. Mövcud dükana dəvət kodu ilə qoşulmaq (yalnız baxış; yazma hüququnu dükanın mühasibi verir)
create or replace function public.firma_qosul(kod text) returns text
language plpgsql security definer set search_path = public as $$
declare m bigint; mad text; u uuid := auth.uid();
begin
  if u is null then raise exception 'Daxil olun'; end if;
  select id, magazalar.ad into m, mad from public.magazalar where devet_kodu = upper(trim(kod)) and not dayandirilib;
  if m is null then raise exception 'Dəvət kodu səhvdir'; end if;
  if exists (select 1 from public.uzvler where user_id = u and magaza_id = m) then raise exception 'Bu dükana artıq bağlısınız'; end if;
  insert into public.uzvler(user_id, magaza_id, rol, ad, email, secili)
    values (u, m, 'sahibkar', (select p.ad from public.profiller p where p.user_id = u), (select email from auth.users where id = u), false);
  return mad;
end $$;

-- 7. Firmalarım: hər dükan üzrə qısa göstəricilər
drop function if exists public.firmalarim();
create function public.firmalarim()
returns table(id bigint, ad text, sahe text, rol text, secili boolean, abune_bitir date, dayandirilib boolean,
              musteri bigint, borc numeric, gecikan bigint, gecikmis_borc numeric, bu_ay numeric, bu_gun numeric)
language sql stable security definer set search_path = public as $$
  select m.id, m.ad, m.sahe, u.rol, (m.id = public.magazam()), m.abune_bitir, m.dayandirilib,
         coalesce(v.mus, 0), coalesce(v.borc, 0), coalesce(v.gec, 0), coalesce(v.gecm, 0),
         coalesce(o.ay, 0), coalesce(o.gun, 0)
  from public.uzvler u
  join public.magazalar m on m.id = u.magaza_id
  left join lateral (select count(*) mus,
                            sum(x.qaliq) filter (where x.qaliq > 0) borc,
                            count(*) filter (where x.qaliq > 0 and x.gecikme_gun > 0) gec,
                            sum(x.qaliq) filter (where x.qaliq > 0 and x.gecikme_gun > 0) gecm
                     from public.v_musteriler x where x.magaza_id = m.id) v on true
  left join lateral (select sum(s.mebleg) filter (where s.tarix >= date_trunc('month', public.bugun())::date) ay,
                            sum(s.mebleg) filter (where s.tarix = public.bugun()) gun
                     from public.satis_odenisleri s
                     where s.magaza_id = m.id and s.tarix >= date_trunc('month', public.bugun())::date) o on true
  where u.user_id = auth.uid() and u.rol <> 'bloklu'
  order by (m.id = public.magazam()) desc, m.ad
$$;

-- 8. Qeydiyyat: dükan, mühasib hesabı və ya dəvət kodu
create or replace function public.yeni_istifadeci() returns trigger
language plpgsql security definer set search_path = public as $f$
declare md jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); m bigint; kod text;
        muh boolean := coalesce(md->>'hesab', '') = 'muhasib';
begin
  insert into public.profiller(user_id, nov, ad, telefon)
    values (new.id, case when muh then 'muhasib' else 'dukan' end, nullif(trim(md->>'ad'), ''), nullif(trim(md->>'telefon'), ''))
  on conflict (user_id) do nothing;
  kod := upper(trim(coalesce(md->>'devet_kodu', '')));
  if kod <> '' then
    select id into m from public.magazalar where devet_kodu = kod;
    if m is null then raise exception 'Dəvət kodu səhvdir'; end if;
    insert into public.uzvler(user_id, magaza_id, rol, ad, email)
      values (new.id, m, 'sahibkar', nullif(trim(md->>'ad'), ''), new.email);
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
end $f$;

-- Dükanın sahəsini Ayarlardan dəyişmək üçün
grant update (ad, telefon, sahe) on public.magazalar to authenticated;

revoke all on function public.magaza_sec(bigint), public.firma_yarat(text, text, text),
  public.firma_qosul(text), public.firmalarim() from public, anon;
grant execute on function public.magaza_sec(bigint), public.firma_yarat(text, text, text),
  public.firma_qosul(text), public.firmalarim() to authenticated;
notify pgrst, 'reload schema';

-- 9. Dükan dəyişdirici üçün yüngül siyahı
create or replace function public.uzvluklerim() returns table(id bigint, ad text, rol text)
language sql stable security definer set search_path = public as $$
  select m.id, m.ad, u.rol from public.uzvler u join public.magazalar m on m.id = u.magaza_id
  where u.user_id = auth.uid() and u.rol <> 'bloklu' order by m.ad
$$;
revoke all on function public.uzvluklerim() from public, anon;
grant execute on function public.uzvluklerim() to authenticated;
notify pgrst, 'reload schema';
