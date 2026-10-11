"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_MENSAJE, mensajesOrdenados, validarMensaje, type MensajeCaso, type RolChat } from "@/lib/procuracion/chat-calculos";
import type { FuenteBase } from "@/lib/procuracion/base-armado";
import { COLOR, horaCorta } from "./ui";
import { NombreBase } from "./solicitudes-panel";
import { useNombre } from "./nombre-base";
import styles from "./base.module.css";

const ETIQUETA: Record<RolChat, string> = { procurador: "Procurador", base: "Base", equipo: "Equipo" };

// Chat con el procurador (tabla mensajes_caso), con rol "base". Misma
// conversación que la burbuja "Chat" de la pantalla del donante.
export default function ChatBase({
  fuente,
  donanteId,
  mensajes,
  ahora,
  onEnviado,
}: {
  fuente: FuenteBase;
  donanteId: string;
  mensajes: MensajeCaso[];
  ahora: number;
  onEnviado: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const asegurarNombre = useNombre();

  // Baja solo la caja de mensajes (no la página: el chat queda abajo en el
  // expediente compacto y scrollIntoView movía toda la pantalla).
  useEffect(() => {
    const caja = cajaRef.current;
    if (caja) caja.scrollTop = caja.scrollHeight;
  }, [mensajes.length]);

  async function enviar() {
    setError(null);
    if (!texto.trim()) return setError("Escribí el mensaje.");
    // el mensaje lleva quién lo manda: se pide una vez
    const quien = await asegurarNombre();
    if (!quien) return;
    const v = validarMensaje({ rol: "base", autor: quien, texto });
    if (!v.ok) return setError(v.error);
    setGuardando(true);
    try {
      await fuente.enviarMensaje(donanteId, v.datos);
      setTexto("");
      await onEnviado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={styles.cardC}>
      <div className={styles.cabC}>
        <span className={styles.punto} style={{ width: 8, height: 8, background: COLOR.nd }} />
        <span className={styles.cabCTitulo}>Chat con el procurador</span>
        <span className={styles.cabCEstado} style={{ color: COLOR.mu, fontWeight: 400 }}>
          {mensajes.length ? `${mensajes.length} mensaje${mensajes.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      <div className={styles.chatC}>
        <div ref={cajaRef} className={styles.chatCaja}>
          {mensajes.length === 0 && <span className={`${styles.chico} ${styles.mu}`}>Sin mensajes todavía.</span>}
          {mensajesOrdenados(mensajes).map((m) => {
            const base = m.rol === "base";
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: base ? "flex-start" : "flex-end", gap: 1 }}>
                <span style={{ fontSize: 10.5, color: COLOR.mu }}>
                  {ETIQUETA[m.rol]}
                  {m.autor ? ` · ${m.autor}` : ""} · {horaCorta(m.creado_en, ahora)}
                  {m.anulado ? " · anulado" : ""}
                </span>
                <span className={`${styles.burbuja} ${styles.burbujaC}`} style={{ background: base ? "#E3F2F0" : "#EAF0F1", textDecoration: m.anulado ? "line-through" : undefined, opacity: m.anulado ? 0.6 : 1 }}>
                  {m.texto}
                </span>
              </div>
            );
          })}
        </div>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        <div className={styles.noImprimir} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <textarea
            className={styles.campoC}
            rows={1}
            maxLength={MAX_MENSAJE}
            placeholder="Mensaje"
            aria-label="Mensaje"
            style={{ flex: 1, minWidth: 0, resize: "none" }}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="button" className={`${styles.btnCab} ${styles.btnCabAcento}`} disabled={guardando} onClick={enviar}>
            {guardando ? "…" : "Enviar"}
          </button>
        </div>
        <div className={styles.noImprimir}>
          <NombreBase />
        </div>
      </div>
    </div>
  );
}
