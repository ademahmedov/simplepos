-- =====================================================================
--  SimplePOS Cloud — admin istifadəçini və müəssisəni silə bilsin
--  Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
-- toplu silmə zamanı jurnal yazılmasın (silinən müəssisəyə istinad edən jurnal sətri yaranmasın)
create or replace function public.jurnal_yaz() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); e text; r jsonb;
begin
  if u is null or current_setting('app.jurnal_off', true) = '1' then return coalesce(new, old); end if;
  select email into e from auth.users where id = u;
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.jurnal(magaza_id, istifadeci, email, cedvel, emeliyyat, setir_id, kohne, yeni)
  values (nullif(r->>'magaza_id', '')::bigint, u, e, tg_table_name, tg_op, nullif(r->>'id', '')::bigint,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public.admin_firma_sil(m bigint) returns text
language plpgsql security definer set search_path = public as $$
declare ad_ text;
begin
  if not public.adminem() then raise exception 'İcazə yoxdur'; end if;
  select ad into ad_ from public.magazalar where id = m;
  if ad_ is null then raise exception 'Müəssisə tapılmadı'; end if;
  perform set_config('app.jurnal_off', '1', true);
  delete from public.magazalar where id = m;
  return ad_;
end $$;
grant execute on function public.admin_firma_sil(bigint) to authenticated;

-- istifadəçini sil; firmalar_da = true olanda yalnız onun (başqa üzvü olmayan) müəssisələri də silinir
create or replace function public.admin_istifadeci_sil(u uuid, firmalar_da boolean default false) returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n int := 0;
begin
  if not public.adminem() then raise exception 'İcazə yoxdur'; end if;
  if u = auth.uid() then raise exception 'Öz hesabınızı silə bilməzsiniz'; end if;
  perform set_config('app.jurnal_off', '1', true);
  if firmalar_da then
    with s as (delete from public.magazalar m
               where m.id in (select magaza_id from public.uzvler where user_id = u and not admin_giris)
                 and not exists (select 1 from public.uzvler z where z.magaza_id = m.id and z.user_id <> u and not z.admin_giris)
               returning 1)
    select count(*) into n from s;
  end if;
  delete from auth.users where id = u;
  return n;
end $$;
grant execute on function public.admin_istifadeci_sil(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
