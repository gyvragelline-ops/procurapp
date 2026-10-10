create table if not exists cultivos (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  tipo text not null check (tipo in ('aspirado_traqueal','hemocultivo','punta_cvc','punta_tam','lcr','urocultivo','otro')),
  tipo_otro text check (tipo_otro is null or length(trim(tipo_otro)) between 1 and 60),
  tomado_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente','negativo','positivo')),
  germen text check (germen is null or length(trim(germen)) between 1 and 120),
  sensibilidad text check (sensibilidad is null or length(trim(sensibilidad)) between 1 and 500),
  resultado_en timestamptz,
  modificado_en timestamptz,
  anulado boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cultivos_otro_con_texto check ((tipo = 'otro') = (tipo_otro is not null)),
  constraint cultivos_resultado_con_hora check ((estado = 'pendiente') = (resultado_en is null)),
  constraint cultivos_solo_positivo_con_datos check (estado = 'positivo' or (germen is null and sensibilidad is null)),
  constraint cultivos_positivo_con_germen check (estado <> 'positivo' or germen is not null)
);
create index if not exists cultivos_donante on cultivos (donante_id, tomado_en desc);
alter table cultivos disable row level security;
revoke all on cultivos from anon, authenticated;
grant select, insert on cultivos to anon, authenticated;
grant update (estado, germen, sensibilidad, resultado_en, modificado_en, anulado) on cultivos to anon, authenticated;
