"use client";

import { Fragment, useEffect, useState } from "react";
import {
  RESULTADOS_CIERRE,
  esActivo,
  filaTablero,
  textoTimelineCierre,
  textoTimelineReapertura,
  urgencia,
  validarCierre,
  type InsumosTablero,
  type ResultadoCierre,
} from "@/lib/procuracion/base-tablero";
import { mantenimientoPorSistema, textoCambio, textoValor, ETIQUETA_ORIGEN } from "@/lib/procuracion/base-expediente";
import { EQUIPOS_EXPORTACION, exportarCsv, type DatosExportacion, type EquipoExportacion, type OpcionesExportacion } from "@/lib/procuracion/base-exportar";
import { pendientesEtapa } from "@/lib/procuracion/base-tablero";
import type { ExpedienteDatos, FuenteBase } from "@/lib/procuracion/base-armado";
import SolicitudesPanel from "./solicitudes-panel";
import ChatBase from "./chat-base";
import Impresion from "./impresion";
import SeccionesExpediente from "./secciones-expediente";
import { metaDonante } from "./tablero";
import { COLOR, colorEtapa, descargar, dosCifras, horaCorta, hhmm, textoEstadoEtapa, useConsultaPeriodica } from "./ui";
import { AvisoSinConexion, MarcaActualizado, useConexion } from "./conexion";
import { CONSULTA_BASE_MS } from "@/lib/procuracion/base-actualizacion";
import styles from "./base.module.css";


// Ancla de cada etapa del índice: su sección si tiene una; si no, su
// renglón en "Etapas".
// Ancla de cada etapa del índice: su sección (sec-<clave>).
const ANCLA: Record<string, string> = { labImagenes: "sec-laboratorios" };
const ancla = (key: string) => ANCLA[key] ?? `sec-${key}`;

const colorPestana = (i: InsumosTablero, ahora: number) => {
  if (urgencia(i, ahora).nivel === 1) return COLOR.r;
  return filaTablero(i, ahora).etapaActual ? COLOR.a : COLOR.g;
};

