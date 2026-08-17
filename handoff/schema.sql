-- ============================================================
-- SCHEMA: Sistema operativo de procuración — CUCAIBA
-- Basado en: procuracion_preview.html (modelo de estado) +
--            los 235 campos reales de las 6 planillas (build_*.py)
-- Principio rector: "cargar una vez, reutilizar siempre" —
-- ver campo_mapeo para qué campo de qué planilla vive dónde.
-- ============================================================

create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- ------------------------------------------------------------
-- 1) DONANTES — el expediente vivo. Single source of truth para
--    todo dato que se repite en más de una planilla oficial.
-- ------------------------------------------------------------
create table donantes (
  id                uuid primary key default gen_random_uuid(),
  pd_numero         text,                 -- Nº PD (6 dígitos)
  folio_numero      text,                 -- Folio Nº (OP2)
  nombre_completo   text,
  dni               text,
  fecha_nacimiento  date,
  edad              int,
  sexo              text check (sexo in ('masculino','femenino')),
  grupo_sanguineo   text,
  grupo_confirmado  boolean default false,
  peso              numeric,
  talla             numeric,
  cama              text,
  institucion       text,
  localidad         text,
  servicio          text,
  denunciante       text,
  fecha_ingreso     timestamptz,
  me_hora           time,                 -- hora de diagnóstico/fallecimiento
  causa_muerte      text,
  estado_general    text default 'activo' check (estado_general in ('activo','cerrado')),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ------------------------------------------------------------
-- 2) FAMILIARES — datos de contacto para Comunicación Familiar.
--    Separado de donantes porque puede haber más de un contacto.
-- ------------------------------------------------------------
create table familiares (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  nombre        text,
  dni           text,
  edad          int,
  parentesco    text,
  direccion     text,
  telefono      text,
  created_at    timestamptz default now()
);

-- ------------------------------------------------------------
-- 3) ETAPAS_ESTADO — reemplaza el objeto `stage{}` del HTML.
--    Una fila por etapa del recorrido (potencial, me, certificacion,
--    comMuerte, comDonacion, muestras, documentacion, estudios,
--    judicial, mantenimiento, organos, quirofano).
--    'judicial' solo se crea si donantes marcó que aplica (ver
--    tabla documentacion_estado, categoria='judicial', item_key='aplica').
-- ------------------------------------------------------------
create table etapas_estado (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  etapa_key     text not null,
  estado        text not null default 'gray' check (estado in ('green','amber','red','gray')),
  updated_at    timestamptz default now(),
  unique (donante_id, etapa_key)
);

-- ------------------------------------------------------------
-- 4) TIMELINE_EVENTOS — log automático de todo evento relevante.
-- ------------------------------------------------------------
create table timeline_eventos (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  ocurrido_en   timestamptz not null default now(),
  texto         text not null,
  created_by    uuid  -- referencia a auth.users si aplica
);

-- ------------------------------------------------------------
-- 5) MUESTRAS — paquete fijo de 7 (HLA, Laboratorio, Bacteriología,
--    Serología, Pre-ablación, Grupo y factor, Hisopado COVID).
--    Se sembra una fila por paquete al crear el donante.
-- ------------------------------------------------------------
create table muestras (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  paquete_key   text not null,   -- 'hla' | 'lab' | 'bacterio' | 'serologia' | 'preablacion' | 'grupors' | 'covid'
  nombre        text not null,
  tubos         text,
  obtenida      boolean default false,
  retirada      boolean default false,  -- las 7 se retiran juntas; se puede derivar de donantes o duplicar acá
  unique (donante_id, paquete_key)
);

-- ------------------------------------------------------------
-- 6) MANTENIMIENTO_LOG — evolución temporal (hemodinamia, drogas).
--    drogas es jsonb: [{nombre, tipo, ml, concMg, concMl}, ...]
-- ------------------------------------------------------------
create table mantenimiento_log (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  hora          text,
  diuresis      text,
  drogas        jsonb default '[]'::jsonb,
  created_at    timestamptz default now()
);

-- ------------------------------------------------------------
-- 7) ORGANOS — completitud de información por órgano (NO aptitud).
-- ------------------------------------------------------------
create table organos (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  organo_key    text not null,  -- 'corazon' | 'pulmones' | 'higado' | 'rinones' | ...
  pct           int default 0,
  labs          jsonb default '[]'::jsonb,
  imagenes      jsonb default '[]'::jsonb,
  faltante      jsonb default '[]'::jsonb,
  unique (donante_id, organo_key)
);

-- ------------------------------------------------------------
-- 8) SOLICITUDES — circuito Equipo→Base→Procurador→Resultado→Base→Equipo.
--    parent_id encadena la solicitud derivada con la original.
-- ------------------------------------------------------------
create table solicitudes (
  id             uuid primary key default gen_random_uuid(),
  donante_id     uuid not null references donantes(id) on delete cascade,
  titulo         text not null,
  origen         text not null check (origen in ('equipo','base','procurador')),
  destino        text not null check (destino in ('equipo','base','procurador')),
  estado         text not null default 'pendiente' check (estado in ('pendiente','derivada','en_proceso','completado')),
  organo_key     text,
  parent_id      uuid references solicitudes(id),
  created_at     timestamptz default now(),
  completed_at   timestamptz
);

