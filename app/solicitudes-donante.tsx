"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_DETALLE, MAX_TITULO, etiquetaEstado, etiquetaRol, type Prioridad, type Solicitud } from "@/lib/procuracion/base-solicitudes";
import {
  CONSULTA_SOLICITUDES_MS,
  MAX_RESPUESTA_CORTA,
  cambiosEnProceso,
  cambiosResuelto,
  contadorProcurador,
  lineaEnProceso,
  lineaPedido,
  lineaResuelto,
  paraElProcurador,
  pedidosALaBase,
  resueltasDelProcurador,
  validarPedidoALaBase,
} from "@/lib/procuracion/solicitudes-procurador";
import { cambiarSolicitudProcurador, cargarSolicitudes, crearSolicitudProcurador } from "@/lib/procuracion/solicitudes-datos";
import { ErrorVisible, fechaHora, momentoActual } from "./mantenimiento-ui";

const supabase = createClient();

// El mismo nombre que el chat guarda en el dispositivo.
const CLAVE_NOMBRE = "procurapp:chat:autor";
function leerNombre(): string {
  try {
    return window.localStorage.getItem(CLAVE_NOMBRE) ?? "";
  } catch {
    return "";
  }
}

// Abrir un panel flotante cierra el otro (chat / pedidos).
export const EVENTO_PANEL = "procurapp:panel";
export const avisarPanelAbierto = (cual: "chat" | "pedidos") => window.dispatchEvent(new CustomEvent(EVENTO_PANEL, { detail: cual }));

