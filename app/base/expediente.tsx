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
import { progresoEtapas } from "@/lib/procuracion/base-compacto";
import type { ExpedienteDatos, FuenteBase } from "@/lib/procuracion/base-armado";
import SolicitudesPanel from "./solicitudes-panel";
import ChatBase from "./chat-base";
import Impresion from "./impresion";
import SeccionesExpediente from "./secciones-expediente";
import DistribucionOrganos from "./distribucion-organos";
import { metaDonante } from "./tablero";
import { COLOR, colorEtapa, descargar, dosCifras, horaCorta, hhmm, textoEstadoEtapa, useConsultaPeriodica } from "./ui";
import { AvisoSinConexion, MarcaActualizado, useConexion } from "./conexion";
import { CONSULTA_BASE_MS } from "@/lib/procuracion/base-actualizacion";
import { useNombre } from "./nombre-base";
import { lineaConAutor } from "@/lib/procuracion/base-nombre";
import styles from "./base.module.css";


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
  const [mas, setMas] = useState(false);
  const asegurarNombre = useNombre(); // "Más": exportar para un equipo, imprimir, PDF, cerrar

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

  // Toda exportación deja su línea en la línea de tiempo, con el nombre de
  // quien la hace (se pide una vez; sin nombre no se exporta).
  async function exportarCsvAhora() {
    const q = await asegurarNombre();
    if (!q) return;
    const r = exportarCsv(exportacion, opciones, Date.now());
    r.archivos.forEach((a, i) => setTimeout(() => descargar(a.nombre, a.contenido), i * 300));
    setAviso(`Se descargan ${r.archivos.length} archivos CSV (uno por sección). Si el navegador pregunta, permití las descargas múltiples.`);
    void accion(() => fuente.registrarEnLinea(donanteId, lineaConAutor(q, r.timeline)));
  }
  async function imprimirAhora(modo: "impresión" | "PDF") {
    const q = await asegurarNombre();
    if (!q) return;
    const momento = Date.now();
    setImprimir({ momento, modo });
    setAviso(modo === "PDF" ? "En el diálogo de impresión, elegí «Guardar como PDF»." : null);
    const r = exportarCsv(exportacion, opciones, momento);
    void accion(() => fuente.registrarEnLinea(donanteId, lineaConAutor(q, r.timeline)));
  }
  async function confirmarCierre() {
    const v = validarCierre(resultado, detalleCierre);
    if (!v.ok) return setErrorAccion(v.error);
    const q = await asegurarNombre();
    if (!q) return;
    await accion(() => fuente.cambiarEstadoProtocolo(donanteId, "cerrado", lineaConAutor(q, textoTimelineCierre(resultado!, v.detalle, hhmm(new Date().toISOString())))));
    setCierre(false);
    await onCambioTablero();
  }
  async function reabrir() {
    const q = await asegurarNombre();
    if (!q) return;
    await accion(() => fuente.cambiarEstadoProtocolo(donanteId, "activo", lineaConAutor(q, textoTimelineReapertura(hhmm(new Date().toISOString())))));
    await onCambioTablero();
  }

  const cultivosVig = datos.cultivos.filter((c) => !c.anulado);
  const pendientesCult = cultivosVig.filter((c) => c.estado === "pendiente").length;


  // Bloques del centro (se ubican en el orden de las etapas).
  // Tarjetas por sistema: van en "Detalle ›" de 11 Mantenimiento.
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
  const progreso = progresoEtapas(f.barra, datos.insumos.etapas.marcas);
  const irATarjeta = (tarjeta: string) => document.getElementById(`sec-${tarjeta}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const lineaDeTiempo = (
    <div className={styles.cardC}>
      <div className={styles.cabC}>
        <span className={styles.punto} style={{ width: 8, height: 8, background: COLOR.nd }} />
        <span className={styles.cabCTitulo}>Línea de tiempo</span>
        <span className={styles.cabCEstado} style={{ color: COLOR.mu, fontWeight: 400 }}>
          {datos.linea.length ? `${datos.linea.length} eventos` : ""}
        </span>
      </div>
      <div className={styles.lineaScroll}>
        {datos.linea.length === 0 && <div className={`${styles.filaC} ${styles.mu}`}>Sin eventos.</div>}
        {datos.linea.map((x) => (
          <div key={x.id} className={styles.filaLinea}>
            <span className={`${styles.num} ${styles.mu}`}>{horaCorta(x.ocurrido_en, ahora)}</span>
            <span>{x.texto}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className={`${styles.noImprimir} ${styles.expCompacto}`}>
        {/* barra superior: Tablero + una pestaña por protocolo activo · Actualizado · Excel */}
        <div className={styles.barraSup}>
          <div className={styles.pestanas}>
            <button type="button" className={styles.btn} onClick={() => irA(null)}>
              ‹ Tablero
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
          </div>
          <div className={styles.renglon}>
            <MarcaActualizado estado={conexion.estado} />
            <button type="button" className={styles.btn} onClick={exportarCsvAhora} title={equipo === "todo" ? "Exportar todo (CSV para Excel)" : `Exportar para el equipo ${EQUIPOS_EXPORTACION.find((e) => e.valor === equipo)?.etiqueta}`}>
              Excel
            </button>
            <button type="button" className={styles.btn} aria-expanded={mas} onClick={() => setMas((x) => !x)}>
              Más {mas ? "▴" : "▾"}
            </button>
          </div>
        </div>

        {/* más opciones: exportar para un equipo, imprimir, PDF, cerrar o reabrir el protocolo */}
        {mas && (
          <div className={styles.panelMas}>
            <span className={`${styles.chico} ${styles.mu}`}>Exportar para:</span>
            {EQUIPOS_EXPORTACION.map((e) => (
              <button key={e.valor} type="button" className={`${styles.chip} ${equipo === e.valor ? styles.chipActivo : ""}`} aria-pressed={equipo === e.valor} onClick={() => setEquipo(e.valor)}>
                {e.etiqueta}
              </button>
            ))}
            <label className={styles.chico} title="Solo para uso interno de la Base. Nunca sale para un equipo." style={{ opacity: equipo === "todo" ? 1 : 0.5 }}>
              <input type="checkbox" disabled={equipo !== "todo"} checked={equipo === "todo" && conIdentidad} onChange={(e) => void tildarIdentidad(e.target.checked)} /> Incluir nombre y DNI (uso interno)
            </label>
            <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => imprimirAhora("impresión")}>
              Imprimir
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => imprimirAhora("PDF")}>
              PDF
            </button>
            <span style={{ marginLeft: "auto" }}>
              {activo ? (
                <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setCierre(true)}>
                  Cerrar protocolo
                </button>
              ) : (
                <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={reabrir}>
                  Reabrir protocolo
                </button>
              )}
            </span>
          </div>
        )}

        {/* el donante */}
        <div className={styles.cabDonante}>
          <span className={styles.nombreC}>{f.identificador}</span>
          {f.esPrueba && <span className={styles.prueba}>PRUEBA</span>}
          <span className={styles.mu}>
            {[f.iniciales, metaDonante(f), d.grupo_sanguineo ? `Grupo ${d.grupo_sanguineo}` : null, f.hospital, `Procurador: ${f.procurador ?? "sin cargar"}`].filter(Boolean).join(" · ")}
          </span>
          {!activo && <span style={{ color: COLOR.r, fontWeight: 600 }}>Protocolo cerrado</span>}
          <span className={styles.num} style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
            {f.tiempoEnProtocolo} en protocolo
          </span>
        </div>

        {/* línea de progreso: una etapa por segmento; tocar lleva a su tarjeta */}
        <nav className={styles.progreso} aria-label="Etapas del protocolo">
          <div className={styles.progresoSegs} style={{ gridTemplateColumns: `repeat(${progreso.length}, minmax(0, 1fr))` }}>
            {progreso.map((s) => {
              const pend = pendientesEtapa(s.key, datos.insumos.etapas);
              return (
                <button
                  key={s.key}
                  type="button"
                  className={styles.progresoSeg}
                  onClick={() => irATarjeta(s.tarjeta)}
                  title={`${dosCifras(s.numero)} ${f.barra.find((e) => e.key === s.key)?.label ?? s.etiqueta} · ${textoEstadoEtapa(s.estado)}${s.manual ? " · marcada completa a mano" : ""}${pend.length && s.estado !== "green" ? ` · falta: ${pend.join(" · ")}` : ""}`}
                >
                  <span className={styles.progresoBarra} style={{ background: colorEtapa(s.estado) }} />
                  <span className={styles.progresoTexto}>
                    <span className={styles.num} style={{ fontWeight: 600, color: s.estado === "gray" ? COLOR.nd : COLOR.tx }}>
                      {dosCifras(s.numero)}
                    </span>
                    <span className={styles.progresoEtiqueta}>{s.etiqueta}</span>
                    {s.manual && <span style={{ color: COLOR.g, fontWeight: 600 }}>✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.progresoPie}>
            <span>
              <span style={{ color: COLOR.g }}>■</span> completo · <span style={{ color: COLOR.a }}>■</span> en curso o falta · <span style={{ color: COLOR.r }}>■</span> bloqueado ·{" "}
              <span style={{ color: COLOR.n }}>■</span> sin iniciar · ✓ marcada completa a mano
            </span>
            <span>Tocar una etapa lleva a su tarjeta</span>
          </div>
        </nav>

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

        <div className={conexion.estado.tipo === "sin_conexion" ? styles.desactualizado : undefined}>
          <SeccionesExpediente
            datos={datos}
            barra={f.barra}
            ahora={ahora}
            fuente={fuente}
            donanteId={donanteId}
            recargar={cargar}
            sistemasOrdenado={bloqueMantenimiento}
            lineaDeTiempo={lineaDeTiempo}
            solicitudes={
              <SolicitudesPanel
                fuente={fuente}
                donanteId={donanteId}
                solicitudes={datos.insumos.solicitudes}
                ahora={ahora}
                onCambio={async () => {
                  await cargar();
                  await onCambioTablero();
                }}
              />
            }
            chat={<ChatBase fuente={fuente} donanteId={donanteId} mensajes={datos.mensajes} ahora={ahora} onEnviado={cargar} />}
          />
        </div>

        {/* banda a todo el ancho: lo que pide cada equipo, cruzado con lo cargado */}
        <div className={conexion.estado.tipo === "sin_conexion" ? styles.desactualizado : undefined}>
          <DistribucionOrganos datos={datos} fuente={fuente} donanteId={donanteId} ahora={ahora} recargar={cargar} />
        </div>

        <span className={`${styles.chico} ${styles.mu}`} style={{ lineHeight: 1.4 }}>
          Información ordenada para los equipos; la aptitud de cada órgano la decide el equipo correspondiente. Las referencias son solo referencia
          (mantenimiento-metas.ts, a validar con protocolo CUCAIBA/INCUCAI). La foto del DNI y los datos de la familia no se comparten.
        </span>
      </div>

      {/* vista de impresión / PDF (mismas secciones que el CSV); también para Ctrl+P */}
      <Impresion datos={exportacion} opciones={opciones} momento={imprimir?.momento ?? ahora} />
    </>
  );
}
