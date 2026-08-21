import fs from "fs";
import { LAB_PARAMS_OP2, EXTRACCION_COLS } from "../../lib/procuracion/laboratorio";

const rows: string[] = [];
for (const p of LAB_PARAMS_OP2) {
  for (const col of EXTRACCION_COLS) {
    rows.push(`('op2_p3', 'lab_${p}_${col}', 'text', null)`);
  }
}
for (const col of EXTRACCION_COLS) {
  for (const sub of ["dia", "mes", "anio", "hora"]) {
    rows.push(`('op2_p3', 'lab_${col}_fecha_${sub}', 'text', null)`);
  }
}

console.log("total filas:", rows.length);

const sql =
  "-- Filas faltantes de campo_mapeo para la grilla de 25 parametros x 5 extracciones\n" +
  "-- del OP2 p3 (build_op2_p3.py LAB_ROWS) -- necesarias para que el motor de\n" +
  "-- documentos-pdf.ts (Historia Clinica del Potencial Donante -- OP2) vea los\n" +
  "-- valores que ya carga el panel de Laboratorio e imagenes.\n" +
  "insert into campo_mapeo (planilla_key, campo_pdf, tipo_campo, fuente_canonica) values\n" +
  rows.join(",\n") +
  "\non conflict (planilla_key, campo_pdf) do nothing;\n";

fs.writeFileSync(`${__dirname}/../campo_mapeo_lab_op2_p3.sql`, sql);
console.log("escrito en handoff/campo_mapeo_lab_op2_p3.sql");
