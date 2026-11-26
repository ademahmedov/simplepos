-- =====================================================================
--  SimplePOS Cloud — istifadəçinin məqsədi (mühasibatlıq, mebel, elektronika ...)
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
alter table public.profiller add column if not exists meqsed text;
update public.profiller set meqsed = 'muhasib' where nov = 'muhasib' and meqsed is null;

create or replace function public.meqsed_sec(m text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Daxil olun'; end if;
  if m is null or m not in ('muhasib','mebel','elektronika','telefon','geyim','tikinti','xalca','zinet','market','diger') then
    raise exception 'Yanlış seçim';
  end if;
  insert into public.profiller(user_id, meqsed) values (u, m)
    on conflict (user_id) do update set meqsed = excluded.meqsed;
  if m = 'muhasib' then
    update public.profiller set nov = 'muhasib' where user_id = u;
  else
    update public.magazalar set sahe = m where id = public.magazam() and public.rolum() = 'muhasib';
  end if;
end $$;
revoke all on function public.meqsed_sec(text) from public, anon;
grant execute on function public.meqsed_sec(text) to authenticated;

-- Qeydiyyatda seçilən məqsəd profilə yazılır
create or replace function public.yeni_istifadeci() returns trigger
language plpgsql security definer set search_path = public as $f$
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
notify pgrst, 'reload schema';
