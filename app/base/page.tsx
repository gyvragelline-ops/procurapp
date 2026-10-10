import { Suspense } from "react";
import BaseApp from "./base-app";

// /base — Base operativa. /base?d=<id> abre el expediente de un donante;
// /base?demo=1 usa datos simulados (solo en desarrollo, no toca la base).
//
// ATENCIÓN: sin login ni RLS todavía. NO usar con donantes reales.
export default function BasePage() {
  return (
    <Suspense fallback={<div>Cargando…</div>}>
      <BaseApp />
    </Suspense>
  );
}
