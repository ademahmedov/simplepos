-- =====================================================================
--  SimplePOS — Telegram gündəlik xülasə. Təkrar işlətmək təhlükəsizdir.
-- =====================================================================
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.telegram (
  id    int primary key default 1 check (id = 1),
  token text,
  bot   text,
  saat  int not null default 20 check (saat between 0 and 23)
);
insert into public.telegram(id) values (1) on conflict (id) do nothing;

create table if not exists public.telegram_alicilar (
  chat_id bigint primary key,
  ad      text,
  elave   timestamptz not null default now()
);

alter table public.telegram enable row level security;
alter table public.telegram_alicilar enable row level security;
drop policy if exists muhasib on public.telegram;
create policy muhasib on public.telegram for all to authenticated
  using ((select public.rolum()) = 'muhasib') with check ((select public.rolum()) = 'muhasib');
drop policy if exists muhasib on public.telegram_alicilar;
create policy muhasib on public.telegram_alicilar for all to authenticated
  using ((select public.rolum()) = 'muhasib') with check ((select public.rolum()) = 'muhasib');
grant select, insert, update, delete on public.telegram, public.telegram_alicilar to authenticated;
revoke all on public.telegram, public.telegram_alicilar from anon;

-- Məbləğ: 12 345 ₼
create or replace function public.tg_m(x numeric) returns text language sql immutable as $$
  select replace(to_char(round(coalesce(x, 0)), 'FM999,999,999,990'), ',', ' ') || ' ₼'
$$;
create or replace function public.tg_h(x text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(x, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

-- Xülasənin mətni
create or replace function public.telegram_metn(d date default null) returns text
language plpgsql stable security definer set search_path = public as $f$
declare
  g date := coalesce(d, (now() at time zone 'Asia/Baku')::date);
  aylar text[] := array['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'];
  firma text; s_say int; s_cem numeric; ilk numeric; od numeric; dmed numeric; dmex numeric; rx numeric; maas numeric; sah numeric;
  a record; kassa numeric; borc numeric; borc_say int; gec numeric; gec_say int;
  sab_say int; sab_cem numeric; sab_list text; xalis numeric; t text;
begin
  if auth.uid() is not null and coalesce(public.rolum(), '') not in ('muhasib','sahibkar') then raise exception 'İcazə yoxdur'; end if;
  select coalesce(nullif(deyer, ''), 'SimplePOS') into firma from ayarlar where acar = 'firma_adi';
  select count(*), coalesce(sum(deyer), 0), coalesce(sum(ilkin), 0) into s_say, s_cem, ilk from satislar where tarix = g;
  select coalesce(sum(mebleg), 0) into od from satis_odenisleri where tarix = g;
  select coalesce(sum(mebleg) filter (where nov = 'Mədaxil'), 0), coalesce(sum(mebleg) filter (where nov = 'Məxaric'), 0)
    into dmed, dmex from kassa_diger where tarix = g;
  select coalesce(sum(mebleg), 0) into rx from rasxodlar where tarix = g;
  select coalesce(sum(o.mebleg) filter (where i.nov = 'İşçi'), 0), coalesce(sum(o.mebleg) filter (where i.nov = 'Sahib'), 0)
    into maas, sah from isci_odenisleri o join isciler i on i.id = o.isci_id where o.tarix = g and o.nov in ('Avans','Maaş');
  select * into a from v_kassa where ay = date_trunc('month', g)::date;
  select ay_sonu_kassa into kassa from v_kassa order by ay desc limit 1;
  select coalesce(sum(qaliq), 0), count(*) filter (where qaliq > 0),
         coalesce(sum(qaliq) filter (where qaliq > 0 and gecikme_gun > 0), 0), count(*) filter (where qaliq > 0 and gecikme_gun > 0)
    into borc, borc_say, gec, gec_say from v_musteriler;
  select count(*), coalesce(sum(q.novbeti_mebleg), 0),
         string_agg('  • ' || tg_h(m.ad) || ' — ' || tg_m(q.novbeti_mebleg), chr(10) order by q.novbeti_mebleg desc)
    into sab_say, sab_cem, sab_list
    from (select * from v_qrafik where qaliq > 0 and novbeti_tarix = g + 1) q join musteriler m on m.id = q.musteri_id;
  xalis := ilk + od + dmed - rx - maas - sah - dmex;

  t := '📊 <b>' || tg_h(firma) || '</b> — ' || to_char(g, 'DD.MM.YYYY') || chr(10) || chr(10)
    || '<b>Bu gün</b>' || chr(10)
    || '🛋 Satış: ' || s_say || ' ədəd · ' || tg_m(s_cem) || chr(10)
    || '💵 Kassaya daxil: ' || tg_m(ilk + od + dmed)
       || case when ilk + od + dmed > 0 then ' (ilkin ' || tg_m(ilk) || ', ödənişlər ' || tg_m(od)
          || case when dmed > 0 then ', digər ' || tg_m(dmed) else '' end || ')' else '' end || chr(10)
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

-- Bütün alıcılara göndərir (daxili — cron və aşağıdakı funksiya işlədir)
create or replace function public.telegram_gonder_daxili() returns int
language plpgsql security definer set search_path = public, extensions as $f$
declare tk text; m text; r record; n int := 0;
begin
  select token into tk from telegram where id = 1;
  if tk is null or tk = '' then return 0; end if;
  m := public.telegram_metn();
  for r in select chat_id from telegram_alicilar loop
    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || tk || '/sendMessage',
      body    := jsonb_build_object('chat_id', r.chat_id, 'text', m, 'parse_mode', 'HTML', 'disable_web_page_preview', true),
      headers := '{"Content-Type":"application/json"}'::jsonb);
    n := n + 1;
  end loop;
  return n;
end $f$;
revoke all on function public.telegram_gonder_daxili() from public, anon, authenticated;

-- Proqramdakı "İndi göndər" düyməsi
create or replace function public.telegram_gonder() returns int
language plpgsql security definer set search_path = public as $f$
begin
  if public.rolum() is distinct from 'muhasib' then raise exception 'İcazə yoxdur'; end if;
  return public.telegram_gonder_daxili();
end $f$;

-- Göndərmə saatı (Bakı vaxtı ilə)
create or replace function public.telegram_saat_qur(h int) returns void
language plpgsql security definer set search_path = public as $f$
begin
  if public.rolum() is distinct from 'muhasib' then raise exception 'İcazə yoxdur'; end if;
  if h < 0 or h > 23 then raise exception 'Saat 0–23 olmalıdır'; end if;
  update telegram set saat = h where id = 1;
  perform cron.schedule('simplepos-telegram', format('0 %s * * *', (h - 4 + 24) % 24), 'select public.telegram_gonder_daxili()');
end $f$;

revoke all on function public.telegram_metn(date), public.telegram_gonder(), public.telegram_saat_qur(int) from public, anon;
grant execute on function public.telegram_metn(date), public.telegram_gonder(), public.telegram_saat_qur(int) to authenticated;

-- Hər gün 20:00 (Bakı) = 16:00 UTC
select cron.schedule('simplepos-telegram', '0 16 * * *', 'select public.telegram_gonder_daxili()');
