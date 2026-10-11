import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inicialesPorDonante, validarIds } from "@/lib/procuracion/base-iniciales";

// POST { ids: string[] } -> { donantes: {id: "JCP"}, familiares: {id: "MP"} }
// Lee nombre_completo y familiares.nombre en el servidor y devuelve solo
// las iniciales: el navegador de la Base no recibe nombres ni DNI.
//
// ATENCIÓN: sin login ni RLS todavía. NO usar con donantes reales.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const v = validarIds((body as { ids?: unknown } | null)?.ids);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (!v.ids.length) return NextResponse.json({ donantes: {}, familiares: {} });
  const supabase = await createClient();
  const [d, f] = await Promise.all([
    supabase.from("donantes").select("id, nombre_completo").in("id", v.ids),
    supabase.from("familiares").select("donante_id, nombre").in("donante_id", v.ids),
  ]);
  if (d.error) return NextResponse.json({ error: d.error.message }, { status: 502 });
  return NextResponse.json(inicialesPorDonante(d.data ?? [], f.error ? [] : (f.data ?? [])), { headers: { "Cache-Control": "no-store" } });
}
