-- Piloto de motor de prellenado de PDFs — paquete de Muestras (8 ítems).
-- 1) Migra donantes existentes: separa 'bacterio' en 'hemocultivo' + 'urocultivo'.
insert into muestras (donante_id, paquete_key, nombre, tubos, obtenida, retirada)
select donante_id, 'hemocultivo', 'Hemocultivo', 'a definir', obtenida, retirada
from muestras where paquete_key = 'bacterio'
on conflict (donante_id, paquete_key) do nothing;

insert into muestras (donante_id, paquete_key, nombre, tubos, obtenida, retirada)
select donante_id, 'urocultivo', 'Urocultivo', 'a definir', obtenida, retirada
from muestras where paquete_key = 'bacterio'
on conflict (donante_id, paquete_key) do nothing;

delete from muestras where paquete_key = 'bacterio';

-- 2) Actualiza el trigger de siembra para que los donantes NUEVOS
--    arranquen con el paquete de 8 (no más 'bacterio' combinado).
create or replace function sembrar_etapas_donante()
returns trigger as $$
begin
  insert into etapas_estado (donante_id, etapa_key, estado)
  select new.id, k, 'gray'
  from unnest(array[
    'potencial','me','certificacion','comMuerte','comDonacion',
    'muestras','documentacion','estudios','mantenimiento','organos','quirofano'
  ]) as k;

  insert into muestras (donante_id, paquete_key, nombre, tubos)
  values
    (new.id, 'hla', 'HLA', 'a definir'),
    (new.id, 'lab', 'Laboratorio', 'a definir'),
    (new.id, 'hemocultivo', 'Hemocultivo', 'a definir'),
    (new.id, 'urocultivo', 'Urocultivo', 'a definir'),
    (new.id, 'serologia', 'Serología', 'a definir'),
    (new.id, 'preablacion', 'Laboratorio pre-ablación', 'a definir'),
    (new.id, 'grupors', 'Grupo sanguíneo y factor RH', 'a definir'),
    (new.id, 'covid', 'Hisopado COVID', '1 hisopado');

  return new;
end;
$$ language plpgsql;

-- 3) Índice para leer rápido "el último PDF generado por planilla".
create index if not exists idx_planillas_generadas_donante_key
  on planillas_generadas (donante_id, planilla_key, generado_en desc);

-- 4) Bucket de Storage para los PDFs prellenados (público, mismo criterio
--    permisivo que el resto del proyecto: sin RLS fina todavía).
insert into storage.buckets (id, name, public)
values ('planillas', 'planillas', true)
on conflict (id) do nothing;

drop policy if exists "planillas_anon_rw" on storage.objects;
create policy "planillas_anon_rw" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'planillas')
  with check (bucket_id = 'planillas');
