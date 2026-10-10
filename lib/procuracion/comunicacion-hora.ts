// Fecha y hora de la comunicación (etapas 04 Comunicación de muerte y 05
// Comunicación de donación). Se guarda en documentacion_estado.meta del
// mismo registro "realizada" ({ comunicada_en }), sin SQL nuevo. Lógica
// pura, con tests.

export function validarHoraComunicacion(iso: string | null, ahora: number): { ok: true; iso: string } | { ok: false; error: string } {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return { ok: false, error: "Falta la fecha y hora de la comunicación." };
  // margen de 1 minuto para el reloj del celular
  if (new Date(iso).getTime() > ahora + 60_000) return { ok: false, error: "La fecha y hora no puede ser futura." };
  return { ok: true, iso };
}

export function comunicadaEn(meta: unknown): string | null {
  const v = (meta as { comunicada_en?: unknown } | null)?.comunicada_en;
  return typeof v === "string" && !Number.isNaN(new Date(v).getTime()) ? v : null;
}
