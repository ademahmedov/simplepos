-- 22: qaytarma qaimələri ("Malların qaytarılması barədə elektron qaimə-faktura")
-- Gedən qaytarma (təchizatçıya qaytarırıq) 531 borcunu azaldır; gələn qaytarma (alıcı bizə qaytarır) 211 borcunu azaldır.
alter table public.qaimeler add column if not exists qaytarma boolean not null default false;
update public.qaimeler q set qaytarma = true
 where not q.qaytarma and q.xam is not null
   and exists (select 1 from jsonb_each_text(q.xam) e where lower(e.key) like '%növ%' and e.value ilike '%qaytarılması%');
create or replace view public.v_qaimeler with (security_invoker = true) as
select q.id, q.magaza_id, q.istiqamet, q.voen, q.kontragent, q.seriya, q.nomre, q.tarix, q.esas, q.edv, q.edvsiz, q.status, q.qeyd, q.yaradildi,
       q.esas + q.edv + q.edvsiz as cem,
       coalesce(o.odenilib, 0) as odenilib, coalesce(o.edv_odenilib, 0) as edv_odenilib,
       q.esas + q.edv + q.edvsiz - coalesce(o.odenilib, 0) as qaliq, o.son_odenis, q.qaytarma
from public.qaimeler q
left join (select qaime_id, sum(mebleg) odenilib, sum(edv) edv_odenilib, max(tarix) son_odenis
           from public.qaime_odenisleri group by qaime_id) o on o.qaime_id = q.id;
grant select on public.v_qaimeler to authenticated;