export default function Expediente({
  fuente,
  donanteId,
  activos,
  ahora,
  onAhora,
  irA,
  onCambioTablero,
}: {
  fuente: FuenteBase;
  donanteId: string;
  activos: InsumosTablero[];
  ahora: number;
  onAhora: (t: number) => void;
  irA: (id: string | null) => void;
  onCambioTablero: () => Promise<void>;
}) {
  const [datos, setDatos] = useState<ExpedienteDatos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conexion = useConexion();
  const [equipo, setEquipo] = useState<EquipoExportacion>("todo");
  const [conIdentidad, setConIdentidad] = useState(false);
  // Nombre y DNI: se piden solo al tildar "Incluir nombre y DNI (uso interno)".
  const [identidad, setIdentidad] = useState<{ nombre_completo: string | null; dni: string | null } | null>(null);
  const [imprimir, setImprimir] = useState<{ momento: number; modo: "impresión" | "PDF" } | null>(null);
  const [cierre, setCierre] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCierre | null>(null);
  const [detalleCierre, setDetalleCierre] = useState("");
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    try {
      const d = await fuente.cargarExpediente(donanteId);
      setDatos(d);
      setError(null);
      const t = Date.now();
      conexion.ok(t);
      onAhora(t);
    } catch (e) {
      conexion.fallo();
      setError(e instanceof Error ? e.message : "No se pudo cargar el expediente.");
    }
  }
  useConsultaPeriodica(cargar, CONSULTA_BASE_MS, `exp-${donanteId}`);

  // Imprimir / PDF: se arma la vista de impresión y después se abre el diálogo.
  useEffect(() => {
    if (!imprimir) return;
    const t = setTimeout(() => {
      window.print();
      setImprimir(null);
    }, 50);
    return () => clearTimeout(t);
  }, [imprimir]);

  if (error && !datos) return <div className={styles.error}>{error}</div>;
  if (!datos) return <div>Cargando expediente…</div>;

  const d = datos.donante;
  const f = filaTablero(datos.insumos, ahora);
  const sistemas = mantenimientoPorSistema(datos.fuentes, ahora);
  const activo = esActivo(d);
  const conNombre = equipo === "todo" && conIdentidad && identidad !== null;
  const opciones: OpcionesExportacion = { equipo, destino: equipo === "todo" ? "base" : "equipo", incluirNombreYDni: conNombre };
  const exportacion: DatosExportacion = {
    donante: conNombre ? { ...d, ...identidad } : d,
    fuentes: datos.fuentes,
    cultivos: datos.cultivos,
    estudios: datos.estudios,
    horariosQx: datos.insumos.etapas.horariosQx,
    equipos: datos.equipos,
    muestras: datos.muestras,
    corazonCandidato: datos.corazonCandidato,
  };

  async function tildarIdentidad(si: boolean) {
    setConIdentidad(si);
    if (!si) return setIdentidad(null);
    setErrorAccion(null);
    try {
      setIdentidad(await fuente.cargarIdentidad(donanteId));
    } catch (e) {
      setConIdentidad(false);
      setErrorAccion(e instanceof Error ? e.message : "No se pudo cargar nombre y DNI.");
    }
  }

  async function accion(fn: () => Promise<void>) {
    setErrorAccion(null);
    try {
      await fn();
      await cargar();
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  // Toda exportación deja su línea en la línea de tiempo.
  function exportarCsvAhora() {
    const r = exportarCsv(exportacion, opciones, Date.now());
    r.archivos.forEach((a, i) => setTimeout(() => descargar(a.nombre, a.contenido), i * 300));
    setAviso(`Se descargan ${r.archivos.length} archivos CSV (uno por sección). Si el navegador pregunta, permití las descargas múltiples.`);
    void accion(() => fuente.registrarEnLinea(donanteId, r.timeline));
  }
  function imprimirAhora(modo: "impresión" | "PDF") {
    const momento = Date.now();
    setImprimir({ momento, modo });
    setAviso(modo === "PDF" ? "En el diálogo de impresión, elegí «Guardar como PDF»." : null);
    const r = exportarCsv(exportacion, opciones, momento);
    void accion(() => fuente.registrarEnLinea(donanteId, r.timeline));
  }
  async function confirmarCierre() {
    const v = validarCierre(resultado, detalleCierre);
    if (!v.ok) return setErrorAccion(v.error);
    await accion(() => fuente.cambiarEstadoProtocolo(donanteId, "cerrado", textoTimelineCierre(resultado!, v.detalle, hhmm(new Date().toISOString()))));
    setCierre(false);
    await onCambioTablero();
  }

  const cultivosVig = datos.cultivos.filter((c) => !c.anulado);
  const pendientesCult = cultivosVig.filter((c) => c.estado === "pendiente").length;


  // Bloques del centro (se ubican en el orden de las etapas).
  // Tarjetas por sistema: van en "Ver ordenado" de 11 Mantenimiento.
  const bloqueMantenimiento = (
    <>
                <div className={styles.sistemas}>
                  {sistemas.map((s) => {
                    const conDato = s.filas.filter((x) => x.ultimo);
                    const ult = conDato.reduce<string | null>((a, x) => (x.ultimo!.en > (a ?? "") ? x.ultimo!.en : a), null);
                    return (
                      <div key={s.key} className={styles.card}>
                        <div className={styles.cardCab}>
                          <span>{s.titulo}</span>
                          <span className={styles.mu}>{ult ? `último dato ${horaCorta(ult, ahora)}` : "sin datos"}</span>
                        </div>
                        {s.filas.map((x) => (
                          <div key={x.clave} className={styles.filaSistema}>
                            <span className={styles.dosRenglones}>
                              <span>{x.etiqueta}</span>
                              {x.ultimo && <span className={`${styles.chico} ${styles.mu}`}>{ETIQUETA_ORIGEN[x.ultimo.origen]}</span>}
                            </span>
                            <span className={styles.dosRenglones}>
                              <span className={`${styles.num} ${styles.valor}`}>{x.ultimo ? `${textoValor(x.ultimo.valor, x.decimales)}${x.unidad ? ` ${x.unidad}` : ""}` : "Sin cargar"}</span>
                              {x.ultimo && <span className={`${styles.num} ${styles.chico} ${styles.mu}`}>{horaCorta(x.ultimo.en, ahora)}</span>}
                            </span>
                            <span className={`${styles.num} ${styles.mu} ${styles.dosRenglones}`}>
                              <span>
                                {x.cambio12h === null ? "" : `${x.cambio12h > 0 ? "↑" : x.cambio12h < 0 ? "↓" : "="} ${textoCambio(x.cambio12h, x.decimales)}`}
                                {x.cambio12h !== null && <span className={styles.chico}> en 12 h</span>}
                              </span>
                              {x.nota && <span className={styles.chico}>{x.nota}</span>}
                            </span>
                            <span className={`${styles.chico} ${styles.mu}`}>{x.referencia ? `ref. ${x.referencia}` : ""}</span>
                          </div>
                        ))}
                        {s.key === "infeccioso" && (
                          <div className={styles.filaSistema}>
                            <span>Cultivos</span>
                            <span className={`${styles.num} ${styles.valor}`}>{cultivosVig.length} cargados</span>
                            <span className={`${styles.num} ${styles.mu}`}>{pendientesCult} pendientes</span>
                            <span className={`${styles.chico} ${styles.mu}`}>{cultivosVig.filter((c) => c.estado === "positivo").length} positivos</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
  );
  return (
    <>
      <div className={styles.noImprimir} style={{ display: "contents" }}>
        {/* pestañas: Tablero + una por protocolo activo */}
        <div className={styles.pestanas}>
          <button type="button" className={styles.btn} onClick={() => irA(null)}>
            Tablero
          </button>
          {activos.map((i) => {
            const act = i.donante.id === donanteId;
            return (
              <button key={i.donante.id} type="button" className={`${styles.btn} ${styles.pestana} ${act ? styles.pestanaActiva : ""}`} onClick={() => irA(i.donante.id)} aria-current={act ? "page" : undefined}>
                <span className={styles.punto} style={{ background: colorPestana(i, ahora) }} />
                {filaTablero(i, ahora).iniciales}
              </button>
            );
          })}
          {!activo && (
            <button type="button" className={`${styles.btn} ${styles.pestana} ${styles.pestanaActiva}`}>
              {f.iniciales} (cerrado)
            </button>
          )}
          <span style={{ marginLeft: "auto" }}>
            <MarcaActualizado estado={conexion.estado} />
          </span>
        </div>

        {/* encabezado del donante + exportación */}
        <div className={styles.cabExp}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
            <span className={styles.nombre}>
              {f.iniciales}
              {f.esPrueba && <span className={styles.prueba}>PRUEBA</span>}
            </span>
            <span className={styles.mu}>
              {[metaDonante(f), d.grupo_sanguineo ? `Grupo ${d.grupo_sanguineo}` : null, f.hospital, `Procurador: ${f.procurador ?? "sin cargar"}`, f.identificador].filter(Boolean).join(" · ")}
            </span>
            <span className={styles.num}>{f.tiempoEnProtocolo} en protocolo</span>
            {!activo && <span style={{ color: COLOR.r, fontWeight: 600 }}>Protocolo cerrado</span>}
          </div>
          <div className={styles.renglon}>
            <span className={`${styles.chico} ${styles.mu}`}>Exportar para:</span>
            {EQUIPOS_EXPORTACION.map((e) => (
              <button key={e.valor} type="button" className={`${styles.chip} ${equipo === e.valor ? styles.chipActivo : ""}`} aria-pressed={equipo === e.valor} onClick={() => setEquipo(e.valor)}>
                {e.etiqueta}
              </button>
            ))}
            <label className={styles.chico} title="Solo para uso interno de la Base. Nunca sale para un equipo." style={{ opacity: equipo === "todo" ? 1 : 0.5 }}>
              <input type="checkbox" disabled={equipo !== "todo"} checked={equipo === "todo" && conIdentidad} onChange={(e) => void tildarIdentidad(e.target.checked)} /> Incluir nombre y DNI (uso interno)
            </label>
            <button type="button" className={styles.btn} onClick={() => imprimirAhora("impresión")}>
              Imprimir
            </button>
            <button type="button" className={styles.btn} onClick={() => imprimirAhora("PDF")}>
              PDF
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnAcento}`} onClick={exportarCsvAhora}>
              Excel / CSV (crudo)
            </button>
            {activo ? (
              <button type="button" className={styles.btn} onClick={() => setCierre(true)}>
                Cerrar protocolo
              </button>
            ) : (
              <button type="button" className={styles.btn} onClick={() => accion(() => fuente.cambiarEstadoProtocolo(donanteId, "activo", textoTimelineReapertura(hhmm(new Date().toISOString())))).then(onCambioTablero)}>
                Reabrir protocolo
              </button>
            )}
          </div>
        </div>
        <AvisoSinConexion estado={conexion.estado} />
        {f.esPrueba && <div className={`${styles.aviso} ${styles.avisoDemo}`}>Donante de PRUEBA: el texto copiado o compartido sale con «PRUEBA».</div>}
        {aviso && <div className={`${styles.aviso} ${styles.avisoDemo}`}>{aviso}</div>}
        {errorAccion && (
          <div className={styles.error} role="alert">
            {errorAccion}
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}

        {cierre && (
          <div className={styles.panelCierre}>
            <strong>Cerrar protocolo: ¿cuál fue el resultado?</strong>
            <div className={styles.renglon}>
              {RESULTADOS_CIERRE.map((r) => (
                <button key={r.valor} type="button" className={`${styles.chip} ${resultado === r.valor ? styles.chipActivo : ""}`} onClick={() => setResultado(r.valor)}>
                  {r.etiqueta}
                </button>
              ))}
            </div>
            <input className={styles.campo} maxLength={300} placeholder={resultado === "otro" ? "Motivo (obligatorio)" : "Detalle (opcional)"} value={detalleCierre} onChange={(e) => setDetalleCierre(e.target.value)} />
            <div className={styles.renglon}>
              <button type="button" className={`${styles.btn} ${styles.btnAcento}`} onClick={confirmarCierre}>
                Confirmar cierre
              </button>
              <button type="button" className={styles.btn} onClick={() => setCierre(false)}>
                Cancelar
              </button>
              <span className={`${styles.chico} ${styles.mu}`}>Queda en la línea de tiempo. El protocolo sale del tablero; se puede reabrir.</span>
            </div>
          </div>
        )}

        <div className={`${styles.columnas} ${conexion.estado.tipo === "sin_conexion" ? styles.desactualizado : ""}`}>
          {/* índice: orden Procurapp */}
          <nav className={styles.indice} aria-label="Índice del expediente">
            <span className={`${styles.chico} ${styles.mu}`} style={{ letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>
              Índice · orden Procurapp
            </span>
            {f.barra.map((e) => (
              <button
                key={e.key}
                type="button"
                className={`${styles.indiceItem} ${f.etapaActual?.key === e.key ? styles.indiceActual : ""}`}
                onClick={() => document.getElementById(ancla(e.key))?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <span className={styles.punto} style={{ background: e.estado === "gray" ? COLOR.nd : colorEtapa(e.estado) }} />
                <span className={`${styles.num} ${styles.chico} ${styles.mu}`}>{dosCifras(e.numero)}</span>
                <span>{e.label}</span>
              </button>
            ))}
          </nav>

          {/* centro */}
          <div className={styles.centro}>
            {/* secciones en el orden de las etapas (01–13), con sus acciones */}
            <SeccionesExpediente datos={datos} barra={f.barra} ahora={ahora} fuente={fuente} donanteId={donanteId} recargar={cargar} sistemasOrdenado={bloqueMantenimiento} />

            {/* todas las etapas, con lo que falta (anclas del índice) */}
            <div className={styles.card}>
              <div className={styles.cardCab}>
                <span>Etapas 01–{dosCifras(f.barra.length)}</span>
                <span className={styles.mu}>{f.barra.filter((e) => e.estado === "green").length} completas</span>
              </div>
              {f.barra.map((e) => {
                const marca = datos.insumos.etapas.marcas[e.key];
                const pend = pendientesEtapa(e.key, datos.insumos.etapas);
                return (
                  <div key={e.key} id={`etapa-${e.key}`} className={`${styles.par} ${styles.ancla}`}>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span className={styles.punto} style={{ background: e.estado === "gray" ? COLOR.nd : colorEtapa(e.estado) }} />
                      <span className={`${styles.num} ${styles.mu}`}>{dosCifras(e.numero)}</span>
                      {e.label}
                    </span>
                    <span>
                      <span style={{ fontWeight: 600, color: e.estado === "gray" ? COLOR.mu : colorEtapa(e.estado) }}>{textoEstadoEtapa(e.estado)}</span>
                      {marca && <span className={`${styles.chico} ${styles.mu}`}> · marcado manualmente{marca.en ? ` ${horaCorta(marca.en, ahora)}` : ""}</span>}
                      {/* lo que falta; en 01 también las fotos, que no bloquean la etapa */}
                      {pend.length > 0 && (e.estado !== "green" || e.key === "potencial") && (
                        <span className={styles.chico} style={{ display: "block" }}>
                          {pend.join(" · ")}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <span className={`${styles.chico} ${styles.mu}`} style={{ lineHeight: 1.4 }}>
              Información ordenada para los equipos; la aptitud de cada órgano la decide el equipo correspondiente. Las referencias son solo referencia
              (mantenimiento-metas.ts, a validar con protocolo CUCAIBA/INCUCAI).
            </span>
          </div>

          {/* derecha */}
          <div className={styles.derecha}>
            <SolicitudesPanel fuente={fuente} donanteId={donanteId} solicitudes={datos.insumos.solicitudes} ahora={ahora} onCambio={async () => {
              await cargar();
              await onCambioTablero();
            }} />
            <ChatBase fuente={fuente} donanteId={donanteId} mensajes={datos.mensajes} ahora={ahora} onEnviado={cargar} />
            <div className={styles.card}>
              <div className={styles.cardCab}>
                <span>Línea de tiempo</span>
              </div>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {datos.linea.length === 0 && <div className={`${styles.cardFila} ${styles.mu}`}>Sin eventos.</div>}
                {datos.linea.map((x) => (
                  <div key={x.id} className={styles.cardFila} style={{ display: "grid", gridTemplateColumns: "78px 1fr", gap: 10 }}>
                    <span className={`${styles.num} ${styles.mu}`}>{horaCorta(x.ocurrido_en, ahora)}</span>
                    <span>{x.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* vista de impresión / PDF (mismas secciones que el CSV); también para Ctrl+P */}
      <Impresion datos={exportacion} opciones={opciones} momento={imprimir?.momento ?? ahora} />
    </>
  );
}
