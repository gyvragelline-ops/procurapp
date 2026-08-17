-- Habilita edición del panel "Potencial donante": actualizar
-- servicio/pd_numero/fecha_ingreso en donantes, y marcar
-- intervención judicial (aplica/no aplica) en documentacion_estado.
grant update on donantes to anon, authenticated;
grant insert, update on documentacion_estado to anon, authenticated;
