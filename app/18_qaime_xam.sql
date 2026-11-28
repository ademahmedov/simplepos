-- SimplePOS Cloud — e-taxes faylının bütün sütunları (qaimənin xam məlumatı). Təkrar işlətmək təhlükəsizdir.
alter table public.qaimeler add column if not exists xam jsonb;
notify pgrst, 'reload schema';
-- bir sorğu ilə çoxlu qaimənin xam məlumatını yaz (RLS işləyir — yalnız öz müəssisənin qaimələri)
create or replace function public.qaime_xam_yaz(j jsonb) returns integer
language sql security invoker set search_path = public as $$
  with u as (update public.qaimeler q set xam = e.xam from jsonb_to_recordset(j) as e(id bigint, xam jsonb) where q.id = e.id returning 1)
  select count(*)::int from u
$$;
grant execute on function public.qaime_xam_yaz(jsonb) to authenticated;
notify pgrst, 'reload schema';
