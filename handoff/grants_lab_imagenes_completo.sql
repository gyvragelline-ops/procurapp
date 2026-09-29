-- Habilita categoria='labImagenes' en documentacion_estado para el
-- botón manual "Marcar como completo" de la etapa Laboratorio e
-- imágenes (mismo patrón que comMuerte/comDonacion).
alter table documentacion_estado drop constraint documentacion_estado_categoria_check;
alter table documentacion_estado add constraint documentacion_estado_categoria_check
  check (categoria = any (array['documentacion','estudios','certificacion','judicial','comMuerte','comDonacion','labImagenes']));