// Solicitudes de la Base al procurador, en la pantalla principal del
// donante (afuera de las etapas, junto al chat). Cerrado: botón "Pedidos"
// con el contador de abiertas (rojo si hay urgentes). Abierto: la lista,
// las acciones (En proceso / Resuelto) y "Pedir a la Base".
export default function SolicitudesDonante({ donanteId }: { donanteId: string }) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [verResueltas, setVerResueltas] = useState(false);

  async function traer() {
    try {
      setSolicitudes(await cargarSolicitudes(supabase, donanteId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes.");
    }
  }

  // Consulta cada 30 s, solo con la pestaña visible. Sin Realtime.
  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setInterval> | null = null;
    const consultar = async () => {
      try {
        const xs = await cargarSolicitudes(supabase, donanteId);
        if (vivo) setSolicitudes(xs);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes.");
      }
    };
    const arrancar = () => {
      if (t) return;
      void consultar();
      t = setInterval(consultar, CONSULTA_SOLICITUDES_MS);
    };
    const parar = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const alCambiar = () => (document.visibilityState === "visible" ? arrancar() : parar());
    // La primera carga va siempre (aunque la pestaña esté oculta).
    if (document.visibilityState !== "visible") void consultar();
    alCambiar();
    document.addEventListener("visibilitychange", alCambiar);
    const otroPanel = (e: Event) => {
      if ((e as CustomEvent).detail !== "pedidos") setAbierto(false);
    };
    window.addEventListener(EVENTO_PANEL, otroPanel);
    return () => {
      vivo = false;
      parar();
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener(EVENTO_PANEL, otroPanel);
    };
  }, [donanteId]);

  function alternar() {
    if (!abierto) avisarPanelAbierto("pedidos");
    setAbierto(!abierto);
  }

  async function guardar(fn: () => Promise<void>) {
    setError(null);
    setGuardando(true);
    try {
      await fn();
      await traer();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      await traer();
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const enProceso = (s: Solicitud) => guardar(() => cambiarSolicitudProcurador(supabase, s, cambiosEnProceso(), lineaEnProceso(s, leerNombre(), momentoActual())));

  async function resolver(s: Solicitud) {
    const ahora = momentoActual();
    const v = cambiosResuelto(respuesta, leerNombre(), new Date(ahora).toISOString());
    if (!v.ok) return setError(v.error);
    if (await guardar(() => cambiarSolicitudProcurador(supabase, s, v.cambios, lineaResuelto(s, respuesta, leerNombre(), ahora)))) {
      setResolviendo(null);
      setRespuesta("");
    }
  }

  async function pedir() {
    const v = validarPedidoALaBase({ titulo, detalle, prioridad, nombre: leerNombre() });
    if (!v.ok) return setError(v.error);
    if (await guardar(() => crearSolicitudProcurador(supabase, donanteId, v.datos, lineaPedido(v.datos, leerNombre(), momentoActual())))) {
      setPidiendo(false);
      setTitulo("");
      setDetalle("");
      setPrioridad("normal");
    }
  }

  const { abiertas, urgentes } = contadorProcurador(solicitudes);
  const lista = paraElProcurador(solicitudes);
  const resueltas = resueltasDelProcurador(solicitudes);
  const mios = pedidosALaBase(solicitudes);
  const nombre = abierto ? leerNombre() : "";
  const resumen = `${abiertas} ${abiertas === 1 ? "abierto" : "abiertos"}${urgentes ? `, ${urgentes} ${urgentes === 1 ? "urgente" : "urgentes"}` : ""}`;
  const colorContador = urgentes ? "var(--red)" : "var(--amber)";

  return (
    <>
      {/* botón: a la izquierda de la burbuja del chat */}
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar pedidos" : `Pedidos: ${resumen}`}
        className="btn"
        style={{
          position: "fixed",
          right: 92,
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          zIndex: 46,
          minHeight: 48,
          borderRadius: 999,
          padding: "8px 14px",
          background: "var(--bg-elev-2)",
          border: `1px solid ${abiertas ? colorContador : "var(--border)"}`,
          color: urgentes ? "var(--red)" : "var(--text)",
          fontWeight: urgentes ? 700 : 500,
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
        {abierto ? "✕" : urgentes ? `Pedidos · ${urgentes} urgente${urgentes > 1 ? "s" : ""}` : "Pedidos"}
        {!abierto && abiertas > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: colorContador,
              color: urgentes ? "#fff" : "#1b1b1b",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
            }}
          >
            {abiertas > 99 ? "99+" : abiertas}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Pedidos de la Base"
          style={{
            position: "fixed",
            right: 12,
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            width: "min(400px, calc(100% - 24px))",
            maxHeight: "min(72vh, 600px)",
            zIndex: 45,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <strong style={{ fontSize: 14 }}>Pedidos de la Base</strong>
              <div className="tiny muted">
                {resumen.replace(", ", " · ")} · como {nombre || "sin nombre"}
              </div>
            </div>
            <button type="button" className="btn btn-sm" style={{ minWidth: 40, minHeight: 40 }} aria-label="Cerrar pedidos" onClick={alternar}>
              ✕
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
            <ErrorVisible mensaje={error} />
            {lista.length === 0 && <div className="tiny muted" style={{ textAlign: "center", padding: "8px 0" }}>No hay pedidos abiertos para vos.</div>}
            {lista.map((s) => {
              const urg = s.prioridad === "urgente";
              return (
                <div key={s.id} style={{ border: `1px solid ${urg ? "var(--red)" : "var(--border-soft)"}`, background: urg ? "var(--red-dim)" : "var(--bg-elev-2)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{s.titulo}</strong>
                    <span className="tiny" style={{ color: urg ? "var(--red)" : "var(--text-dim)", fontWeight: urg ? 700 : 400, whiteSpace: "nowrap" }}>
                      {urg ? "URGENTE" : "Normal"}
                    </span>
                  </div>
                  {s.detalle && <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 2 }}>{s.detalle}</div>}
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    {etiquetaRol(s.origen)}
                    {s.pedido_por ? ` · ${s.pedido_por}` : " · sin nombre"} · {fechaHora(s.created_at)} · <strong style={{ color: s.estado === "en_proceso" ? "var(--amber)" : "var(--text)" }}>{etiquetaEstado(s.estado)}</strong>
                  </div>
                  {s.respuesta && (
                    <div className="tiny" style={{ marginTop: 4 }}>
                      Respuesta: {s.respuesta}
                      {s.respondida_por ? ` (${s.respondida_por})` : ""}
                    </div>
                  )}
                  {resolviendo === s.id ? (
                    <div style={{ marginTop: 6 }}>
                      <input
                        className="mini-input"
                        style={{ width: "100%", boxSizing: "border-box", textAlign: "left" }}
                        maxLength={MAX_RESPUESTA_CORTA}
                        placeholder="Respuesta corta (opcional)"
                        aria-label="Respuesta corta (opcional)"
                        value={respuesta}
                        onChange={(e) => setRespuesta(e.target.value)}
                      />
                      <div className="btn-row" style={{ marginTop: 6 }}>
                        <button type="button" className="btn btn-sm btn-accent" style={{ minHeight: 44 }} disabled={guardando} onClick={() => resolver(s)}>
                          {guardando ? "…" : "Confirmar resuelto"}
                        </button>
                        <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => setResolviendo(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="btn-row" style={{ marginTop: 6 }}>
                      {s.estado !== "en_proceso" && (
                        <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} disabled={guardando} onClick={() => enProceso(s)}>
                          En proceso
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-accent"
                        style={{ minHeight: 44 }}
                        disabled={guardando}
                        onClick={() => {
                          setRespuesta("");
                          setResolviendo(s.id);
                        }}
                      >
                        Resuelto
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {resueltas.length > 0 && (
              <button type="button" className="tiny muted" style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: "4px 0", textDecoration: "underline" }} onClick={() => setVerResueltas((v) => !v)}>
                {verResueltas ? "Ocultar" : "Ver"} resueltos ({resueltas.length})
              </button>
            )}
            {verResueltas &&
              resueltas.map((s) => (
                <div key={s.id} className="tiny" style={{ borderLeft: "3px solid var(--green)", padding: "2px 8px", color: "var(--text-dim)" }}>
                  <strong style={{ color: "var(--text)" }}>{s.titulo}</strong> · resuelto {s.completed_at ? fechaHora(s.completed_at) : ""}
                  {s.respuesta ? ` · ${s.respuesta}` : ""}
                </div>
              ))}

            {/* pedidos del procurador a la Base */}
            <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 8, marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>Mis pedidos a la Base</strong>
                {!pidiendo && (
                  <button type="button" className="btn btn-sm btn-accent" style={{ minHeight: 40 }} onClick={() => setPidiendo(true)}>
                    + Pedir a la Base
                  </button>
                )}
              </div>
              {pidiendo && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    className="mini-input"
                    style={{ width: "100%", boxSizing: "border-box", textAlign: "left" }}
                    maxLength={MAX_TITULO}
                    placeholder="Qué pedís"
                    aria-label="Qué pedís"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                  <textarea
                    className="mini-input"
                    rows={2}
                    style={{ width: "100%", boxSizing: "border-box", textAlign: "left", resize: "none" }}
                    maxLength={MAX_DETALLE}
                    placeholder="Detalle (opcional)"
                    aria-label="Detalle (opcional)"
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                  />
                  <div className="btn-row">
                    {(["normal", "urgente"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`btn btn-sm ${prioridad === p ? "btn-accent" : ""}`}
                        style={{ minHeight: 40, ...(p === "urgente" && prioridad === p ? { background: "var(--red)", borderColor: "var(--red)", color: "#fff" } : {}) }}
                        aria-pressed={prioridad === p}
                        onClick={() => setPrioridad(p)}
                      >
                        {p === "normal" ? "Normal" : "Urgente"}
                      </button>
                    ))}
                  </div>
                  <div className="btn-row">
                    <button type="button" className="btn btn-sm btn-accent" style={{ minHeight: 44 }} disabled={guardando} onClick={pedir}>
                      {guardando ? "…" : "Enviar a la Base"}
                    </button>
                    <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => setPidiendo(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {mios.length === 0 && !pidiendo && <div className="tiny muted" style={{ marginTop: 4 }}>Todavía no pediste nada.</div>}
              {mios.map((s) => (
                <div key={s.id} className="tiny" style={{ marginTop: 6, borderLeft: `3px solid ${s.estado === "completado" ? "var(--green)" : s.prioridad === "urgente" ? "var(--red)" : "var(--amber)"}`, padding: "2px 8px" }}>
                  <strong>{s.titulo}</strong>
                  {s.prioridad === "urgente" ? <span style={{ color: "var(--red)", fontWeight: 700 }}> · urgente</span> : ""} · {fechaHora(s.created_at)} · {etiquetaEstado(s.estado)}
                  {s.respuesta ? <div>Respuesta de la Base: {s.respuesta}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
