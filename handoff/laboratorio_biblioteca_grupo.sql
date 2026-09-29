-- Agrega el perfil sugerido (uno de los 6 perfiles fijos de Laboratorio,
-- o null = "Biblioteca abierta" sin grupo) a las filas de
-- laboratorio_biblioteca. Se completa para los 7 parámetros de
-- gasometría/pulmón (por nombre, ver matchParametroExtendido en
-- lib/procuracion/laboratorio.ts) y, opcionalmente, para lo que la IA
-- sugiera al no reconocer un parámetro (troponinas, hormonas, etc.).
alter table laboratorio_biblioteca
  add column if not exists grupo_sugerido text;
