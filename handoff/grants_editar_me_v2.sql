-- Reemplaza tipo_diagnostico (neurológico/circulatorio, se saca del
-- panel) por: test de confirmación (apnea/atropina, excluyentes) y
-- los 12 reflejos troncoencefálicos, todo bajo la planilla neuro.
delete from planilla_valores where planilla_key = 'neuro' and campo_pdf = 'tipo_diagnostico';
delete from campo_mapeo where planilla_key = 'neuro' and campo_pdf = 'tipo_diagnostico';

insert into campo_mapeo (planilla_key, campo_pdf, tipo_campo, fuente_canonica) values
  ('neuro', 'tipo_test_confirmacion', 'text', NULL),
  ('neuro', 'fc_inicial', 'text', NULL),
  ('neuro', 'fc_final', 'text', NULL),
  ('neuro', 'reflejo_fotomotor', 'text', NULL),
  ('neuro', 'reflejo_corneano', 'text', NULL),
  ('neuro', 'reflejo_oculocefalico', 'text', NULL),
  ('neuro', 'reflejo_oculovestibular', 'text', NULL),
  ('neuro', 'reflejo_nauseoso', 'text', NULL),
  ('neuro', 'reflejo_deglutorio', 'text', NULL),
  ('neuro', 'reflejo_maseterino', 'text', NULL),
  ('neuro', 'reflejo_dolor', 'text', NULL),
  ('neuro', 'reflejo_osteotendinosos', 'text', NULL),
  ('neuro', 'reflejo_plantar', 'text', NULL),
  ('neuro', 'reflejo_cremasteriano', 'text', NULL),
  ('neuro', 'reflejo_cutaneoabdominal', 'text', NULL)
on conflict (planilla_key, campo_pdf) do nothing;
