create table if not exists antibioticos (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  antibiotico text not null,
  desde timestamptz not null,
  foco text,
  creado_en timestamptz not null default now(),
  anulado boolean not null default false,
  constraint antibioticos_nombre_largo check (length(trim(antibiotico)) between 1 and 120),
  constraint antibioticos_foco_largo check (foco is null or length(trim(foco)) between 1 and 120)
);
create index if not exists antibioticos_donante on antibioticos (donante_id, desde);
alter table antibioticos disable row level security;
revoke all on antibioticos from anon, authenticated;
grant select, insert on antibioticos to anon, authenticated;
grant update (anulado) on antibioticos to anon, authenticated;
notify pgrst, 'reload schema';
