"use client";

import { Fragment, useEffect, useState } from "react";
import {
  RESULTADOS_CIERRE,
  esActivo,
  estadoMantenimiento,
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
import { TIPOS_CULTIVO } from "@/lib/procuracion/cultivos-calculos";
import { ANESTESISTA, ORGANOS_EQUIPO, horaVigente } from "@/lib/procuracion/quirofano-calculos";
import { TIPOS_ESTUDIO_INFO } from "@/lib/procuracion/estudios-imagenes-tipos";
import { pendientesEtapa } from "@/lib/procuracion/base-tablero";
import type { ExpedienteDatos, FuenteBase } from "@/lib/procuracion/base-armado";
import SolicitudesPanel from "./solicitudes-panel";
import ChatBase from "./chat-base";
import Impresion from "./impresion";
import { TarjetaPotencial, TarjetaComunicacion, TarjetaDocumentacion, TarjetaMedidas, TarjetaMetodosAuxiliares, TarjetaMuestras, TarjetaNeurologico } from "./etapas-detalle";
import { metaDonante } from "./tablero";
import { COLOR, colorEtapa, descargar, diaYHora, dosCifras, horaCorta, hhmm, textoActualizado, textoEstadoEtapa, useConsultaPeriodica } from "./ui";
import styles from "./base.module.css";

const CONSULTA_MS = 30_000;

// Ancla de cada etapa del índice: su sección si tiene una; si no, su
// renglón en "Etapas".
const ANCLA: Record<string, string> = {
  potencial: "sec-potencial",
  me: "sec-me",
  certificacion: "sec-cert",
  comDonacion: "sec-comdon",
  muestras: "sec-muestras",
  medidas: "sec-medidas",
  labImagenes: "sec-estudios",
  cultivos: "sec-cultivos",
  documentacion: "sec-doc",
  mantenimiento: "sec-mantenimiento",
  judicial: "sec-quirofano",
  quirofano: "sec-quirofano",
};
const ancla = (key: string) => ANCLA[key] ?? `etapa-${key}`;

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
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const [equipo, setEquipo] = useState<EquipoExportacion>("todo");
  const [conIdentidad, setConIdentidad] = useState(false);
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
      setCargadoEn(t);
      onAhora(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el expediente.");
    }
  }
  useConsultaPeriodica(cargar, CONSULTA_MS, `exp-${donanteId}`);

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
  const mant = estadoMantenimiento(datos.insumos, ahora);
  const sistemas = mantenimientoPorSistema(datos.fuentes, ahora);
  const barraMant = f.barra.find((e) => e.key === "mantenimiento");
  const barraLab = f.barra.find((e) => e.key === "labImagenes");
  const barraCult = f.barra.find((e) => e.key === "cultivos");
  const judicialAplica = datos.insumos.etapas.judicialAplica;
  const activo = esActivo(d);
  const opciones: OpcionesExportacion = { equipo, destino: equipo === "todo" ? "base" : "equipo", incluirNombreYDni: equipo === "todo" && conIdentidad };
  const exportacion: DatosExportacion = {
    donante: d,
    fuentes: datos.fuentes,
    cultivos: datos.cultivos,
    estudios: datos.estudios,
    horariosQx: datos.insumos.etapas.horariosQx,
    equipos: datos.equipos,
    muestras: datos.muestras,
    corazonCandidato: datos.corazonCandidato,
  };

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

  const ultimoMant = mant.tipo === "con_datos" ? `Último dato de Mantenimiento ${horaCorta(mant.ultimo, ahora)}` : mant.tipo === "sin_datos" ? "Sin datos de Mantenimiento" : "";
  const cultivosVig = datos.cultivos.filter((c) => !c.anulado);
  const pendientesCult = cultivosVig.filter((c) => c.estado === "pendiente").length;


  // Bloques del centro (se ubican en el orden de las etapas).
  const bloqueMantenimiento = (
    <>
                <div id="sec-mantenimiento" className={styles.seccionTitulo}>
                  <span>{dosCifras(barraMant?.numero ?? 0)} · Mantenimiento por sistema</span>
                  <span className={`${styles.chico} ${styles.mu}`}>{ultimoMant} · datos en crudo, sin interpretar</span>
                </div>
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
                              <span className={`${styles.num} ${styles.valor}`}>{x.ultimo ? `${textoValor(x.ultimo.valor, x.decimales)}${x.unidad ? ` ${x.unidad}` : ""}` : "—"}</span>
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
  const bloqueCultivos = (
            <div id="sec-cultivos" className={`${styles.card} ${styles.ancla}`}>
              <div className={styles.cardCab}>
                <span>{barraCult ? `${dosCifras(barraCult.numero)} · ` : ""}Cultivos</span>
                <span style={{ color: pendientesCult ? COLOR.a : COLOR.mu }}>{pendientesCult === 1 ? "1 pendiente" : `${pendientesCult} pendientes`}</span>
              </div>
              {cultivosVig.length === 0 && <div className={`${styles.cardFila} ${styles.mu}`}>Sin cultivos cargados.</div>}
              {[...cultivosVig]
                .sort((a, b) => b.tomado_en.localeCompare(a.tomado_en))
                .map((c) => (
                  <div key={c.id} className={styles.filaCultivo}>
                    <span>{c.tipo === "otro" ? c.tipo_otro ?? "Otro" : TIPOS_CULTIVO.find((t) => t.valor === c.tipo)?.etiqueta ?? c.tipo}</span>
                    <span className={`${styles.num} ${styles.mu}`}>{diaYHora(c.tomado_en, ahora)}</span>
                    <span style={{ fontWeight: 600, color: c.estado === "pendiente" ? COLOR.a : c.estado === "positivo" ? COLOR.r : COLOR.g }}>
                      {c.estado === "pendiente" ? "Pendiente" : c.estado === "positivo" ? "Positivo" : "Negativo"}
                    </span>
                    <span>
                      {c.estado === "pendiente"
                        ? `Tomado hace ${Math.max(0, Math.round((ahora - new Date(c.tomado_en).getTime()) / 3_600_000))} h, sin resultado`
                        : [c.germen, c.sensibilidad ? `sensibilidad: ${c.sensibilidad}` : null, c.resultado_en ? `resultado ${diaYHora(c.resultado_en, ahora)}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
            </div>

  );
  const bloqueEstudios = (
              <div id="sec-estudios" className={`${styles.card} ${styles.ancla}`}>
                <div className={styles.cardCab}>
                  <span>{barraLab ? `${dosCifras(barraLab.numero)} · ` : ""}Imágenes y estudios</span>
                </div>
                {TIPOS_ESTUDIO_INFO.map((t) => {
                  const xs = datos.estudios.filter((e) => e.tipo_estudio === t.valor).sort((a, b) => b.created_at.localeCompare(a.created_at));
                  const u = xs[0];
                  return (
                    <div key={t.valor} className={styles.par}>
                      <span>{t.etiqueta}</span>
                      <span style={{ fontWeight: 600, color: u ? COLOR.g : COLOR.mu }}>
                        {u ? `Cargado ${diaYHora(u.created_at, ahora)}${xs.length > 1 ? ` (${xs.length})` : ""}` : "Sin cargar"}
                        {u?.archivo_url && (
                          <>
                            {" · "}
                            <a href={u.archivo_url} target="_blank" rel="noreferrer" className={styles.enlace}>
                              ver
                            </a>
                          </>
                        )}
                        {u?.descripcion && (
                          <span className={styles.chico} style={{ display: "block", fontWeight: 400, color: COLOR.tx }}>
                            {u.descripcion}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

  );
  const bloqueQuirofano = (
              <div id="sec-quirofano" className={`${styles.card} ${styles.ancla}`}>
                <div className={styles.cardCab}>
                  <span>
                    {[f.barra.find((e) => e.key === "judicial"), f.barra.find((e) => e.key === "quirofano")]
                      .filter(Boolean)
                      .map((e) => dosCifras(e!.numero))
                      .join("–")}
                    {" · "}
                    {judicialAplica ? "Judicial, quirófano y equipos" : "Quirófano y equipos"}
                  </span>
                </div>
                {judicialAplica &&
                  (["precario", "autorizacion_juez"] as const).map((tipo) => {
                    const foto = datos.fotosJudiciales.filter((x) => x.tipo === tipo).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
                    return (
                      <div key={tipo} className={styles.par}>
                        <span>{tipo === "precario" ? "Foto del precario" : "Autorización del juez (foto)"}</span>
                        <span style={{ fontWeight: 600, color: foto ? COLOR.g : COLOR.a }}>
                          {foto ? `Cargada ${diaYHora(foto.created_at, ahora)}${foto.cargado_por_rol ? ` · ${foto.cargado_por_rol}` : ""}` : "Sin cargar"}
                        </span>
                      </div>
                    );
                  })}
                <div className={styles.par}>
                  <span>Hora de quirófano</span>
                  {(() => {
                    const h = horaVigente(datos.insumos.etapas.horariosQx);
                    return <span style={{ fontWeight: 600, color: h ? COLOR.tx : COLOR.a }}>{h ? diaYHora(h.hora, ahora) : "Sin definir"}</span>;
                  })()}
                </div>
                {datos.equipos
                  .filter((e) => !e.anulado)
                  .map((e) => (
                    <div key={e.id} className={styles.par}>
                      <span>{e.equipo}</span>
                      <span style={{ fontWeight: 600, color: e.anestesista === "sin_confirmar" ? COLOR.a : COLOR.tx }}>
                        {e.organos.map((o) => (o === "otro" ? e.organo_otro ?? "Otro" : ORGANOS_EQUIPO.find((x) => x.valor === o)?.etiqueta ?? o)).join(", ")} · anestesista:{" "}
                        {ANESTESISTA.find((a) => a.valor === e.anestesista)?.etiqueta.toLowerCase()}
                        <span className={`${styles.chico} ${styles.mu}`} style={{ display: "block", fontWeight: 400 }}>
                          avisado {diaYHora(e.creado_en, ahora)}
                          {e.medio ? ` · ${e.medio}` : ""}
                        </span>
                      </span>
                    </div>
                  ))}
                {datos.equipos.filter((e) => !e.anulado).length === 0 && <div className={`${styles.cardFila} ${styles.mu}`}>Ningún equipo avisado todavía.</div>}
              </div>
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
          <span className={`${styles.chico} ${styles.mu}`} style={{ marginLeft: "auto" }}>
            {textoActualizado(cargadoEn, ahora)}
          </span>
        </div>

        {/* encabezado del donante + exportación */}
        <div className={styles.cabExp}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
            <span className={styles.nombre}>{f.iniciales}</span>
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
              <input type="checkbox" disabled={equipo !== "todo"} checked={equipo === "todo" && conIdentidad} onChange={(e) => setConIdentidad(e.target.checked)} /> Incluir nombre y DNI (uso interno)
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

        <div className={styles.columnas}>
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
            {/* secciones en el orden de las etapas (01–13) */}
            {f.barra.map((e) => {
              const num = dosCifras(e.numero);
              switch (e.key) {
                case "potencial":
                  return <TarjetaPotencial key={e.key} numero={num} datos={datos} />;
                case "me":
                  return <TarjetaNeurologico key={e.key} numero={num} datos={datos} />;
                case "certificacion":
                  return <TarjetaMetodosAuxiliares key={e.key} numero={num} datos={datos} />;
                case "comDonacion":
                  return <TarjetaComunicacion key={e.key} numero={num} datos={datos} ahora={ahora} />;
                case "muestras":
                  return <TarjetaMuestras key={e.key} numero={num} datos={datos} />;
                case "medidas":
                  return <TarjetaMedidas key={e.key} numero={num} datos={datos} />;
                case "labImagenes":
                  return <Fragment key={e.key}>{bloqueEstudios}</Fragment>;
                case "cultivos":
                  return <Fragment key={e.key}>{bloqueCultivos}</Fragment>;
                case "documentacion":
                  return <TarjetaDocumentacion key={e.key} numero={num} datos={datos} ahora={ahora} />;
                case "mantenimiento":
                  return <Fragment key={e.key}>{bloqueMantenimiento}</Fragment>;
                case "judicial":
                  return <Fragment key={e.key}>{bloqueQuirofano}</Fragment>;
                case "quirofano":
                  return judicialAplica ? null : <Fragment key={e.key}>{bloqueQuirofano}</Fragment>;
                default:
                  return null;
              }
            })}

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
                      {pend.length > 0 && e.estado !== "green" && (
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
