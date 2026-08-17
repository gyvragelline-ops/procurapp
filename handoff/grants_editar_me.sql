-- Habilita edición del panel "Diagnóstico ME": tipo_diagnostico y
-- las horas de evaluación se guardan en planilla_valores (neuro).
grant insert, update on planilla_valores to anon, authenticated;

insert into campo_mapeo (planilla_key, campo_pdf, tipo_campo, fuente_canonica) values
  ('neuro', 'tipo_diagnostico', 'text', NULL),
  ('neuro', 'hora_evaluacion_1', 'text', NULL),
  ('neuro', 'hora_evaluacion_2', 'text', NULL)
on conflict (planilla_key, campo_pdf) do nothing;
