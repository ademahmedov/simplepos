-- =====================================================================
--  SimplePOS Cloud — admin rejimi: admin öz müəssisəsi olmadan siyahıdan istədiyinə girir
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
-- admin girişi ilə əlavə olunan üzvlük yalnız seçiləndə aktivdir
create or replace function public.magazam() returns bigint
language sql stable security definer set search_path = public as $$
  select magaza_id from public.uzvler
  where user_id = auth.uid() and rol <> 'bloklu' and (not admin_giris or secili)
  order by secili desc, yaradildi, magaza_id
  limit 1
$$;

drop function if exists public.admin_cix();
create function public.admin_cix() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.uzvler set secili = false where user_id = auth.uid() and admin_giris and secili;
  return true;
end $$;
grant execute on function public.admin_cix() to authenticated;

create or replace function public.uzvluklerim() returns table(id bigint, ad text, rol text)
language sql stable security definer set search_path = public as $$
  select m.id, m.ad, u.rol from public.uzvler u join public.magazalar m on m.id = u.magaza_id
  where u.user_id = auth.uid() and u.rol <> 'bloklu' and not u.admin_giris order by m.ad
$$;

-- istifadəçilər siyahısı (admin üçün)
create or replace function public.admin_istifadeciler() returns table(user_id uuid, email text, ad text, telefon text, meqsed text, qeydiyyat timestamptz, son_giris timestamptz, admin boolean, firmalar jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not public.adminem() then raise exception 'İcazə yoxdur'; end if;
  return query
  select u.id, u.email::text, p.ad, p.telefon, p.meqsed, u.created_at, u.last_sign_in_at,
         exists(select 1 from adminler a where a.user_id = u.id),
         coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'ad', m.ad, 'rol', z.rol, 'sahe', m.sahe) order by m.ad)
                   from uzvler z join magazalar m on m.id = z.magaza_id where z.user_id = u.id and not z.admin_giris), '[]'::jsonb)
  from auth.users u left join profiller p on p.user_id = u.id
  order by u.created_at desc;
end $$;
grant execute on function public.admin_istifadeciler() to authenticated;
notify pgrst, 'reload schema';
