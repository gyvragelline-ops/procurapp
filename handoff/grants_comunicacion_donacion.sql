create table comunicacion_donacion_analisis (
  id                uuid primary key default gen_random_uuid(),
  donante_id        uuid not null references donantes(id) on delete cascade,
  texto             text not null,
  etapa_detectada   int,
  confianza         text,
  herramientas      jsonb default '[]'::jsonb,
  created_at        timestamptz default now()
);
create index on comunicacion_donacion_analisis (donante_id, created_at desc);

alter table comunicacion_donacion_analisis disable row level security;
grant select, insert on comunicacion_donacion_analisis to anon, authenticated;

-- timeline_eventos no tenía grants todavía; lo usamos para dejar un registro
-- corto de cada análisis en la línea de tiempo del caso.
alter table timeline_eventos disable row level security;
grant select, insert on timeline_eventos to anon, authenticated;
