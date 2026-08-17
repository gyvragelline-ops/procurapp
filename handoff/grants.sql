-- Habilita al rol anon (usado por el cliente browser vía @supabase/ssr con la
-- publishable/anon key) a crear un donante de prueba y leer el seed del
-- trigger. Sin políticas RLS finas todavía -- MVP de esta semana.
alter table donantes disable row level security;
alter table etapas_estado disable row level security;
alter table muestras disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on donantes to anon, authenticated;
grant select, insert on etapas_estado to anon, authenticated;
grant select, insert on muestras to anon, authenticated;
