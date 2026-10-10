"use client";

import ComunicacionRealizada from "./comunicacion-realizada";

// 05 Comunicación de donación: realizada sí/no + fecha y hora de la
// comunicación (queda en la línea de tiempo, como antes).
export default function ComDonacionRealizada({ donanteId, realizada, onChange }: { donanteId: string; realizada: boolean; onChange: (v: boolean) => void }) {
  return (
    <ComunicacionRealizada
      donanteId={donanteId}
      categoria="comDonacion"
      etiqueta="Comunicación de donación"
      realizada={realizada}
      onChange={onChange}
      textoLinea={(hora) => `Comunicación de donación — marcada como realizada (comunicada ${hora})`}
    />
  );
}
