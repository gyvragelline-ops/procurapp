create table if not exists quirofano_horarios (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  hora timestamptz not null,
  registrado_en timestamptz not null default now(),
  anulado boolean not null default false
);
create index if not exists quirofano_horarios_donante on quirofano_horarios (donante_id, registrado_en desc);
alter table quirofano_horarios disable row level security;
revoke all on quirofano_horarios from anon, authenticated;
grant select, insert on quirofano_horarios to anon, authenticated;
grant update (anulado) on quirofano_horarios to anon, authenticated;

create table if not exists quirofano_equipos (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  equipo text not null check (length(trim(equipo)) between 1 and 80),
  organos text[] not null default '{}',
  organo_otro text check (organo_otro is null or length(trim(organo_otro)) between 1 and 60),
  anestesista text not null default 'sin_confirmar' check (anestesista in ('si','no','sin_confirmar')),
  informado_por text check (informado_por is null or length(trim(informado_por)) between 1 and 80),
  medio text check (medio is null or medio in ('telefono','whatsapp','mail','presencial','otro')),
  creado_en timestamptz not null default now(),
  modificado_en timestamptz,
  anulado boolean not null default false,
  constraint quirofano_equipos_organos_validos check (organos <@ array['corazon','pulmones','higado','rinones','pancreas','intestino','otro']::text[] and cardinality(organos) >= 1),
  constraint quirofano_equipos_otro_con_texto check (('otro' = any(organos)) = (organo_otro is not null))
);
create index if not exists quirofano_equipos_donante on quirofano_equipos (donante_id, creado_en);
alter table quirofano_equipos disable row level security;
revoke all on quirofano_equipos from anon, authenticated;
grant select, insert on quirofano_equipos to anon, authenticated;
grant update (equipo, organos, organo_otro, anestesista, informado_por, medio, modificado_en, anulado) on quirofano_equipos to anon, authenticated;

create table if not exists mensajes_caso (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  rol text not null check (rol in ('procurador','base','equipo')),
  autor text check (autor is null or length(trim(autor)) between 1 and 80),
  texto text not null check (length(trim(texto)) between 1 and 1000),
  creado_en timestamptz not null default now(),
  anulado boolean not null default false
);
create index if not exists mensajes_caso_donante on mensajes_caso (donante_id, creado_en);
alter table mensajes_caso disable row level security;
revoke all on mensajes_caso from anon, authenticated;
grant select, insert on mensajes_caso to anon, authenticated;
grant update (anulado) on mensajes_caso to anon, authenticated;

alter table documentacion_fotos drop constraint if exists documentacion_fotos_tipo_check;
alter table documentacion_fotos drop constraint if exists documentacion_fotos_tipo_valido;
alter table documentacion_fotos add constraint documentacion_fotos_tipo_valido check (tipo in ('dni','grupo_factor','precario','autorizacion_juez'));
alter table documentacion_fotos add column if not exists cargado_por_rol text;
alter table documentacion_fotos drop constraint if exists documentacion_fotos_rol_valido;
alter table documentacion_fotos add constraint documentacion_fotos_rol_valido check (cargado_por_rol is null or cargado_por_rol in ('procurador','base'));