-- ------------------------------------------------------------
-- 9) DOCUMENTACION_ESTADO — estado de cada ítem de Documentación,
--    Estudios, Certificación e Intervención judicial. Reemplaza
--    documentos{}, estudios{}, certEstudios{}, docEstudioConfirmatorio,
--    tacTorax, fotoDni, fotoGrupoFactor, judicial{} del HTML.
-- ------------------------------------------------------------
create table documentacion_estado (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  categoria     text not null check (categoria in ('documentacion','estudios','certificacion','judicial')),
  item_key      text not null,   -- ej. 'comunicacion_familiar' | 'foto_dni' | 'doppler_o_eeg' | 'tac_torax' | 'aplica' | 'foto_precario' | 'autorizacion'
  estado        text,            -- 'green'|'amber'|'red' o valor libre según item ('si'|'no'|'pendiente')
  meta          jsonb default '{}'::jsonb,  -- ej. {tipo:'doppler'} o {co2Inicial:'38', co2Final:'64'}
  updated_at    timestamptz default now(),
  unique (donante_id, categoria, item_key)
);

-- ------------------------------------------------------------
-- 10) PLANILLA_VALORES — EAV para los ~200 campos que son propios
--     de una planilla oficial y no tienen columna canónica en
--     donantes/familiares (ej. resultados de laboratorio, tests de
--     apnea, indicaciones médicas, informes de ECG). Es lo que
--     `fill_and_export()` lee para completar el PDF.
-- ------------------------------------------------------------
create table planilla_valores (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  planilla_key  text not null,   -- 'certificado'|'ablacion'|'doppler'|'neuro'|'coord_familia'|'op2_p1'..'op2_p5'
  campo_pdf     text not null,   -- nombre EXACTO del campo en el build_*.py correspondiente
  valor         text,
  updated_at    timestamptz default now(),
  updated_by    uuid,
  unique (donante_id, planilla_key, campo_pdf)
);

-- ------------------------------------------------------------
-- 11) CAMPO_MAPEO — tabla de referencia ESTÁTICA (no por donante).
--     Para cada campo de cada planilla, dice si el valor sale de
--     una columna canónica (donantes/familiares) o de planilla_valores.
--     Se carga una sola vez con campo_mapeo.sql (generado desde los
--     build_*.py — ver cruzar_modelo.py).
-- ------------------------------------------------------------
create table campo_mapeo (
  id                 uuid primary key default gen_random_uuid(),
  planilla_key       text not null,
  campo_pdf          text not null,
  tipo_campo         text not null check (tipo_campo in ('text','checkbox')),
  fuente_canonica    text,  -- ej. 'donantes.dni' | 'familiares.telefono' | NULL
  unique (planilla_key, campo_pdf)
);

-- ------------------------------------------------------------
-- 12) PLANILLAS_GENERADAS — auditoría de cada PDF exportado.
-- ------------------------------------------------------------
create table planillas_generadas (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  planilla_key  text not null,
  archivo_url   text,
  generado_en   timestamptz default now(),
  generado_por  uuid
);

-- ------------------------------------------------------------
-- Índices básicos
-- ------------------------------------------------------------
create index on timeline_eventos (donante_id, ocurrido_en desc);
create index on solicitudes (donante_id, estado);
create index on planilla_valores (donante_id, planilla_key);
create index on documentacion_estado (donante_id, categoria);

-- ------------------------------------------------------------
-- Seed de las 12 etapas fijas (se insertan por donante al crearlo,
-- vía trigger o en el código de la app — ejemplo de trigger abajo).
-- ------------------------------------------------------------
create or replace function sembrar_etapas_donante()
returns trigger as $$
begin
  insert into etapas_estado (donante_id, etapa_key, estado)
  select new.id, k, 'gray'
  from unnest(array[
    'potencial','me','certificacion','comMuerte','comDonacion',
    'muestras','documentacion','estudios','mantenimiento','organos','quirofano'
    -- 'judicial' NO se siembra acá: se crea solo si se marca que aplica
  ]) as k;

  insert into muestras (donante_id, paquete_key, nombre, tubos)
  values
    (new.id, 'hla', 'HLA', 'a definir'),
    (new.id, 'lab', 'Laboratorio', 'a definir'),
    (new.id, 'bacterio', 'Bacteriología (hemocultivos + urocultivo)', 'a definir'),
    (new.id, 'serologia', 'Serología', 'a definir'),
    (new.id, 'preablacion', 'Laboratorio pre-ablación', 'a definir'),
    (new.id, 'grupors', 'Grupo sanguíneo y factor RH', 'a definir'),
    (new.id, 'covid', 'Hisopado COVID', '1 hisopado');

  return new;
end;
$$ language plpgsql;

create trigger trg_sembrar_etapas
  after insert on donantes
  for each row execute function sembrar_etapas_donante();
