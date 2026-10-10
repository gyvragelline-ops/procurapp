"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anularMensaje, cargarMensajes, enviarMensaje } from "@/lib/procuracion/chat";
import {
  MAX_MENSAJE,
  ROLES_CHAT,
  contarNoLeidos,
  esMio,
  marcaDeLectura,
  mensajesOrdenados,
  validarMensaje,
  type MensajeCaso,
  type RolChat,
} from "@/lib/procuracion/chat-calculos";
import { ErrorVisible, fechaHora } from "./mantenimiento-ui";

const supabase = createClient();
const ETIQ_ROL = Object.fromEntries(ROLES_CHAT.map((r) => [r.valor, r.etiqueta])) as Record<RolChat, string>;
const REFRESCO_MS = 30_000;

// Recordado en el dispositivo (rol, nombre y "leído hasta"). Si el
// navegador no deja guardar, el chat funciona igual sin recordar.
const CLAVE_ROL = "procurapp:chat:rol";
const CLAVE_AUTOR = "procurapp:chat:autor";
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

// Chat del donante, estilo WhatsApp, en la pantalla principal del
// donante: botón fijo "Chat con la Base" (abajo a la derecha, con el
// globito de sin leer) que abre el chat. Es la ÚNICA notificación
// permitida fuera de las etapas.
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
  const [autor, setAutor] = useState(() => leer(CLAVE_AUTOR) ?? "");
  const [leidoHasta, setLeidoHasta] = useState<string | null>(() => leer(claveLeido(donanteId)));
  const [texto, setTexto] = useState("");
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Carga y refresco periódico (sin tiempo real todavía).
  useEffect(() => {
    let vivo = true;
    const traer = () =>
      cargar(donanteId)
        .then((m) => vivo && setMensajes(m))
        .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar los mensajes."));
    traer();
    const t = setInterval(traer, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
    // `cargar` es fija en la app; recargar solo si cambia el donante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donanteId]);

  // Con el chat abierto, bajar al último mensaje.
  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ block: "end" });
  }, [abierto, mensajes.length]);

  function marcarLeido(ms: MensajeCaso[]) {
    const marca = marcaDeLectura(ms);
    setLeidoHasta(marca);
    escribir(claveLeido(donanteId), marca);
  }
  function abrir() {
    setAbierto(true);
    marcarLeido(mensajes);
  }
  function cerrar() {
    marcarLeido(mensajes); // lo que llegó con el chat abierto ya se vio
    setAbierto(false);
  }
  function elegirRol(r: RolChat) {
    setMiRol(r);
    escribir(CLAVE_ROL, r);
  }

  async function enviar() {
    setError(null);
    const v = validarMensaje({ rol: miRol, autor, texto });
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      const nuevo = await enviarMensaje(supabase, donanteId, v.datos);
      const todos = [...mensajes, nuevo];
      setMensajes(todos);
      marcarLeido(todos);
      setTexto("");
      escribir(CLAVE_AUTOR, autor.trim() || null);
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

  const noLeidos = contarNoLeidos(mensajes, leidoHasta, miRol);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        aria-label={`Chat con la Base${noLeidos ? `, ${noLeidos} sin leer` : ""}`}
        className="btn btn-accent"
        style={{
          position: "fixed",
          right: 16,
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          zIndex: 40,
          minHeight: 48,
          borderRadius: 999,
          padding: "10px 16px",
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
        Chat con la Base
        {noLeidos > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 22,
              height: 22,
              borderRadius: 11,
              background: "var(--red)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 6px",
            }}
          >
            {noLeidos > 99 ? "99+" : noLeidos}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Chat con la Base"
      style={{
        position: "fixed",
        right: 0,
        bottom: 0,
        left: 0,
        marginLeft: "auto",
        width: "100%",
        maxWidth: 480,
        height: "80vh",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-elev)",
        borderTop: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        borderRadius: "14px 14px 0 0",
        boxShadow: "0 -6px 24px rgba(0,0,0,0.45)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* encabezado: título, cerrar y selector de rol */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-soft)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Chat con la Base</strong>
          <button type="button" className="btn btn-sm" style={{ minWidth: 44, minHeight: 44 }} aria-label="Cerrar chat" onClick={cerrar}>
            ✕
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <span className="tiny muted">Escribo como:</span>
          {ROLES_CHAT.map((r) => (
            <button key={r.valor} type="button" className={`btn btn-sm ${miRol === r.valor ? "btn-accent" : ""}`} style={{ minHeight: 40 }} onClick={() => elegirRol(r.valor)}>
              {r.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* mensajes */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {mensajes.length === 0 && <div className="tiny muted" style={{ textAlign: "center", marginTop: 20 }}>Sin mensajes todavía.</div>}
        {mensajesOrdenados(mensajes).map((m) => {
          const mio = esMio(m, miRol);
          return (
            <div key={m.id} style={{ alignSelf: mio ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <div
                style={{
                  background: mio ? "var(--accent-dim)" : "var(--bg-elev-2)",
                  border: `1px solid ${mio ? "var(--accent)" : "var(--border-soft)"}`,
                  borderRadius: mio ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  padding: "6px 10px",
                  opacity: m.anulado ? 0.55 : 1,
                }}
              >
                <div className="tiny muted" style={{ marginBottom: 2 }}>
                  <strong>{ETIQ_ROL[m.rol]}</strong>
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
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }}
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

      {/* escribir */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-soft)" }}>
        <ErrorVisible mensaje={error} />
        <input
          className="mini-input"
          maxLength={80}
          style={{ width: "100%", marginBottom: 6 }}
          placeholder="Tu nombre (opcional)"
          value={autor}
          onChange={(e) => setAutor(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea
            className="mini-input"
            rows={2}
            maxLength={MAX_MENSAJE}
            style={{ flex: 1, minWidth: 0, resize: "none" }}
            placeholder={miRol ? "Mensaje" : "Elegí arriba cómo escribís"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="button" className="btn btn-accent" style={{ minHeight: 44, minWidth: 64 }} disabled={guardando} onClick={enviar}>
            {guardando ? "…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
