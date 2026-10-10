"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anularMensaje, cargarMensajes, enviarMensaje } from "@/lib/procuracion/chat";
import {
  MAX_MENSAJE,
  ROLES_CHAT,
  contarNoLeidos,
  esMio,
  marcaDeLectura,
  mensajesOrdenados,
  nuevosDeOtros,
  textoAviso,
  textoDeA,
  validarMensaje,
  type MensajeCaso,
  type RolChat,
} from "@/lib/procuracion/chat-calculos";
import { ErrorVisible, fechaHora } from "./mantenimiento-ui";

const supabase = createClient();
const CONSULTA_MS = 10_000; // mientras la pestaña está visible
const AVISO_MS = 3_500;

// Recordado en el dispositivo (rol, nombre y "leído hasta"). Si el
// navegador no deja guardar, el chat funciona igual sin recordar.
const CLAVE_ROL = "procurapp:chat:rol";
const CLAVE_NOMBRE = "procurapp:chat:autor";
const claveLeido = (donanteId: string) => `procurapp:chat:leido:${donanteId}`;
function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
  } catch {
    // sin almacenamiento: no se recuerda
  }
}
const esRol = (x: string | null): x is RolChat => x === "procurador" || x === "base" || x === "equipo";

// Chat con la Base, en la pantalla principal del donante. Cerrado: una
// burbuja chica "Chat" (abajo a la derecha) con el globito de sin leer;
// un toque abre un panel acotado y otro (o la X) lo cierra. Con el chat
// cerrado, un mensaje nuevo de OTRO rol muestra un aviso breve. Es la
// única notificación permitida fuera de las etapas.
export default function ChatDonante({
  donanteId,
  cargar = (id: string) => cargarMensajes(supabase, id),
}: {
  donanteId: string;
  cargar?: (donanteId: string) => Promise<MensajeCaso[]>; // por defecto, la base (se reemplaza solo en pruebas)
}) {
  const [mensajes, setMensajes] = useState<MensajeCaso[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [miRol, setMiRol] = useState<RolChat | null>(() => {
    const r = leer(CLAVE_ROL);
    return esRol(r) ? r : null;
  });
  // null = todavía no se preguntó; "" = eligió seguir sin nombre.
  const [nombre, setNombre] = useState<string | null>(() => leer(CLAVE_NOMBRE));
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreTexto, setNombreTexto] = useState("");
  const [leidoHasta, setLeidoHasta] = useState<string | null>(() => leer(claveLeido(donanteId)));
  const [texto, setTexto] = useState("");
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Lo que necesita la consulta periódica sin reiniciarse a cada cambio.
  const idsConocidos = useRef<Set<string> | null>(null);
  const abiertoRef = useRef(abierto);
  const rolRef = useRef(miRol);
  useEffect(() => {
    abiertoRef.current = abierto;
    rolRef.current = miRol;
  }, [abierto, miRol]);

  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrarAviso = useCallback((t: string) => {
    setAviso(t);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), AVISO_MS);
  }, []);

  // Consulta cada 10 s, solo con la pestaña visible (se pausa oculta y
  // consulta enseguida al volver). Sin Realtime.
  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setInterval> | null = null;
    const traer = async () => {
      try {
        const ms = await cargar(donanteId);
        if (!vivo) return;
        const antes = idsConocidos.current;
        if (antes && !abiertoRef.current) {
          const nuevos = nuevosDeOtros(antes, ms, rolRef.current);
          if (nuevos.length) mostrarAviso(textoAviso(nuevos[nuevos.length - 1]));
        }
        idsConocidos.current = new Set(ms.map((m) => m.id));
        setMensajes(ms);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudieron cargar los mensajes.");
      }
    };
    const arrancar = () => {
      if (t) return;
      traer();
      t = setInterval(traer, CONSULTA_MS);
    };
    const parar = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const alCambiar = () => (document.visibilityState === "visible" ? arrancar() : parar());
    alCambiar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => {
      vivo = false;
      parar();
      document.removeEventListener("visibilitychange", alCambiar);
      if (avisoTimer.current) clearTimeout(avisoTimer.current);
    };
    // `cargar` es fija en la app; reiniciar solo si cambia el donante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donanteId, mostrarAviso]);

  // Con el chat abierto, bajar al último mensaje.
  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ block: "end" });
  }, [abierto, mensajes.length]);

  function marcarLeido(ms: MensajeCaso[]) {
    const marca = marcaDeLectura(ms);
    setLeidoHasta(marca);
    escribir(claveLeido(donanteId), marca);
  }
  function alternar() {
    marcarLeido(mensajes);
    setAviso(null);
    setAbierto((a) => !a);
  }
  function elegirRol(r: RolChat) {
    setMiRol(r);
    escribir(CLAVE_ROL, r);
  }
  function guardarNombre(valor: string) {
    const n = valor.trim().slice(0, 80);
    setNombre(n);
    escribir(CLAVE_NOMBRE, n);
    setEditandoNombre(false);
  }

  async function enviar() {
    setError(null);
    const v = validarMensaje({ rol: miRol, autor: nombre ?? "", texto });
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      const nuevo = await enviarMensaje(supabase, donanteId, v.datos);
      idsConocidos.current?.add(nuevo.id); // el propio no avisa
      const todos = [...mensajes, nuevo];
      setMensajes(todos);
      marcarLeido(todos);
      setTexto("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await anularMensaje(supabase, id);
      setMensajes((ms) => ms.map((m) => (m.id === id ? { ...m, anulado: true } : m)));
      setAnulandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setGuardando(false);
    }
  }

  const noLeidos = abierto ? 0 : contarNoLeidos(mensajes, leidoHasta, miRol);
  const pedirNombre = nombre === null || editandoNombre;
  const abajo = "calc(16px + env(safe-area-inset-bottom, 0px))";

  return (
    <>
      {/* aviso breve: mensaje nuevo de otro rol con el chat cerrado */}
      {aviso && !abierto && (
        <button
          type="button"
          onClick={alternar}
          role="status"
          className="tiny"
          style={{
            position: "fixed",
            right: 16,
            bottom: `calc(76px + env(safe-area-inset-bottom, 0px))`,
            zIndex: 45,
            maxWidth: "min(300px, calc(100vw - 32px))",
            textAlign: "left",
            background: "var(--bg-elev-2)",
            color: "var(--text)",
            border: "1px solid var(--accent)",
            borderRadius: 10,
            padding: "8px 10px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            cursor: "pointer",
          }}
        >
          {aviso}
        </button>
      )}

      {/* burbuja: abre y cierra */}
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar chat" : `Abrir chat${noLeidos ? `, ${noLeidos} sin leer` : ""}`}
        className="btn btn-accent"
        style={{
          position: "fixed",
          right: 16,
          bottom: abajo,
          zIndex: 46,
          minWidth: 56,
          minHeight: 48,
          borderRadius: 999,
          padding: "8px 14px",
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
        {abierto ? "✕" : "Chat"}
        {noLeidos > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: "var(--red)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
            }}
          >
            {noLeidos > 99 ? "99+" : noLeidos}
          </span>
        )}
      </button>

      {/* panel acotado, arriba de la burbuja */}
      {abierto && (
        <div
          role="dialog"
          aria-label="Chat con la Base"
          style={{
            position: "fixed",
            right: 12,
            bottom: `calc(72px + env(safe-area-inset-bottom, 0px))`,
            width: "min(380px, calc(100vw - 24px))",
            height: "min(62vh, 480px)",
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
          {/* encabezado: título, quién soy, cambiar nombre, cerrar */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 14 }}>Chat con la Base</strong>
              <button type="button" className="btn btn-sm" style={{ minWidth: 40, minHeight: 40 }} aria-label="Cerrar chat" onClick={alternar}>
                ✕
              </button>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {ROLES_CHAT.map((r) => (
                <button key={r.valor} type="button" className={`btn btn-sm ${miRol === r.valor ? "btn-accent" : ""}`} style={{ minHeight: 36, padding: "4px 10px" }} onClick={() => elegirRol(r.valor)}>
                  {r.etiqueta}
                </button>
              ))}
              {!pedirNombre && (
                <span className="tiny muted" style={{ marginLeft: "auto" }}>
                  {nombre || "sin nombre"} ·{" "}
                  <button
                    type="button"
                    className="tiny"
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    onClick={() => {
                      setNombreTexto(nombre ?? "");
                      setEditandoNombre(true);
                    }}
                  >
                    cambiar nombre
                  </button>
                </span>
              )}
            </div>
          </div>

          {pedirNombre ? (
            // Primer uso (o "cambiar nombre"): se pide una sola vez y queda en el dispositivo.
            <div style={{ padding: 12 }}>
              <div style={{ marginBottom: 6 }}>¿Cómo te llamás?</div>
              <div className="tiny muted" style={{ marginBottom: 8 }}>
                Se guarda en este dispositivo y acompaña tus mensajes. Los mensajes ya enviados conservan su nombre.
              </div>
              <input
                className="mini-input"
                maxLength={80}
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Nombre"
                value={nombreTexto}
                onChange={(e) => setNombreTexto(e.target.value)}
              />
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm btn-accent" style={{ minHeight: 44 }} onClick={() => guardarNombre(nombreTexto)}>
                  Guardar
                </button>
                {nombre === null && (
                  <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => guardarNombre("")}>
                    Seguir sin nombre
                  </button>
                )}
                {editandoNombre && (
                  <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => setEditandoNombre(false)}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* mensajes */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                {mensajes.length === 0 && <div className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>Sin mensajes todavía.</div>}
                {mensajesOrdenados(mensajes).map((m) => {
                  const mio = esMio(m, miRol);
                  return (
                    <div key={m.id} style={{ alignSelf: mio ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                      <div
                        style={{
                          background: mio ? "var(--accent-dim)" : "var(--bg-elev-2)",
                          border: `1px solid ${mio ? "var(--accent)" : "var(--border-soft)"}`,
                          borderRadius: mio ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                          padding: "5px 9px",
                          opacity: m.anulado ? 0.55 : 1,
                        }}
                      >
                        <div className="tiny muted" style={{ marginBottom: 2 }}>
                          <strong>{textoDeA(m.rol)}</strong>
                          {m.autor ? ` · ${m.autor}` : ""}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", textDecoration: m.anulado ? "line-through" : undefined }}>{m.texto}</div>
                        <div className="tiny muted" style={{ textAlign: "right", marginTop: 2 }}>
                          {fechaHora(m.creado_en)}
                          {m.anulado ? " · anulado" : ""}
                        </div>
                      </div>
                      {mio && !m.anulado && (
                        <div style={{ textAlign: "right" }}>
                          {anulandoId === m.id ? (
                            <span className="tiny">
                              ¿Anular?{" "}
                              <button type="button" className="btn btn-sm" disabled={guardando} onClick={() => anular(m.id)}>
                                Sí
                              </button>{" "}
                              <button type="button" className="btn btn-sm" onClick={() => setAnulandoId(null)}>
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="tiny muted"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
                              onClick={() => setAnulandoId(m.id)}
                            >
                              anular
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={finRef} />
              </div>

              {/* compositor: un solo campo + Enviar */}
              <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border-soft)" }}>
                <ErrorVisible mensaje={error} />
                <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                  <textarea
                    className="mini-input"
                    rows={2}
                    maxLength={MAX_MENSAJE}
                    aria-label="Mensaje"
                    style={{ flex: 1, minWidth: 0, resize: "none", boxSizing: "border-box", margin: 0 }}
                    placeholder={miRol ? "Mensaje" : "Elegí arriba quién sos"}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  <button type="button" className="btn btn-accent" style={{ minWidth: 72, margin: 0 }} disabled={guardando} onClick={enviar}>
                    {guardando ? "…" : "Enviar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
