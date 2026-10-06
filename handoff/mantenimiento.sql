-- =============================================================
-- Mantenimiento (etapa 09) + laboratorio_valores.
--
-- laboratorio_valores es la fuente única de valores de laboratorio:
-- hoy la carga el formulario mínimo de Mantenimiento; a futuro la puede
-- escribir también el panel Laboratorio e imágenes. Sin lista cerrada de
-- parámetros en la base: la app valida (rangos de plausibilidad en
-- lib/procuracion/mantenimiento-metas.ts).
--
-- Permisos: patrón actual del proyecto (RLS desactivado + rol anon).
-- REQUISITO ANTES DE DONANTES REALES: autenticación + RLS por rol.
--
-- Sin borrado físico: todo se anula (anulado = true). Lo anulado se ve
-- tachado y NO cuenta en alarmas, score, tendencias ni balance.
-- =============================================================

create table laboratorio_valores (
  id          uuid primary key default gen_random_uuid(),
  donante_id  uuid not null references donantes(id) on delete cascade,
  toma_id     uuid not null,        -- agrupa los valores de una misma extracción (PaO2 + FiO2 -> PaFi)
  parametro   text not null check (length(trim(parametro)) > 0),
                                    -- hoy: 'na','k','glucemia','ph','pao2','hb','fio2'
  valor       numeric not null,
  unidad      text,                 -- 'mEq/L','mg/dL','mmHg','g/dL','%'; null para pH
  medido_en   timestamptz not null,
  anulado     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on laboratorio_valores (donante_id, parametro, medido_en desc);

create table mantenimiento_registros (
  id                        uuid primary key default gen_random_uuid(),
  donante_id                uuid not null references donantes(id) on delete cascade,
  registrado_en             timestamptz not null default now(),  -- editable (no futura)
  fc                        numeric,
  pam                       numeric,
  temperatura               numeric,
  sat_o2                    numeric,
  fio2                      numeric,          -- en %
  peep                      numeric,
  volumen_corriente         numeric,
  diuresis_ml               numeric,          -- mL desde el registro anterior
  diuresis_es_ultima_hora   boolean not null default false,  -- 1er registro: "mL de la última hora"
  ingresos_ml               numeric,
  egresos_ml                numeric,          -- egresos SIN la diuresis
  osm_urinaria              numeric,
  osm_serica                numeric,
  densidad_urinaria         numeric,
  pvc                       numeric,
  gc                        numeric,
  ic_medido                 numeric,          -- IC medido directo; si es null se calcula de GC
  sat_venosa                numeric,
  delta_pp                  numeric,          -- %
  delta_vs                  numeric,          -- %
  delta_co2_espirado        numeric,          -- %
  indice_vena_cava          numeric,          -- %
  resultado_pasivo_miembros numeric,          -- % de cambio del VS o GC
  disfuncion_miocardica     boolean not null default false,  -- criterio clínico o ecocardiograma
  anulado                   boolean not null default false,
  created_at                timestamptz not null default now()
);
create index on mantenimiento_registros (donante_id, registrado_en desc);

create table mantenimiento_infusiones (
  id                      uuid primary key default gen_random_uuid(),
  donante_id              uuid not null references donantes(id) on delete cascade,
  registrado_en           timestamptz not null default now(),
  droga                   text not null check (droga in ('noradrenalina','adrenalina','dopamina',
                            'dobutamina','isoproterenol','esmolol','amiodarona','vasopresina','desmopresina')),
  tipo                    text not null default 'infusion' check (tipo in ('infusion','bolo')),
  ampollas                numeric,
  contenido_por_ampolla   numeric,
  unidad_contenido        text check (unidad_contenido in ('mg','mcg','U')),
  volumen_final_ml        numeric,
  concentracion_calculada numeric,
  unidad_concentracion    text,            -- 'mcg/mL' | 'mg/mL' | 'U/mL'
  velocidad_ml_h          numeric,         -- 0 = suspendida
  dosis_calculada         numeric,
  unidad_dosis            text,            -- 'mcg/kg/min' | 'mcg/min' | 'mg/min' | 'U/min' | 'mcg' (bolo)
  peso_usado_kg           numeric,         -- peso con el que se calculó (historial fiel)
  anulado                 boolean not null default false,
  created_at              timestamptz not null default now()
);
create index on mantenimiento_infusiones (donante_id, droga, registrado_en desc);

create table mantenimiento_config (
  donante_id                 uuid primary key references donantes(id) on delete cascade,
  nutricion_previa           text check (nutricion_previa in ('si','no')),
  monitoreo_avanzado_activo  boolean not null default false,
  corazon_candidato          text not null default 'sin_definir'
                               check (corazon_candidato in ('si','no','sin_definir')),
  updated_at                 timestamptz not null default now()
);

alter table laboratorio_valores      disable row level security;
alter table mantenimiento_registros  disable row level security;
alter table mantenimiento_infusiones disable row level security;
alter table mantenimiento_config     disable row level security;

-- Registros: se editan (hora, valores) y se anulan.
grant select, insert, update on mantenimiento_registros to anon, authenticated;
-- Laboratorio e infusiones: solo se agrega; lo único editable es "anulado".
grant select, insert on laboratorio_valores      to anon, authenticated;
grant update (anulado) on laboratorio_valores      to anon, authenticated;
grant select, insert on mantenimiento_infusiones to anon, authenticated;
grant update (anulado) on mantenimiento_infusiones to anon, authenticated;
grant select, insert, update on mantenimiento_config to anon, authenticated;
