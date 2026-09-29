-- Fotos de DNI y de Grupo y factor (pestaña Documentación) -- mismo
-- mecanismo de carga que Laboratorio e imágenes, pero son documentos de
-- identidad/administrativos, no estudios clínicos, así que van en tabla
-- propia en vez de mezclarse con estudios_imagenes. Reusa el bucket
-- 'estudios-imagenes' (ya público, ya con política permisiva) con un
-- prefijo de ruta propio -- no hace falta bucket nuevo.
create table if not exists documentacion_fotos (
  id uuid primary key default gen_random_uuid(),
  donante_id uuid not null references donantes(id) on delete cascade,
  tipo text not null check (tipo in ('dni', 'grupo_factor')),
  archivo_url text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_documentacion_fotos_donante
  on documentacion_fotos (donante_id, tipo, created_at desc);
