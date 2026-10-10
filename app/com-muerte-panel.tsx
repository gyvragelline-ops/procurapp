"use client";

import ComunicacionRealizada from "./comunicacion-realizada";

// 04 Comunicación de muerte: realizada sí/no + fecha y hora de la comunicación.
export default function ComMuertePanel({ donanteId, realizada, onChange }: { donanteId: string; realizada: boolean; onChange: (v: boolean) => void }) {
  return <ComunicacionRealizada donanteId={donanteId} categoria="comMuerte" etiqueta="Comunicación de muerte" realizada={realizada} onChange={onChange} />;
}
