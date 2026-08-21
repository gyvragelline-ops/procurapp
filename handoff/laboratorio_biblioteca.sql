-- Biblioteca abierta de laboratorio/estudios — para valores extraídos por
-- IA de una foto que NO matchean ninguno de los 25 campos estructurados
-- del OP2 (build_op2_p3.py LAB_ROWS), y para estudios ad-hoc pedidos por
-- Base Operativa sin relación con el OP2. Sin estructura fija: cada fila
-- guarda el parámetro tal como lo leyó la IA, su valor, unidad y cuándo
-- se cargó. Es historial de consulta -- no alimenta ningún PDF por ahora.
create table if not exists laboratorio_biblioteca (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  parametro     text not null,
  valor         text,
  unidad        text,
  imagen_url    text,
  solicitud_id  uuid references solicitudes(id),
  created_at    timestamptz default now()
);

create index if not exists idx_laboratorio_biblioteca_donante
  on laboratorio_biblioteca (donante_id, created_at desc);

-- Bucket de Storage para las fotos de laboratorio (mismo criterio permisivo
-- que 'planillas': público, sin RLS fina todavía).
insert into storage.buckets (id, name, public)
values ('laboratorio-fotos', 'laboratorio-fotos', true)
on conflict (id) do nothing;

drop policy if exists "laboratorio_fotos_anon_rw" on storage.objects;
create policy "laboratorio_fotos_anon_rw" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'laboratorio-fotos')
  with check (bucket_id = 'laboratorio-fotos');
