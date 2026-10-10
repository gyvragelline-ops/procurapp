// Antibióticos (etapa "Cultivos y antibióticos"): lógica pura, con tests.
// Qué antibiótico, desde cuándo y a qué foco, en texto libre. No se borra:
// se anula.

export const MAX_ANTIBIOTICO = 120;
export const MAX_FOCO = 120;

export type Antibiotico = {
  id: string;
  antibiotico: string;
  desde: string; // fecha y hora de inicio
  foco: string | null;
  creado_en: string;
  anulado: boolean;
};

export function validarAntibiotico(
  entrada: { antibiotico: string; desdeIso: string | null; foco: string },
  ahora: number
): { ok: true; datos: { antibiotico: string; desde: string; foco: string | null } } | { ok: false; error: string } {
  const antibiotico = entrada.antibiotico.trim();
  if (!antibiotico) return { ok: false, error: "Escribí qué antibiótico." };
  if (antibiotico.length > MAX_ANTIBIOTICO) return { ok: false, error: `El antibiótico es demasiado largo (máximo ${MAX_ANTIBIOTICO} caracteres).` };
  if (!entrada.desdeIso || Number.isNaN(new Date(entrada.desdeIso).getTime())) return { ok: false, error: "Falta desde cuándo (fecha y hora)." };
  if (new Date(entrada.desdeIso).getTime() > ahora) return { ok: false, error: "El inicio no puede ser futuro." };
  const foco = entrada.foco.trim();
  if (foco.length > MAX_FOCO) return { ok: false, error: `El foco es demasiado largo (máximo ${MAX_FOCO} caracteres).` };
  return { ok: true, datos: { antibiotico, desde: entrada.desdeIso, foco: foco || null } };
}

// Vigentes primero (el inicio más reciente arriba); los anulados aparte.
export function antibioticosVigentes(xs: Antibiotico[]): Antibiotico[] {
  return xs.filter((x) => !x.anulado).sort((a, b) => b.desde.localeCompare(a.desde) || a.id.localeCompare(b.id));
}
