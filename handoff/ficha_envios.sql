create table if not exists ficha_envios (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  organo_key text not null,
  version integer not null,
  valores jsonb not null default '{}'::jsonb,
  editados jsonb not null default '[]'::jsonb,
  incluye jsonb not null default '{}'::jsonb,
  creado_por text,
  creado_en timestamptz not null default now(),
  vence_en timestamptz,
  estado text not null default 'descargado',
  anulado boolean not null default false,
  anulado_en timestamptz,
  constraint ficha_envios_organo_valido check (organo_key in ('pulmon', 'corazon', 'rinon', 'higado', 'pancreas')),
  constraint ficha_envios_version_positiva check (version >= 1),
  constraint ficha_envios_estado_valido check (estado in ('descargado', 'enviado', 'vencido')),
  constraint ficha_envios_nombre_largo check (creado_por is null or length(trim(creado_por)) between 1 and 80),
  constraint ficha_envios_version_unica unique (donante_id, organo_key, version)
);
create index if not exists ficha_envios_donante_organo on ficha_envios (donante_id, organo_key, version desc);
alter table ficha_envios disable row level security;
revoke all on ficha_envios from anon, authenticated;
grant select, insert on ficha_envios to anon, authenticated;
grant update (anulado, anulado_en, estado, vence_en) on ficha_envios to anon, authenticated;
notify pgrst, 'reload schema';
