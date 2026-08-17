-- Habilita lectura (anon/authenticated) de las tablas que necesita la
-- vista Procurador para mostrar donantes y sus datos reales por etapa.
-- Todavía sin políticas RLS finas -- MVP, solo lectura desde el cliente.
alter table familiares disable row level security;
alter table campo_mapeo disable row level security;
alter table planilla_valores disable row level security;
alter table organos disable row level security;

grant select on familiares to anon, authenticated;
grant select on campo_mapeo to anon, authenticated;
grant select on planilla_valores to anon, authenticated;
grant select on organos to anon, authenticated;
