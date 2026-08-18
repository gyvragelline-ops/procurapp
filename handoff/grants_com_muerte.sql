-- Habilita categoria='comMuerte' en documentacion_estado para el
-- toggle "Marcar como realizada" del panel Comunicación de muerte.
alter table documentacion_estado drop constraint documentacion_estado_categoria_check;
alter table documentacion_estado add constraint documentacion_estado_categoria_check
  check (categoria in ('documentacion', 'estudios', 'certificacion', 'judicial', 'comMuerte'));
