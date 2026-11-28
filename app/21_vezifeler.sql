-- =====================================================================
--  SimplePOS Cloud — vəzifələr və icazələr (Admin, Mühasib, Operator, Direktor, Kuryer),
--  işçi hesabları (istifadəçi adı + parol), bir işçini bir neçə müəssisəyə bağlamaq.
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
alter table public.uzvler add column if not exists icazeler jsonb;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.uzvler'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%sahibkar%' loop
    execute format('alter table public.uzvler drop constraint %I', c); end loop;
end $$;
alter table public.uzvler add constraint uzvler_rol_check check (rol in ('admin', 'muhasib', 'operator', 'sahibkar', 'kuryer', 'bloklu', 'gozleyir'));

-- vəzifəyə görə standart icazələr
create or replace function public.icaze_def(r text, k text) returns boolean
language sql immutable as $$
  select case
    when r = 'admin' then true
    when r = 'muhasib' then k in ('elave', 'duzelis', 'sil', 'hesabat', 'ayarlar')
    when r = 'operator' then k in ('elave', 'duzelis')
    when r = 'sahibkar' then k in ('hesabat')
    else false end
$$;
create or replace function public.icazem(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.adminem() or coalesce((select coalesce((u.icazeler->>k)::boolean, public.icaze_def(u.rol, k))
    from public.uzvler u where u.user_id = auth.uid() and u.magaza_id = public.magazam() and u.rol not in ('bloklu', 'gozleyir')), false)
$$;
create or replace function public.baxa_bilerem() returns boolean
language sql stable security definer set search_path = public as $$
  select public.adminem() or coalesce(public.rolum() in ('admin', 'muhasib', 'operator', 'sahibkar'), false)
$$;
grant execute on function public.icazem(text), public.baxa_bilerem(), public.icaze_def(text, text) to authenticated;

-- RLS: "rolum() = 'muhasib'" şərtlərini icazələrlə əvəz et
do $$
declare p record; q text; w text; perm text; rolsiz text;
begin
  for p in select * from pg_policies where schemaname = 'public'
           and (coalesce(qual, '') like '%rolum() AS rolum)%' or coalesce(with_check, '') like '%rolum() AS rolum)%') loop
    perm := case when p.tablename = 'uzvler' then 'istifadeciler'
                 when p.tablename in ('magazalar', 'ayarlar', 'telegram', 'telegram_alicilar') then 'ayarlar'
                 when p.cmd = 'INSERT' then 'elave' when p.cmd = 'DELETE' then 'sil' else 'duzelis' end;
    q := p.qual; w := p.with_check;
    q := replace(q, '(( SELECT rolum() AS rolum) = ANY (ARRAY[''muhasib''::text, ''sahibkar''::text, ''kuryer''::text]))', '(( SELECT public.baxa_bilerem() AS b) OR (( SELECT rolum() AS rolum) = ''kuryer''::text))');
    q := replace(q, '(( SELECT rolum() AS rolum) = ANY (ARRAY[''muhasib''::text, ''sahibkar''::text]))', '( SELECT public.baxa_bilerem() AS b)');
    q := replace(q, '(( SELECT rolum() AS rolum) = ''muhasib''::text)', format('( SELECT public.icazem(%L) AS i)', perm));
    w := replace(w, '(( SELECT rolum() AS rolum) = ''muhasib''::text)', format('( SELECT public.icazem(%L) AS i)', perm));
    if q is not distinct from p.qual and w is not distinct from p.with_check then continue; end if;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute format('create policy %I on public.%I as %s for %s to %s%s%s', p.policyname, p.tablename, p.permissive, p.cmd,
      array_to_string(p.roles, ', '), case when q is not null then ' using (' || q || ')' else '' end, case when w is not null then ' with check (' || w || ')' else '' end);
  end loop;
end $$;

-- köhnə funksiyalardakı "muhasib" yoxlamaları
do $$
declare f text; d text; n text;
begin
  foreach f in array array['devet_yenile', 'telegram_gonder', 'telegram_metn', 'telegram_saat_qur', 'meqsed_sec'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = f limit 1;
    if d is null then continue; end if;
    n := d;
    n := replace(n, 'public.rolum() is distinct from ''muhasib''', case when f = 'devet_yenile' then 'not public.icazem(''istifadeciler'')' else 'not public.icazem(''ayarlar'')' end);
    n := replace(n, 'coalesce(public.rolum(), '''') not in (''muhasib'',''sahibkar'')', 'not public.baxa_bilerem()');
    n := replace(n, 'and public.rolum() = ''muhasib''', 'and public.icazem(''ayarlar'')');
    if n <> d then execute n; end if;
  end loop;
end $$;

-- müəssisəni yaradan onun admini olur
update public.uzvler u set rol = 'admin' from public.magazalar m
  where m.id = u.magaza_id and lower(u.email) = lower(m.email) and u.rol = 'muhasib' and not u.admin_giris;
update public.uzvler u set rol = 'admin'
  where u.rol = 'muhasib' and not u.admin_giris
    and not exists (select 1 from public.uzvler z where z.magaza_id = u.magaza_id and z.rol = 'admin')
    and u.yaradildi = (select min(z.yaradildi) from public.uzvler z where z.magaza_id = u.magaza_id and z.rol = 'muhasib' and not z.admin_giris);

create or replace function public.firma_yarat(ad text, telefon text default null, sahe text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare m bigint; u uuid := auth.uid(); em text; pad text;
begin
  if u is null then raise exception 'Daxil olun'; end if;
  if coalesce(trim(ad), '') = '' then raise exception 'Müəssisənin adını yazın'; end if;
  if (select count(*) from public.uzvler where user_id = u) >= 100 then raise exception 'Müəssisə sayı limiti dolub'; end if;
  select email into em from auth.users where id = u;
  select p.ad into pad from public.profiller p where p.user_id = u;
  insert into public.magazalar(ad, sahib_ad, telefon, email, abune_bitir, sahe)
    values (trim(ad), pad, nullif(trim(coalesce(telefon, '')), ''), em,
            public.bugun() + coalesce((select deyer::int from public.sistem where acar = 'sinaq_gun'), 14),
            coalesce(nullif(trim(coalesce(sahe, '')), ''), 'diger'))
    returning id into m;
  update public.uzvler set secili = false where user_id = u and secili;
  insert into public.uzvler(user_id, magaza_id, rol, ad, email, secili) values (u, m, 'admin', pad, em, true);
  perform public.magaza_hazirla(m);
  return m;
end $$;

create or replace function public.yeni_istifadeci() returns trigger
language plpgsql security definer set search_path = public as $$
declare md jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); m bigint; kod text;
        muh boolean := coalesce(md->>'hesab', '') = 'muhasib';
begin
  insert into public.profiller(user_id, nov, ad, telefon, meqsed)
    values (new.id, case when muh then 'muhasib' else 'dukan' end, nullif(trim(md->>'ad'), ''), nullif(trim(md->>'telefon'), ''),
            case when muh then 'muhasib' when md ? 'isci' then 'isci' else nullif(trim(coalesce(md->>'sahe', '')), '') end)
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
      values (new.id, m, 'admin', nullif(trim(md->>'ad'), ''), new.email);
    perform public.magaza_hazirla(m);
  end if;
  return new;
end $$;

-- ---------- işçi hesabları ----------
-- istifadəçinin admin olduğu müəssisələr
create or replace function public.idare_firmalarim() returns table(id bigint, ad text, sahe text)
language sql stable security definer set search_path = public as $$
  select m.id, m.ad, m.sahe from public.uzvler u join public.magazalar m on m.id = u.magaza_id
  where u.user_id = auth.uid() and u.rol = 'admin' and not u.admin_giris order by m.ad
$$;
-- idarə etdiyim işçilər: admin olduğum müəssisələrin üzvləri + mənim yaratdığım işçi hesabları
create or replace function public.isci_siyahi() returns table(user_id uuid, email text, ad text, login text, isci boolean, son_giris timestamptz, uzvluk jsonb)
language sql stable security definer set search_path = public, auth as $$
  with mf as (select magaza_id from public.uzvler where user_id = auth.uid() and rol = 'admin' and not admin_giris),
       us as (select distinct z.user_id from public.uzvler z where z.magaza_id in (select magaza_id from mf) and z.user_id <> auth.uid() and not z.admin_giris
              union select a.id from auth.users a where a.raw_user_meta_data->>'yaradan' = auth.uid()::text)
  select a.id, a.email::text, coalesce(p.ad, a.raw_user_meta_data->>'ad'), a.raw_user_meta_data->>'login', a.raw_user_meta_data ? 'isci', a.last_sign_in_at,
         coalesce((select jsonb_agg(jsonb_build_object('m', z.magaza_id, 'ad', m.ad, 'rol', z.rol, 'icazeler', z.icazeler) order by m.ad)
                   from public.uzvler z join public.magazalar m on m.id = z.magaza_id where z.user_id = a.id and z.magaza_id in (select magaza_id from mf)), '[]'::jsonb)
  from us join auth.users a on a.id = us.user_id left join public.profiller p on p.user_id = a.id
  order by 3
$$;

create or replace function public.isci_yarat(login text, parol text, ad text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare u uuid := gen_random_uuid(); l text := lower(trim(login)); em text;
begin
  if not exists (select 1 from public.uzvler where user_id = auth.uid() and rol = 'admin') and not public.adminem() then raise exception 'İcazə yoxdur'; end if;
  if l !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then raise exception 'İstifadəçi adı 3–30 simvol olmalıdır: kiçik latın hərfləri, rəqəm, nöqtə, defis'; end if;
  if length(coalesce(parol, '')) < 6 then raise exception 'Parol ən azı 6 simvol olmalıdır'; end if;
  em := l || '@isci.simplepos.az';
  if exists (select 1 from auth.users where email = em) then raise exception 'Bu istifadəçi adı artıq tutulub — başqa ad seçin'; end if;
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                         created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', em, crypt(parol, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('ad', trim(ad), 'login', l, 'isci', true, 'yaradan', auth.uid()::text),
          now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities(id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), u::text, u, jsonb_build_object('sub', u::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  return u;
end $$;

-- işçinin parolunu dəyişmək (yaradan və ya sayt admini)
create or replace function public.isci_parol(u uuid, parol text) returns boolean
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.adminem() and not exists (select 1 from auth.users where id = u and raw_user_meta_data->>'yaradan' = auth.uid()::text) then raise exception 'İcazə yoxdur'; end if;
  if length(coalesce(parol, '')) < 6 then raise exception 'Parol ən azı 6 simvol olmalıdır'; end if;
  update auth.users set encrypted_password = crypt(parol, gen_salt('bf')), updated_at = now() where id = u;
  return true;
end $$;

-- işçini müəssisəyə bağla / vəzifə və icazələri dəyiş (yalnız admini olduğum müəssisədə)
create or replace function public.isci_uzvluk(u uuid, m bigint, r text, ic jsonb) returns boolean
language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.uzvler where user_id = auth.uid() and magaza_id = m and rol = 'admin') and not public.adminem() then raise exception 'Bu müəssisədə admin deyilsiniz'; end if;
  if r not in ('admin', 'muhasib', 'operator', 'sahibkar', 'kuryer', 'bloklu') then raise exception 'Vəzifə səhvdir'; end if;
  if u = auth.uid() then raise exception 'Öz vəzifənizi dəyişə bilməzsiniz'; end if;
  insert into public.uzvler(user_id, magaza_id, rol, icazeler, ad, email, secili)
    values (u, m, r, ic, (select coalesce(p.ad, a.raw_user_meta_data->>'ad') from auth.users a left join public.profiller p on p.user_id = a.id where a.id = u), (select email from auth.users where id = u), false)
  on conflict (user_id, magaza_id) do update set rol = excluded.rol, icazeler = excluded.icazeler;
  return true;
end $$;
create or replace function public.isci_uzvluk_sil(u uuid, m bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.uzvler where user_id = auth.uid() and magaza_id = m and rol = 'admin') and not public.adminem() then raise exception 'Bu müəssisədə admin deyilsiniz'; end if;
  if u = auth.uid() then raise exception 'Özünüzü çıxara bilməzsiniz'; end if;
  delete from public.uzvler where user_id = u and magaza_id = m and not admin_giris;
  return true;
end $$;
grant execute on function public.idare_firmalarim(), public.isci_siyahi(), public.isci_yarat(text, text, text), public.isci_parol(uuid, text), public.isci_uzvluk(uuid, bigint, text, jsonb), public.isci_uzvluk_sil(uuid, bigint) to authenticated;
notify pgrst, 'reload schema';
