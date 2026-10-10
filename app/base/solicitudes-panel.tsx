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
import { ORGANOS_EQUIPO } from "@/lib/procuracion/quirofano-calculos";
import type { FuenteBase } from "@/lib/procuracion/base-armado";
import { COLOR, guardarNombre, horaCorta, leerNombre } from "./ui";
import styles from "./base.module.css";

// Solicitudes del caso: la Base las crea, registra la respuesta y las
// resuelve. Nada se borra: se anula (con confirmación en el lugar).
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
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [anulando, setAnulando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hacer(accion: () => Promise<unknown>) {
    setError(null);
    setGuardando(true);
    try {
      await accion();
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
    const v = validarSolicitud({ titulo, detalle, origen: "base", destino, organoKey: destino === "equipo" && organo ? organo : null, prioridad, pedidoPor: leerNombre() });
    if (!v.ok) return setError(v.error);
    const ok = await hacer(async () => {
      await fuente.crearSolicitud(donanteId, v.datos);
      await fuente.registrarEnLinea(donanteId, `Solicitud${prioridad === "urgente" ? " urgente" : ""}: ${v.datos.titulo}`);
    });
    if (ok) {
      setTitulo("");
      setDetalle("");
      setPrioridad("normal");
      setNueva(false);
    }
  }

  async function responder(s: Solicitud) {
    const v = validarRespuesta(respuesta, leerNombre());
    if (!v.ok) return setError(v.error);
    const ok = await hacer(() => fuente.cambiarSolicitud(s.id, cambiosAlResponder(v.respuesta, v.respondidaPor, new Date().toISOString())));
    if (ok) {
      setRespondiendo(null);
      setRespuesta("");
    }
  }

  const abiertas = solicitudes.filter(esAbierta).length;
  return (
    <div className={styles.card}>
      <div className={styles.cardCab}>
        <span>Solicitudes</span>
        <span style={{ color: abiertas ? COLOR.a : COLOR.mu }}>{abiertas === 1 ? "1 abierta" : `${abiertas} abiertas`}</span>
      </div>
      {error && (
        <div className={styles.cardFila}>
          <div className={styles.error} role="alert">
            {error}
          </div>
        </div>
      )}
      {ordenarSolicitudes(solicitudes).map((s) => {
        const abierta = esAbierta(s);
        const color = s.anulado ? COLOR.mu : !abierta ? COLOR.g : urgenteVencida(s, ahora) ? COLOR.r : COLOR.a;
        return (
          <div key={s.id} className={styles.cardFila} style={{ display: "flex", flexDirection: "column", gap: 3, opacity: s.anulado ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 600, color }}>
                {s.anulado ? "Anulada" : etiquetaEstado(s.estado)}
                {s.prioridad === "urgente" && !s.anulado ? " · urgente" : ""}
              </span>
              <span className={`${styles.num} ${styles.mu}`}>{horaCorta(s.created_at, ahora)}</span>
            </div>
            <span style={{ fontSize: 14, textDecoration: s.anulado ? "line-through" : undefined }}>{s.titulo}</span>
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
            {abierta && (
              <div className={`${styles.renglon} ${styles.noImprimir}`} style={{ marginTop: 4 }}>
                {respondiendo === s.id ? (
                  <>
                    <textarea className={styles.campo} rows={2} maxLength={1000} placeholder="Respuesta" aria-label="Respuesta" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
                    <button type="button" className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`} disabled={guardando} onClick={() => responder(s)}>
                      Guardar respuesta
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setRespondiendo(null)}>
                      Cancelar
                    </button>
                  </>
                ) : anulando === s.id ? (
                  <>
                    <span className={styles.chico}>¿Anular esta solicitud?</span>
                    <button type="button" className={`${styles.btn} ${styles.btnChico}`} disabled={guardando} onClick={async () => (await hacer(() => fuente.cambiarSolicitud(s.id, { anulado: true }))) && setAnulando(null)}>
                      Sí, anular
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setAnulando(null)}>
                      No
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnChico}`}
                      onClick={() => {
                        setRespondiendo(s.id);
                        setRespuesta(s.respuesta ?? "");
                      }}
                    >
                      Registrar respuesta
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnChico}`} disabled={guardando} onClick={() => hacer(() => fuente.cambiarSolicitud(s.id, cambiosAlResolver(new Date().toISOString())))}>
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
        );
      })}
      {solicitudes.length === 0 && <div className={`${styles.cardFila} ${styles.mu}`}>Sin solicitudes.</div>}

      <div className={`${styles.cardFila} ${styles.noImprimir}`}>
        {!nueva ? (
          <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setNueva(true)}>
            + Nueva solicitud
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input className={styles.campo} maxLength={200} placeholder="Qué se pide" aria-label="Qué se pide" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <textarea className={styles.campo} rows={2} maxLength={1000} placeholder="Detalle (opcional)" aria-label="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
            <div className={styles.renglon}>
              <label className={styles.chico}>
                A:{" "}
                <select className={styles.campo} style={{ width: "auto", minHeight: 36 }} value={destino} onChange={(e) => setDestino(e.target.value as RolSolicitud)}>
                  <option value="procurador">Procurador</option>
                  <option value="equipo">Equipo</option>
                </select>
              </label>
              {destino === "equipo" && (
                <select className={styles.campo} style={{ width: "auto", minHeight: 36 }} aria-label="Equipo de" value={organo} onChange={(e) => setOrgano(e.target.value)}>
                  <option value="">(órgano)</option>
                  {ORGANOS_EQUIPO.filter((o) => o.valor !== "otro").map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className={`${styles.chip} ${prioridad === "normal" ? styles.chipActivo : ""}`} onClick={() => setPrioridad("normal")}>
                Normal
              </button>
              <button type="button" className={`${styles.chip} ${prioridad === "urgente" ? styles.chipActivo : ""}`} onClick={() => setPrioridad("urgente")}>
                Urgente
              </button>
            </div>
            <div className={styles.renglon}>
              <button type="button" className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`} disabled={guardando} onClick={crear}>
                Crear solicitud
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnChico}`} onClick={() => setNueva(false)}>
                Cancelar
              </button>
              <NombreBase />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Quién usa la Base en este dispositivo (se guarda una vez; el mismo
// nombre que el chat).
export function NombreBase() {
  const [nombre, setNombre] = useState(() => leerNombre());
  const [editando, setEditando] = useState(false);
  if (!editando)
    return (
      <span className={`${styles.chico} ${styles.mu}`}>
        {nombre ? `como ${nombre}` : "sin nombre"} ·{" "}
        <button type="button" className={styles.enlace} onClick={() => setEditando(true)}>
          {nombre ? "cambiar nombre" : "poner nombre"}
        </button>
      </span>
    );
  return (
    <span className={styles.renglon}>
      <input className={styles.campo} style={{ width: 160, minHeight: 36 }} maxLength={80} placeholder="Tu nombre" aria-label="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <button
        type="button"
        className={`${styles.btn} ${styles.btnChico}`}
        onClick={() => {
          guardarNombre(nombre.trim());
          setEditando(false);
        }}
      >
        Guardar
      </button>
    </span>
  );
}
