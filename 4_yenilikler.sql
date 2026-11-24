-- =====================================================================
--  SimplePOS — yeniliklər 1: ödəniş qrafiki, maya dəyəri, jurnal,
--  istifadəçilər, firma məlumatları. Təkrar işlətmək təhlükəsizdir.
-- =====================================================================

-- ---------- Satış: ödəniş qrafiki və maya dəyəri ----------
alter table public.satislar add column if not exists ayliq      numeric(12,2) check (ayliq is null or ayliq > 0);
alter table public.satislar add column if not exists ilk_odenis date;
alter table public.satislar add column if not exists maya       numeric(12,2) check (maya is null or maya >= 0);

-- Hər satış üzrə qrafik: bu günə gözlənilən, gecikən, növbəti ödəniş
create or replace view public.v_qrafik with (security_invoker = true) as
select v.id, v.musteri_id, s.ayliq, s.ilk_odenis, s.maya,
       v.deyer - v.ilkin as kredit, v.odenilen, v.qaliq,
       (s.ayliq is not null and s.ilk_odenis is not null) as qrafikli,
       case when s.ayliq > 0 then ceil((v.deyer - v.ilkin) / s.ayliq)::int end as odenis_sayi,
       case when s.ayliq > 0 and s.ilk_odenis is not null
            then least(v.deyer - v.ilkin, s.ayliq * n.n) end as gozlenilen,
       case when s.ayliq > 0 and s.ilk_odenis is not null
            then greatest(0, least(v.deyer - v.ilkin, s.ayliq * n.n) - v.odenilen) end as gecikmis,
       case when s.ayliq > 0 and s.ilk_odenis is not null and v.qaliq > 0
            then (s.ilk_odenis + make_interval(months => floor(v.odenilen / s.ayliq)::int))::date end as novbeti_tarix,
       case when s.ayliq > 0 and s.ilk_odenis is not null and v.qaliq > 0
            then least(s.ayliq * (floor(v.odenilen / s.ayliq) + 1), v.deyer - v.ilkin) - v.odenilen end as novbeti_mebleg
from public.v_satislar v
join public.satislar s on s.id = v.id
cross join lateral (
  select case when s.ilk_odenis is null or s.ilk_odenis > current_date then 0
              else (extract(year from age(current_date, s.ilk_odenis)) * 12
                  + extract(month from age(current_date, s.ilk_odenis)))::int + 1 end as n
) n;

-- Müştəri gecikməsi: qrafiki olan satışda qrafikə görə, olmayanda "30 gün ödəniş yoxdur" qaydası
create or replace view public.v_musteriler with (security_invoker = true) as
select m.id, m.ad, m.unvan, m.telefon, m.qeyd,
       count(v.id)                        as satis_sayi,
       min(v.tarix)                       as ilk_satis,
       coalesce(sum(v.deyer), 0)          as cem,
       coalesce(sum(v.deyer - v.qaliq),0) as verilen,
       coalesce(sum(v.qaliq), 0)          as qaliq,
       greatest(max(v.tarix), max(v.son_odenis)) as son_tarix,
       max(case when v.qaliq > 0 then
             case when q.qrafikli then current_date - q.novbeti_tarix
                  else current_date - (greatest(v.tarix, coalesce(v.son_odenis, v.tarix)) + 30) end
           end)                           as gecikme_gun
from public.musteriler m
left join public.v_satislar v on v.musteri_id = m.id
left join public.v_qrafik q on q.id = v.id
group by m.id;

-- ---------- Firma məlumatları (müqavilə və qəbz üçün) ----------
insert into public.ayarlar(acar, deyer) values
  ('firma_adi', 'SimplePOS'), ('firma_unvan', ''), ('firma_telefon', ''), ('firma_voen', ''),
  ('muqavile_sertleri', 'Alıcı qrafikdə göstərilən məbləğləri vaxtında ödəməyi öhdəsinə götürür. Ödənişlər tam başa çatana qədər mal satıcının mülkiyyətində qalır.')
on conflict (acar) do nothing;

-- ---------- İstifadəçilər: e-poçt, bloklama, mühasib tərəfindən idarə ----------
alter table public.istifadeciler add column if not exists email text;
update public.istifadeciler i set email = u.email from auth.users u where u.id = i.id and i.email is distinct from u.email;
alter table public.istifadeciler drop constraint if exists istifadeciler_rol_check;
alter table public.istifadeciler add constraint istifadeciler_rol_check check (rol in ('muhasib','sahibkar','bloklu'));

create or replace function public.yeni_istifadeci() returns trigger
language plpgsql security definer set search_path = public as $f$
begin
  insert into public.istifadeciler(id, ad, rol, email) values (new.id, coalesce(new.email,'Sahibkar'), 'sahibkar', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $f$;

drop policy if exists yaz on public.istifadeciler;
create policy yaz on public.istifadeciler for update to authenticated
  using (public.rolum() = 'muhasib') with check (public.rolum() = 'muhasib');
grant update (ad, rol) on public.istifadeciler to authenticated;

-- Bloklanmış istifadəçi heç nə görməsin
do $$
declare t text;
begin
  foreach t in array array['ayarlar','musteriler','satislar','satis_odenisleri','rasxodlar',
                           'isciler','maas_deyisiklikleri','isci_odenisleri','kassa_diger','sifarisler']
  loop
    execute format('drop policy if exists oxu on public.%I', t);
    execute format('create policy oxu on public.%I for select to authenticated using (public.rolum() in (''muhasib'',''sahibkar''))', t);
  end loop;
end $$;

-- ---------- Dəyişiklik jurnalı ----------
create table if not exists public.jurnal (
  id         bigint generated by default as identity primary key,
  zaman      timestamptz not null default now(),
  istifadeci uuid,
  email      text,
  cedvel     text not null,
  emeliyyat  text not null,
  setir_id   bigint,
  kohne      jsonb,
  yeni       jsonb
);
create index if not exists jurnal_zaman on public.jurnal(zaman desc);

create or replace function public.jurnal_yaz() returns trigger
language plpgsql security definer set search_path = public as $f$
declare u uuid := auth.uid(); e text; r jsonb;
begin
  if u is null then return coalesce(new, old); end if;   -- SQL Editor-dan edilən işlər yazılmır
  select email into e from auth.users where id = u;
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.jurnal(istifadeci, email, cedvel, emeliyyat, setir_id, kohne, yeni)
  values (u, e, tg_table_name, tg_op, nullif(r->>'id','')::bigint,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $f$;

do $$
declare t text;
begin
  foreach t in array array['ayarlar','musteriler','satislar','satis_odenisleri','rasxodlar',
                           'isciler','maas_deyisiklikleri','isci_odenisleri','kassa_diger','sifarisler']
  loop
    execute format('drop trigger if exists jurnal_trg on public.%I', t);
    execute format('create trigger jurnal_trg after insert or update or delete on public.%I for each row execute function public.jurnal_yaz()', t);
  end loop;
end $$;

alter table public.jurnal enable row level security;
drop policy if exists oxu on public.jurnal;
create policy oxu on public.jurnal for select to authenticated using (public.rolum() in ('muhasib','sahibkar'));
grant select on public.jurnal to authenticated;
grant select on public.v_qrafik to authenticated;
revoke insert, update, delete on public.jurnal from authenticated;
