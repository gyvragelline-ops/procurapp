"use client";

import type { ReactNode } from "react";
import type { ExpedienteDatos } from "@/lib/procuracion/base-armado";
import {
  analisisComunicacion,
  cierreCertificado,
  familiarDeContacto,
  fotosDocumentacion,
  medidas,
  metodosAuxiliares,
  muestrasPorPaquete,
  neurologico,
  textoAntecedentes,
} from "@/lib/procuracion/base-expediente-etapas";
import { COLOR, diaYHora, horaCorta } from "./ui";
import styles from "./base.module.css";

// Tarjetas del Expediente con lo que cargó el procurador en cada etapa,
// en crudo. Las que no salen en el CSV/PDF y son sensibles llevan la
// marca "Solo Base · no se exporta".

export function SoloBase() {
  return <span className={styles.soloBase}>Solo Base · no se exporta</span>;
}

const vacio = (x: string | null | undefined) => (x === null || x === undefined || x === "" ? "—" : x);

function Tarjeta({ id, titulo, derecha, children }: { id: string; titulo: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className={`${styles.card} ${styles.ancla}`}>
      <div className={styles.cardCab}>
        <span>{titulo}</span>
        {derecha && <span>{derecha}</span>}
      </div>
      {children}
    </div>
  );
}

function Par({ etiqueta, valor, extra }: { etiqueta: ReactNode; valor: ReactNode; extra?: ReactNode }) {
  return (
    <div className={styles.par}>
      <span>{etiqueta}</span>
      <span>
        <span style={{ fontWeight: 600 }}>{valor}</span>
        {extra && (
          <span className={`${styles.chico} ${styles.mu}`} style={{ display: "block", fontWeight: 400 }}>
            {extra}
          </span>
        )}
      </span>
    </div>
  );
}

// ------------------------------------------------- 01 potencial donante
export function TarjetaPotencial({ numero, datos }: { numero: string; datos: ExpedienteDatos }) {
  const t = textoAntecedentes(datos.donante.antecedentes);
  return (
    <Tarjeta id="sec-potencial" titulo={`${numero} · Potencial donante`}>
      <div className={styles.par} style={{ alignItems: "flex-start" }}>
        <span>Antecedentes</span>
        <span style={{ whiteSpace: "pre-wrap", textAlign: "left", maxWidth: "75%", fontWeight: t === "Sin cargar" ? 400 : 600, color: t === "Sin cargar" ? COLOR.mu : undefined }}>{t}</span>
      </div>
    </Tarjeta>
  );
}

// ------------------------------------------------- 02 examen neurológico
export function TarjetaNeurologico({ numero, datos }: { numero: string; datos: ExpedienteDatos }) {
  const n = neurologico(datos.planillas.neuro);
  const cierre = cierreCertificado(datos.planillas.certificado);
  const [e1, e2] = n.evaluaciones;
  const filas: [string, string | null, string | null][] = [
    ["Hora", e1.hora, e2.hora],
    ["TAM", e1.tam, e2.tam],
    ["Temperatura central", e1.temperaturaCentral, e2.temperaturaCentral],
    ["Diabetes insípida", e1.diabetesInsipida, e2.diabetesInsipida],
    ["Pupilas", e1.pupilas, e2.pupilas],
    ...e1.reflejos.map((r, i): [string, string | null, string | null] => [`${r.etiqueta}${r.tronco ? " (tronco)" : ""}`, r.valor, e2.reflejos[i].valor]),
  ];
  return (
    <Tarjeta id="sec-me" titulo={`${numero} · Certificación: examen neurológico`} derecha={<span className={styles.mu}>como lo cargó el procurador</span>}>
      <Par etiqueta="Fecha del examen" valor={vacio(n.fechaExamen)} />
      <div className={styles.filaTabla} style={{ fontWeight: 600, background: "#F7FAFA" }}>
        <span />
        <span>1ª evaluación</span>
        <span>2ª evaluación</span>
      </div>
      {filas.map(([etiqueta, a, b]) => (
        <div key={etiqueta} className={styles.filaTabla}>
          <span>{etiqueta}</span>
          <span className={styles.num} style={{ fontWeight: a === "presente" ? 700 : 500 }}>
            {vacio(a)}
          </span>
          <span className={styles.num} style={{ fontWeight: b === "presente" ? 700 : 500 }}>
            {vacio(b)}
          </span>
        </div>
      ))}
      <Par
        etiqueta="Test de confirmación"
        valor={n.test.tipo === "apnea" ? "Apnea" : n.test.tipo === "atropina" ? "Atropina" : "—"}
        extra={
          n.test.tipo === "apnea"
            ? `CO2 inicial ${vacio(n.test.apnea.pco2Inicial)} mmHg · CO2 final ${vacio(n.test.apnea.pco2Final)} mmHg · duración ${vacio(n.test.apnea.duracion)} · resultado ${vacio(n.test.apnea.resultado)}`
            : n.test.tipo === "atropina"
              ? `FC inicial ${vacio(n.test.atropina.fcInicial)} lpm · FC final ${vacio(n.test.atropina.fcFinal)} lpm · ${vacio(n.test.atropina.fecha)} ${vacio(n.test.atropina.hora)} · duración ${vacio(n.test.atropina.duracion)}`
              : null
        }
      />
      <Par etiqueta="Causa del coma" valor={vacio(n.causaComa)} />
      <Par etiqueta="ARM obligada desde" valor={vacio(n.armDesde)} />
      <Par etiqueta="Estudios complementarios" valor={vacio(n.estudiosComplementarios)} />
      <Par etiqueta="¿Cumple criterios de ME?" valor={vacio(n.cumpleMe)} extra={n.cumpleMe === "No" ? `Motivo y conducta: ${vacio(n.noCumpleMotivo)}` : null} />
      <Par etiqueta="Médicos" valor={[cierre.medico1, cierre.medico2].filter(Boolean).join(" · ") || "—"} extra={cierre.archivoLugar ? `Se archiva en: ${cierre.archivoLugar}` : null} />
    </Tarjeta>
  );
}

