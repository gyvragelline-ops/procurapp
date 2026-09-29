"use client";

import { useSubidasVideo } from "./subidas-video-context";

// Persistente arriba de cualquier pantalla (montado en layout.tsx) --
// portado de PASE (app/[unidadId]/SubidasVideoIndicator.tsx). Las
// entradas "listo" las saca cada panel que las consume (ver
// ImagenesVideosPanel) apenas refresca su lista; acá solo se muestran.
export default function SubidasVideoIndicator() {
  const { subidas, reintentar, descartar } = useSubidasVideo();
  const lista = Object.values(subidas).filter((u) => u.etapa !== "listo");
  if (lista.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: 420,
        marginInline: "auto",
      }}
    >
      {lista.map((u) => (
        <div
          key={u.id}
          style={{
            background: "var(--bg-elev, #181f27)",
            border: "1px solid var(--border-soft)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          }}
        >
          {u.etapa === "comprimiendo" && <span>Comprimiendo video… {Math.round(u.progreso * 100)}%</span>}
          {u.etapa === "subiendo" && <span>Subiendo video… {Math.round(u.progreso * 100)}%</span>}
          {u.etapa === "error" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--red)" }}>No se pudo subir: {u.error}</span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => reintentar(u.id)}
                  style={{ background: "none", border: "1px solid var(--border-soft)", borderRadius: 6, color: "inherit", fontSize: 11, padding: "3px 8px", cursor: "pointer" }}
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => descartar(u.id)}
                  style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, padding: "3px 4px", cursor: "pointer" }}
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
