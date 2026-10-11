"use client";

import { useState } from "react";
import {
  cambiosAlResolver,
  cambiosAlResponder,
  esAbierta,
  etiquetaEstado,
  etiquetaRol,
  ordenarSolicitudes,
  urgenteVencida,
  validarRespuesta,
  validarSolicitud,
  type Prioridad,
  type RolSolicitud,
  type Solicitud,
} from "@/lib/procuracion/base-solicitudes";
import { lineaSolicitudBase, validarNombreBase } from "@/lib/procuracion/base-nombre";
import { ORGANOS_EQUIPO } from "@/lib/procuracion/quirofano-calculos";
import type { FuenteBase } from "@/lib/procuracion/base-armado";
import { COLOR, guardarNombre, horaCorta, leerNombre } from "./ui";
import { useNombre } from "./nombre-base";
import styles from "./base.module.css";

// Solicitudes del caso, en el estilo compacto del expediente: una fila por
// solicitud (hora · estado | qué se pide); al tocarla se ven el detalle y
// las acciones. La Base las crea, registra la respuesta y las resuelve.
// Nada se borra: se anula (con confirmación en el lugar). Cada acción
// pide el nombre una vez y deja su línea en la línea de tiempo.
export default function SolicitudesPanel({
  fuente,
  donanteId,
  solicitudes,
  ahora,
  onCambio,
}: {
  fuente: FuenteBase;
  donanteId: string;
  solicitudes: Solicitud[];
  ahora: number;
  onCambio: () => Promise<void>;
}) {
  const [nueva, setNueva] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [destino, setDestino] = useState<RolSolicitud>("procurador");
  const [organo, setOrgano] = useState<string>("");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [anulando, setAnulando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asegurarNombre = useNombre();

  // Primero el nombre; después el cambio y su línea en la línea de tiempo.
  async function hacer(accion: (quien: string) => Promise<unknown>) {
    setError(null);
    const quien = await asegurarNombre();
    if (!quien) return false;
    setGuardando(true);
    try {
      await accion(quien);
      await onCambio();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function crear() {
    const ok = await hacer(async (quien) => {
      const v = validarSolicitud({ titulo, detalle, origen: "base", destino, organoKey: destino === "equipo" && organo ? organo : null, prioridad, pedidoPor: quien });
      if (!v.ok) throw new Error(v.error);
      await fuente.crearSolicitud(donanteId, v.datos);
      await fuente.registrarEnLinea(donanteId, lineaSolicitudBase("pidió", v.datos, quien, Date.now()));
    });
    if (ok) {
      setTitulo("");
      setDetalle("");
      setPrioridad("normal");
      setNueva(false);
    }
  }

  async function responder(s: Solicitud) {
    const ok = await hacer(async (quien) => {
      const v = validarRespuesta(respuesta, quien);
      if (!v.ok) throw new Error(v.error);
      await fuente.cambiarSolicitud(s.id, cambiosAlResponder(v.respuesta, v.respondidaPor, new Date().toISOString()));
      await fuente.registrarEnLinea(donanteId, lineaSolicitudBase("respondió", s, quien, Date.now(), v.respuesta));
    });
    if (ok) {
      setRespondiendo(null);
      setRespuesta("");
    }
  }

  const resolver = (s: Solicitud) =>
    hacer(async (quien) => {
      await fuente.cambiarSolicitud(s.id, cambiosAlResolver(new Date().toISOString()));
      await fuente.registrarEnLinea(donanteId, lineaSolicitudBase("resolvió", s, quien, Date.now()));
    });

  const anular = async (s: Solicitud) =>
    (await hacer(async (quien) => {
      await fuente.cambiarSolicitud(s.id, { anulado: true });
      await fuente.registrarEnLinea(donanteId, lineaSolicitudBase("anuló", s, quien, Date.now()));
    })) && setAnulando(null);

  const abiertas = solicitudes.filter(esAbierta).length;
  return (
    <div className={styles.cardC}>
      <div className={styles.cabC}>
        <span className={styles.punto} style={{ width: 8, height: 8, background: abiertas ? COLOR.a : COLOR.nd }} />
        <span className={styles.cabCTitulo}>Solicitudes</span>
        <span className={styles.cabCEstado} style={{ color: abiertas ? COLOR.a : COLOR.mu }}>
          {abiertas === 1 ? "1 abierta" : `${abiertas} abiertas`}
        </span>
        {!nueva && (
          <button type="button" className={`${styles.btnCab} ${styles.noImprimir}`} onClick={() => setNueva(true)}>
            + Nueva
          </button>
        )}
      </div>
      {error && (
        <div className={styles.avisosCab}>
          <div className={styles.error} role="alert">
            {error}
          </div>
        </div>
      )}

      {nueva && (
        <div className={`${styles.formC} ${styles.noImprimir}`}>
          <input className={styles.campoC} maxLength={200} placeholder="Qué se pide" aria-label="Qué se pide" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <textarea className={styles.campoC} rows={2} maxLength={1000} placeholder="Detalle (opcional)" aria-label="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          <div className={styles.renglon} style={{ gap: 6 }}>
            <label className={styles.chico}>
              A:{" "}
              <select className={styles.campoC} style={{ width: "auto" }} value={destino} onChange={(e) => setDestino(e.target.value as RolSolicitud)}>
                <option value="procurador">Procurador</option>
                <option value="equipo">Equipo</option>
              </select>
            </label>
            {destino === "equipo" && (
              <select className={styles.campoC} style={{ width: "auto" }} aria-label="Equipo de" value={organo} onChange={(e) => setOrgano(e.target.value)}>
                <option value="">(órgano)</option>
                {ORGANOS_EQUIPO.filter((o) => o.valor !== "otro").map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className={`${styles.chipC} ${prioridad === "normal" ? styles.chipActivo : ""}`} aria-pressed={prioridad === "normal"} onClick={() => setPrioridad("normal")}>
              Normal
            </button>
            <button type="button" className={`${styles.chipC} ${prioridad === "urgente" ? styles.chipActivo : ""}`} aria-pressed={prioridad === "urgente"} onClick={() => setPrioridad("urgente")}>
              Urgente
            </button>
          </div>
          <div className={styles.renglon} style={{ gap: 6 }}>
            <button type="button" className={`${styles.btnCab} ${styles.btnCabAcento}`} disabled={guardando} onClick={crear}>
              Crear solicitud
            </button>
            <button type="button" className={styles.btnCab} onClick={() => setNueva(false)}>
              Cancelar
            </button>
            <NombreBase />
          </div>
        </div>
      )}

      {ordenarSolicitudes(solicitudes).map((s) => {
        const esAb = esAbierta(s);
        const color = s.anulado ? COLOR.mu : !esAb ? COLOR.g : urgenteVencida(s, ahora) ? COLOR.r : COLOR.a;
        const expandida = abierta === s.id;
        return (
          <div key={s.id} style={{ opacity: s.anulado ? 0.6 : 1 }}>
            <button type="button" className={`${styles.filaC} ${styles.filaCBoton}`} onClick={() => setAbierta(expandida ? null : s.id)} aria-expanded={expandida}>
              <span className={styles.num} style={{ color, fontSize: 11 }}>
                {horaCorta(s.created_at, ahora)} · {s.anulado ? "anulada" : etiquetaEstado(s.estado).toLowerCase()}
              </span>
              <span className={styles.filaCValor}>
                <span style={{ textDecoration: s.anulado ? "line-through" : undefined }}>{s.titulo}</span>
                {s.respuesta && <span className={styles.filaCDetalle}>Respuesta: {s.respuesta}</span>}
              </span>
              <span className={styles.filaCHora} style={{ color: s.prioridad === "urgente" && !s.anulado ? COLOR.r : undefined, fontWeight: 600 }}>
                {s.prioridad === "urgente" && !s.anulado ? "urgente" : ""} {expandida ? "▾" : "›"}
              </span>
            </button>
            {expandida && (
              <div className={styles.imagenAbierta}>
                {s.detalle && <span className={styles.chico}>{s.detalle}</span>}
                <span className={`${styles.chico} ${styles.mu}`}>
                  {etiquetaRol(s.origen)} → {etiquetaRol(s.destino)}
                  {s.organo_key ? ` (${ORGANOS_EQUIPO.find((o) => o.valor === s.organo_key)?.etiqueta ?? s.organo_key})` : ""}
                  {s.pedido_por ? ` · pidió ${s.pedido_por}` : ""}
                </span>
                {s.respuesta && (
                  <span className={styles.chico}>
                    Respuesta: {s.respuesta}
                    <span className={styles.mu}>
                      {" "}
                      ({s.respondida_en ? horaCorta(s.respondida_en, ahora) : "—"}
                      {s.respondida_por ? `, ${s.respondida_por}` : ""})
                    </span>
                  </span>
                )}
                {s.completed_at && <span className={`${styles.chico} ${styles.mu}`}>Resuelta {horaCorta(s.completed_at, ahora)}</span>}
                {esAb && (
                  <div className={`${styles.renglon} ${styles.noImprimir}`} style={{ gap: 6 }}>
                    {respondiendo === s.id ? (
                      <>
                        <textarea className={styles.campoC} rows={2} maxLength={1000} placeholder="Respuesta" aria-label="Respuesta" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
                        <button type="button" className={`${styles.btnCab} ${styles.btnCabAcento}`} disabled={guardando} onClick={() => responder(s)}>
                          Guardar respuesta
                        </button>
                        <button type="button" className={styles.btnCab} onClick={() => setRespondiendo(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : anulando === s.id ? (
                      <>
                        <span className={styles.chico}>¿Anular esta solicitud?</span>
                        <button type="button" className={styles.btnCab} disabled={guardando} onClick={() => anular(s)}>
                          Sí, anular
                        </button>
                        <button type="button" className={styles.btnCab} onClick={() => setAnulando(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.btnCab}
                          onClick={() => {
                            setRespondiendo(s.id);
                            setRespuesta(s.respuesta ?? "");
                          }}
                        >
                          Registrar respuesta
                        </button>
                        <button type="button" className={styles.btnCab} disabled={guardando} onClick={() => resolver(s)}>
                          Resolver
                        </button>
                        <button type="button" className={styles.enlace} onClick={() => setAnulando(s.id)}>
                          anular
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {solicitudes.length === 0 && <div className={`${styles.filaC} ${styles.mu}`}>Sin solicitudes.</div>}
    </div>
  );
}

// Quién usa la Base en este dispositivo (se guarda una vez; el mismo
// nombre que el chat).
export function NombreBase() {
  const [nombre, setNombre] = useState("");
  const [editando, setEditando] = useState(false);
  if (!editando) {
    // se lee en cada render: el nombre puede haberse pedido en otra acción
    const actual = leerNombre().trim();
    return (
      <span className={`${styles.chico} ${styles.mu}`}>
        {actual ? `como ${actual}` : "sin nombre: se pide al hacer algo"} ·{" "}
        <button
          type="button"
          className={styles.enlace}
          onClick={() => {
            setNombre(actual);
            setEditando(true);
          }}
        >
          {actual ? "cambiar nombre" : "poner nombre"}
        </button>
      </span>
    );
  }
  return (
    <span className={styles.renglon} style={{ gap: 6 }}>
      <input className={styles.campoC} style={{ width: 160 }} maxLength={80} placeholder="Tu nombre" aria-label="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <button
        type="button"
        className={styles.btnCab}
        onClick={() => {
          // un nombre vacío no borra el guardado
          const v = validarNombreBase(nombre);
          if (v.ok) guardarNombre(v.nombre);
          setEditando(false);
        }}
      >
        Guardar
      </button>
    </span>
  );
}
