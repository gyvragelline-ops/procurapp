update donantes set es_prueba = true where id = '2b575719-995d-4e8c-88ae-4ba9490f8268';
insert into donantes (id, pd_numero, nombre_completo, edad, sexo, peso, talla, institucion, localidad, servicio, cama, fecha_ingreso, estado_general, tipo_procuracion, es_prueba, created_at)
values
  ('e5a00000-0000-4000-8000-000000000001', '900001', 'Prueba Uno', 41, 'masculino', 78, 175, 'Hospital de prueba A', 'Localidad de prueba', 'UTI', '7', now() - interval '20 hours', 'activo', 'multiorganico', true, now() - interval '9 hours'),
  ('e5a00000-0000-4000-8000-000000000002', '900002', 'Prueba Dos', 67, 'femenino', 60, 158, 'Hospital de prueba B', 'Localidad de prueba', 'Guardia', '3', now() - interval '6 hours', 'activo', 'corneas', true, now() - interval '2 hours')
on conflict (id) do nothing;
insert into quirofano_horarios (donante_id, hora)
select 'e5a00000-0000-4000-8000-000000000001', now() + interval '6 hours'
where not exists (select 1 from quirofano_horarios where donante_id = 'e5a00000-0000-4000-8000-000000000001');
insert into timeline_eventos (donante_id, texto)
select d.id, 'Donante de PRUEBA creado con el SQL de ejemplo'
from donantes d
where d.id in ('e5a00000-0000-4000-8000-000000000001', 'e5a00000-0000-4000-8000-000000000002')
and not exists (select 1 from timeline_eventos t where t.donante_id = d.id and t.texto = 'Donante de PRUEBA creado con el SQL de ejemplo');
