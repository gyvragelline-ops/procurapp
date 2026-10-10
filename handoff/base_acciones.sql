create table if not exists base_revisiones (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  seccion text not null,
  revisado_por text,
  revisado_en timestamptz not null default now(),
  anulado boolean not null default false,
  anulado_en timestamptz,
  constraint base_revisiones_seccion_largo check (length(trim(seccion)) between 1 and 40),
  constraint base_revisiones_nombre_largo check (revisado_por is null or length(trim(revisado_por)) between 1 and 80)
);
create index if not exists base_revisiones_donante on base_revisiones (donante_id, seccion, revisado_en);
alter table base_revisiones disable row level security;
revoke all on base_revisiones from anon, authenticated;
grant select, insert on base_revisiones to anon, authenticated;
grant update (anulado, anulado_en) on base_revisiones to anon, authenticated;

create table if not exists autorizacion_judicial (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  autorizado boolean not null,
  marcado_por text,
  marcado_en timestamptz not null default now(),
  anulado boolean not null default false,
  anulado_en timestamptz,
  constraint autorizacion_judicial_nombre_largo check (marcado_por is null or length(trim(marcado_por)) between 1 and 80)
);
create index if not exists autorizacion_judicial_donante on autorizacion_judicial (donante_id, marcado_en);
alter table autorizacion_judicial disable row level security;
revoke all on autorizacion_judicial from anon, authenticated;
grant select, insert on autorizacion_judicial to anon, authenticated;
grant update (anulado, anulado_en) on autorizacion_judicial to anon, authenticated;

create table if not exists organos_aceptados (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  organo text not null,
  aceptado boolean not null,
  equipo_id uuid references quirofano_equipos(id),
  marcado_por text,
  marcado_en timestamptz not null default now(),
  anulado boolean not null default false,
  anulado_en timestamptz,
  constraint organos_aceptados_organo_valido check (organo in ('corazon', 'pulmones', 'higado', 'rinones', 'pancreas', 'intestino', 'otro')),
  constraint organos_aceptados_nombre_largo check (marcado_por is null or length(trim(marcado_por)) between 1 and 80)
);
create index if not exists organos_aceptados_donante on organos_aceptados (donante_id, organo, marcado_en);
alter table organos_aceptados disable row level security;
revoke all on organos_aceptados from anon, authenticated;
grant select, insert on organos_aceptados to anon, authenticated;
grant update (anulado, anulado_en) on organos_aceptados to anon, authenticated;

notify pgrst, 'reload schema';
