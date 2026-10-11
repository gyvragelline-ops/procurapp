import { iniciales } from "./base-tablero.ts";

// Privacidad: la Base muestra iniciales y nunca le pide al navegador el
// nombre completo ni el DNI del donante o del familiar. El servidor
// (/api/base/iniciales) lee los nombres y devuelve solo las iniciales.

export type Iniciales = { donantes: Record<string, string>; familiares: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_IDS = 200;

export function validarIds(x: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(x) || x.some((i) => typeof i !== "string" || !UUID.test(i))) return { ok: false, error: "ids inválidos" };
  if (x.length > MAX_IDS) return { ok: false, error: `máximo ${MAX_IDS} ids` };
  return { ok: true, ids: [...new Set(x as string[])] };
}

export function inicialesPorDonante(donantes: { id: string; nombre_completo: string | null }[], familiares: { donante_id: string; nombre: string | null }[]): Iniciales {
  const fam: Record<string, string> = {};
  for (const f of familiares) if (!(f.donante_id in fam) && f.nombre?.trim()) fam[f.donante_id] = iniciales(f.nombre);
  return { donantes: Object.fromEntries(donantes.map((d) => [d.id, iniciales(d.nombre_completo)])), familiares: fam };
}

// Lado navegador: pide las iniciales al servidor. Si falla, la pantalla
// muestra "—" (nunca cae a pedir el nombre).
export async function pedirIniciales(ids: string[]): Promise<Iniciales> {
  const vacio: Iniciales = { donantes: {}, familiares: {} };
  if (!ids.length) return vacio;
  const r = await fetch("/api/base/iniciales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  if (!r.ok) throw new Error(`No se pudieron cargar las iniciales (${r.status}).`);
  return (await r.json()) as Iniciales;
}