// ------------------------------------------- 03 métodos auxiliares
export function TarjetaMetodosAuxiliares({ numero, datos }: { numero: string; datos: ExpedienteDatos }) {
  const m = metodosAuxiliares(datos.certAux, datos.planillas.neuro, datos.planillas.doppler);
  return (
    <Tarjeta id="sec-cert" titulo={`${numero} · Certificación: métodos auxiliares`}>
      {m.map((x) => (
        <Par
          key={x.key}
          etiqueta={x.etiqueta}
          valor={<span style={{ color: x.estado === "Completo" ? COLOR.g : x.estado === "Pendiente" ? COLOR.a : COLOR.tx }}>{vacio(x.estado)}</span>}
          extra={
            <>
              {[x.fecha, x.hora].filter(Boolean).join(" ") || "sin fecha"}
              {x.informe && <span style={{ display: "block", color: COLOR.tx }}>Informe: {x.informe}</span>}
              {x.extra
                .filter((e) => e.valor)
                .map((e) => (
                  <span key={e.etiqueta} style={{ display: "block", color: COLOR.tx }}>
                    {e.etiqueta}: {e.valor}
                  </span>
                ))}
            </>
          }
        />
      ))}
    </Tarjeta>
  );
}

// ------------------------------------ 05 familiar y comunicación
export function TarjetaComunicacion({ numero, datos, ahora }: { numero: string; datos: ExpedienteDatos; ahora: number }) {
  const analisis = analisisComunicacion(datos.analisisComunicacion);
  return (
    <Tarjeta id="sec-comdon" titulo={`${numero} · Comunicación de donación: familiar de contacto`} derecha={<SoloBase />}>
      {familiarDeContacto(datos.familiar).map((x) => (
        <Par key={x.etiqueta} etiqueta={x.etiqueta} valor={vacio(x.valor)} />
      ))}
      <div className={styles.cardFila} style={{ fontWeight: 600 }}>
        Análisis de la comunicación <SoloBase />
      </div>
      {analisis.length === 0 && <div className={`${styles.cardFila} ${styles.mu}`}>Sin análisis cargados.</div>}
      {analisis.map((a) => (
        <div key={a.id} className={styles.cardFila} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className={`${styles.chico} ${styles.mu}`}>
            {horaCorta(a.en, ahora)} · etapa detectada: {a.etapa ?? "—"}
          </span>
          <span style={{ whiteSpace: "pre-wrap" }}>{a.texto}</span>
        </div>
      ))}
    </Tarjeta>
  );
}

// ------------------------------------------------------- 06 muestras
export function TarjetaMuestras({ numero, datos }: { numero: string; datos: ExpedienteDatos }) {
  const m = muestrasPorPaquete(datos.muestras);
  return (
    <Tarjeta id="sec-muestras" titulo={`${numero} · Muestras`} derecha={<span className={styles.mu}>{m.filter((x) => x.estado === "Obtenida").length} de {m.length} obtenidas</span>}>
      {m.length === 0 && <div className={`${styles.cardFila} ${styles.mu}`}>Sin paquetes de muestra cargados.</div>}
      {m.map((x) => (
        <Par key={x.key} etiqueta={x.nombre} valor={<span style={{ color: x.estado === "Obtenida" ? COLOR.g : x.estado === "Pendiente" ? COLOR.a : COLOR.tx }}>{x.estado}</span>} />
      ))}
    </Tarjeta>
  );
}

// --------------------------------------------- 07 medidas antropométricas
export function TarjetaMedidas({ numero, datos }: { numero: string; datos: ExpedienteDatos }) {
  return (
    <Tarjeta id="sec-medidas" titulo={`${numero} · Medidas antropométricas`}>
      {medidas(datos.planillas.medidas, datos.donante.talla, datos.donante.peso).map((x) => (
        <Par key={x.etiqueta} etiqueta={x.etiqueta} valor={<span className={styles.num}>{vacio(x.valor)}</span>} />
      ))}
    </Tarjeta>
  );
}

// ------------------------------------------------- 10 documentación
export function TarjetaDocumentacion({ numero, datos, ahora }: { numero: string; datos: ExpedienteDatos; ahora: number }) {
  return (
    <Tarjeta id="sec-doc" titulo={`${numero} · Documentación (fotos)`}>
      {fotosDocumentacion(datos.fotosDocumentacion).map((f) => (
        <Par
          key={f.tipo}
          etiqueta={
            <>
              {f.etiqueta} {f.soloBase && <SoloBase />}
            </>
          }
          valor={
            <span style={{ color: f.ultima ? COLOR.g : COLOR.mu }}>
              {f.ultima ? `Cargada ${diaYHora(f.ultima.created_at, ahora)}${f.cantidad > 1 ? ` (${f.cantidad})` : ""}` : "Sin cargar"}
              {f.ultima?.archivo_url && (
                <>
                  {" · "}
                  <a href={f.ultima.archivo_url} target="_blank" rel="noreferrer" className={styles.enlace}>
                    ver
                  </a>
                </>
              )}
            </span>
          }
          extra={f.ultima?.cargado_por_rol ? `cargada por: ${f.ultima.cargado_por_rol}` : null}
        />
      ))}
    </Tarjeta>
  );
}
