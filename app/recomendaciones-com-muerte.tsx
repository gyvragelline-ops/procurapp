"use client";

import { useState } from "react";

export default function RecomendacionesComMuerte() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
      <div className="check-row" style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <span>Recomendaciones {open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="tiny" style={{ textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>
            Antes de hablar
          </div>
          <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: "12.5px", lineHeight: 1.6 }}>
            <li>Buscá un lugar tranquilo, sin gente pasando ni ruido de pasillo.</li>
            <li>Poné el celular en silencio.</li>
            <li>Sentate de frente a la familia, no de costado ni parado en la puerta.</li>
          </ul>

          <div className="tiny" style={{ textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>
            Al dar la noticia
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "12.5px", lineHeight: 1.6 }}>
            <li>
              Nada de rodeos tipo &quot;se nos fue&quot; o &quot;pasó a mejor vida&quot; — decilo directo: &quot;Tengo
              que darles una noticia muy difícil: [nombre] falleció.&quot;
            </li>
            <li>Usá el nombre de la persona, no digas &quot;el cuerpo&quot; ni &quot;el paciente&quot;.</li>
            <li>
              Después de decirlo, quedate en silencio. No sigas hablando, no expliques nada más todavía — dejá que la
              familia reaccione primero.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
