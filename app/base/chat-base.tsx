"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_MENSAJE, mensajesOrdenados, validarMensaje, type MensajeCaso, type RolChat } from "@/lib/procuracion/chat-calculos";
import type { FuenteBase } from "@/lib/procuracion/base-armado";
import { COLOR, horaCorta, leerNombre } from "./ui";
import { NombreBase } from "./solicitudes-panel";
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
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes.length]);

  async function enviar() {
    setError(null);
    const v = validarMensaje({ rol: "base", autor: leerNombre(), texto });
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
    <div className={styles.card}>
      <div className={styles.cardCab}>
        <span>Chat con el procurador</span>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          {mensajes.length === 0 && <span className={`${styles.chico} ${styles.mu}`}>Sin mensajes todavía.</span>}
          {mensajesOrdenados(mensajes).map((m) => {
            const base = m.rol === "base";
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: base ? "flex-start" : "flex-end", gap: 2 }}>
                <span style={{ fontSize: 11, color: COLOR.mu }}>
                  {ETIQUETA[m.rol]}
                  {m.autor ? ` · ${m.autor}` : ""} · {horaCorta(m.creado_en, ahora)}
                  {m.anulado ? " · anulado" : ""}
                </span>
                <span className={styles.burbuja} style={{ background: base ? "#E3F2F0" : "#EAF0F1", textDecoration: m.anulado ? "line-through" : undefined, opacity: m.anulado ? 0.6 : 1 }}>
                  {m.texto}
                </span>
              </div>
            );
          })}
          <div ref={finRef} />
        </div>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        <div className={styles.noImprimir} style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "stretch" }}>
          <textarea
            className={styles.campo}
            rows={1}
            maxLength={MAX_MENSAJE}
            placeholder="Mensaje"
            aria-label="Mensaje"
            style={{ flex: 1, minWidth: 0, resize: "none" }}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="button" className={`${styles.btn} ${styles.btnChico} ${styles.btnAcento}`} style={{ minHeight: 40 }} disabled={guardando} onClick={enviar}>
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
