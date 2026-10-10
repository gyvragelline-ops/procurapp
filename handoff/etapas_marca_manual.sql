alter table etapas_estado add column if not exists marcado_manual text;
alter table etapas_estado add column if not exists marcado_en timestamptz;
alter table etapas_estado drop constraint if exists etapas_estado_marca_valida;
alter table etapas_estado add constraint etapas_estado_marca_valida check (marcado_manual is null or marcado_manual in ('completo', 'no_completo'));
grant select, insert on etapas_estado to anon, authenticated;
grant update (marcado_manual, marcado_en, updated_at) on etapas_estado to anon, authenticated;
grant select, insert on timeline_eventos to anon, authenticated;
notify pgrst, 'reload schema';
