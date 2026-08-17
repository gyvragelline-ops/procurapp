alter table documentacion_estado disable row level security;
alter table mantenimiento_log disable row level security;

grant select on documentacion_estado to anon, authenticated;
grant select on mantenimiento_log to anon, authenticated;
