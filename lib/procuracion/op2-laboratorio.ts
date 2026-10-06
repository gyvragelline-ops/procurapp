// Grilla de Laboratorio del OP2, página 3 (formulario PDF): los 25
// parámetros reales (ver handoff/build_op2_p3.py, LAB_ROWS), cada uno con
// 5 columnas de extracción -- campo_pdf = lab_{param}_{extraccionN}.
//
// Rescatado de lib/procuracion/laboratorio.ts (borrado: era el flujo de
// carga con IA que se descartó en 0396edb). Se conserva porque es la
// única definición de esta grilla: la usa
// handoff/test-documentos/gen-campo-mapeo-lab.ts y va a hacer falta si
// laboratorio_valores tiene que llenar el OP2 p3.
export const LAB_PARAMS_OP2 = [
  "Hematocrito",
  "Leucocitos",
  "Hemoglobina",
  "Neutrofilos",
  "Plaquetas",
  "Urea",
  "Creatinina",
  "Glucemia",
  "Na",
  "K",
  "Cl",
  "Bilirrubina_T",
  "Bilirrubina_D",
  "TGO",
  "TGP",
  "FA",
  "LDH",
  "Gama_GT",
  "Amilasa",
  "CPK",
  "CPK_MB",
  "KPTT",
  "Protombina",
  "Proteinuria",
  "Sedimento",
] as const;

export type LabParamOP2 = (typeof LAB_PARAMS_OP2)[number];

export const EXTRACCION_COLS = ["extraccion1", "extraccion2", "extraccion3", "extraccion4", "extraccion5"] as const;
