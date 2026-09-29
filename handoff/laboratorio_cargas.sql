-- Registro de una foto de laboratorio subida = una fila. No reemplaza
-- planilla_valores (OP2) ni laboratorio_biblioteca -- los valores siguen
-- guardándose ahí igual que antes; esta tabla es la que permite armar el
-- carrusel "por foto" y el detalle editable de una carga puntual, algo
-- que hoy no se puede reconstruir desde planilla_valores (no guarda de
-- qué foto vino cada valor).
create table if not exists laboratorio_cargas (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  imagen_url text,
  fecha_hora_estudio timestamptz not null,
  etiqueta text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_laboratorio_cargas_donante
  on laboratorio_cargas (donante_id, fecha_hora_estudio desc);
