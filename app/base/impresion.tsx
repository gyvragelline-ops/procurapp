"use client";

import { seccionesExportacion, type DatosExportacion, type OpcionesExportacion, fechaHoraTexto, numeroCsv } from "@/lib/procuracion/base-exportar";
import styles from "./base.module.css";

// Vista de impresión / PDF del expediente: las MISMAS secciones y filas
// que el CSV (según el equipo elegido), en tablas A4 blanco y negro, con
// salto de página por sección. Solo se ve al imprimir.
export default function Impresion({ datos, opciones, momento }: { datos: DatosExportacion; opciones: OpcionesExportacion; momento: number }) {
  const x = seccionesExportacion(datos, opciones, momento);
  return (
    <div className={styles.soloImprimir}>
      {x.secciones.map((s, i) => (
        <section key={s.key} className={styles.impSeccion}>
          {i === 0 && (
            <div style={{ marginBottom: "6pt" }}>
              <div style={{ fontSize: "14pt", fontWeight: 600 }}>Procurapp · {x.donante}</div>
              <div>
                Equipo: {x.equipo} · Datos hasta {x.datosHasta} · Último dato {x.ultimoDato ? fechaHoraTexto(x.ultimoDato) : "—"}
              </div>
              <div>Datos en crudo, sin interpretar. La aptitud de cada órgano la decide el equipo correspondiente.</div>
            </div>
          )}
          <h2 style={{ fontSize: "12pt", margin: "8pt 0 4pt" }}>
            {s.titulo} <span style={{ fontWeight: 400, fontSize: "9pt" }}>· {x.donante} · datos hasta {x.datosHasta}</span>
          </h2>
          <table className={styles.impTabla}>
            <thead>
              <tr>
                <th>Fecha / hora</th>
                <th>Parámetro</th>
                <th>Valor</th>
                <th>Unidad</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              {s.filas.length === 0 && (
                <tr>
                  <td colSpan={5}>Sin datos.</td>
                </tr>
              )}
              {s.filas.map((f, k) => (
                <tr key={k}>
                  <td>{f.en ? fechaHoraTexto(f.en) : "—"}</td>
                  <td>{f.parametro}</td>
                  <td>{typeof f.valor === "number" ? numeroCsv(f.valor) : f.valor ?? "—"}</td>
                  <td>{f.unidad ?? ""}</td>
                  <td>{f.origen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
