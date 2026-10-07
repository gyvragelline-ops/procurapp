alter table mantenimiento_registros add column if not exists ing_hemoderivados_ml numeric;

alter table mantenimiento_infusiones drop constraint if exists mantenimiento_infusiones_droga_check;
alter table mantenimiento_infusiones add constraint mantenimiento_infusiones_droga_check check (droga in ('noradrenalina','adrenalina','dopamina','dobutamina','isoproterenol','esmolol','amiodarona','vasopresina','desmopresina','furosemida','insulina','potasio','bicarbonato','hidrocortisona','dexametasona'));
alter table mantenimiento_infusiones add column if not exists motivo text;
alter table mantenimiento_infusiones drop constraint if exists mantenimiento_infusiones_motivo_check;
alter table mantenimiento_infusiones add constraint mantenimiento_infusiones_motivo_check check (motivo is null or motivo in ('inicio','cambio_dilucion','cambio_velocidad'));
alter table mantenimiento_infusiones add column if not exists cargado_por text;

create table if not exists mantenimiento_bombas_hora (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references mantenimiento_registros(id) on delete cascade,
  donante_id uuid not null references donantes(id) on delete cascade,
  droga text not null check (droga in ('noradrenalina','adrenalina','dopamina','dobutamina','isoproterenol','esmolol','amiodarona','vasopresina','furosemida','insulina','potasio','bicarbonato','hidrocortisona','dexametasona')),
  velocidad_ml_h numeric not null check (velocidad_ml_h >= 0),
  dilucion_id uuid references mantenimiento_infusiones(id),
  anulado boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists mantenimiento_bombas_hora_unica on mantenimiento_bombas_hora (registro_id, droga) where not anulado;
create index if not exists mantenimiento_bombas_hora_donante on mantenimiento_bombas_hora (donante_id);
alter table mantenimiento_bombas_hora disable row level security;
revoke all on mantenimiento_bombas_hora from anon, authenticated;
grant select, insert on mantenimiento_bombas_hora to anon, authenticated;
grant update (velocidad_ml_h, dilucion_id, anulado) on mantenimiento_bombas_hora to anon, authenticated;

alter table laboratorio_valores add column if not exists origen text;
alter table laboratorio_valores drop constraint if exists laboratorio_valores_origen_check;
alter table laboratorio_valores add constraint laboratorio_valores_origen_check check (origen is null or origen in ('laboratorio','enfermeria'));
