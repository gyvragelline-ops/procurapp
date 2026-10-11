alter table public.mantenimiento_respirador drop constraint if exists mantenimiento_respirador_fio2_check;
alter table public.mantenimiento_respirador drop constraint if exists mantenimiento_respirador_fio2_fraccion;
update public.mantenimiento_respirador set fio2 = 0.30 where id = 'b2d5c394-f648-4acc-87de-4c9cc6035f25' and donante_id = '2b575719-995d-4e8c-88ae-4ba9490f8268' and fio2 = 30;
insert into public.timeline_eventos (donante_id, texto) select '2b575719-995d-4e8c-88ae-4ba9490f8268', 'FiO₂ corregida de 30 a 0,30 por cambio de escala' where not exists (select 1 from public.timeline_eventos where donante_id = '2b575719-995d-4e8c-88ae-4ba9490f8268' and texto = 'FiO₂ corregida de 30 a 0,30 por cambio de escala');
alter table public.mantenimiento_respirador add constraint mantenimiento_respirador_fio2_fraccion check (fio2 is null or (fio2 >= 0.21 and fio2 <= 1));
