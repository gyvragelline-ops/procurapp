import { Suspense } from "react";
import BaseApp from "./base-app";

// /base — Base operativa (datos reales). /base?d=<id> abre el expediente de
// un donante.
//
// ATENCIÓN: sin login ni RLS todavía. NO usar con donantes reales.
export default function BasePage() {
  return (
    <Suspense fallback={<div>Cargando…</div>}>
      <BaseApp />
    </Suspense>
  );
}
