-- Imágenes y videos de estudios generales (ECG, ecografía, Rx, fotos de
-- monitor, video, etc.) — pestaña nueva dentro de "Laboratorio e imágenes",
-- separada de laboratorio_biblioteca (que es parametro/valor de laboratorio
-- numérico). Pensada para que a futuro el panel del CUCAIBA la vea ya
-- ordenada por tipo de estudio, no como archivos sueltos.
create table if not exists estudios_imagenes (
  id            uuid primary key default gen_random_uuid(),
  donante_id    uuid not null references donantes(id) on delete cascade,
  tipo_estudio  text not null,
  descripcion   text,
  archivo_url   text not null,
  archivo_tipo  text not null check (archivo_tipo in ('image', 'video')),
  mime_type     text,
  created_at    timestamptz default now()
);

create index if not exists idx_estudios_imagenes_donante
  on estudios_imagenes (donante_id, created_at desc);

-- Bucket propio (no laboratorio-fotos): los videos pesan mucho más que una
-- foto comprimida. Mismo criterio permisivo que laboratorio-fotos: público,
-- sin RLS fina todavía.
insert into storage.buckets (id, name, public, file_size_limit)
values ('estudios-imagenes', 'estudios-imagenes', true, 104857600) -- 100MB
on conflict (id) do nothing;

drop policy if exists "estudios_imagenes_anon_rw" on storage.objects;
create policy "estudios_imagenes_anon_rw" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'estudios-imagenes')
  with check (bucket_id = 'estudios-imagenes');
