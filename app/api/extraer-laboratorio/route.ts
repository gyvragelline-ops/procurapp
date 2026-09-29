import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic();

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const GRUPOS_LAB = ["renal", "hepatico", "gasometrico", "cardiaco", "pulmonar", "hematologico"] as const;

const ExtraccionSchema = z.object({
  items: z.array(
    z.object({
      parametro: z.string(),
      valor: z.string(),
      unidad: z.string().nullable(),
      grupo_sugerido: z.enum(GRUPOS_LAB).nullable(),
    })
  ),
});

export async function POST(req: NextRequest) {
  let imageBase64: unknown;
  let mediaType: unknown;
  try {
    ({ imageBase64, mediaType } = await req.json());
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (typeof imageBase64 !== "string" || !imageBase64) {
    return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
  }
  if (typeof mediaType !== "string" || !(MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return NextResponse.json({ error: "Tipo de imagen no soportado." }, { status: 400 });
  }

  try {
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: zodOutputFormat(ExtraccionSchema),
      },
      system:
        "Sos un asistente que lee fotos de resultados de laboratorio o de pedidos de estudios, tomadas con el celular por un procurador de órganos, muchas veces con letra chica, hojas superpuestas, mala luz o encuadre torcido. Tu tarea es extraer TODOS los parámetros con valor numérico o de texto que puedas leer con confianza razonable, cada uno como un ítem separado.\n\nPara cada ítem devolvé:\n- 'parametro': el nombre del parámetro tal como aparece impreso o escrito en la foto (no lo traduzcas, no lo normalices, copiá el nombre real, incluyendo abreviaturas si así aparece).\n- 'valor': el valor tal como está escrito (número o texto).\n- 'unidad': la unidad si está indicada en la hoja (ej. 'mg/dL', '%', 'UI/L'), o null si no hay unidad visible.\n- 'grupo_sugerido': el sistema ya sabe agrupar los parámetros habituales de laboratorio (hematológico, hepático, renal, cardíaco) y de gasometría/pulmón -- para esos, dejá este campo en null, no hace falta que decidas nada. Usalo SOLO para parámetros que el sistema no va a reconocer por su cuenta (ej. troponinas, TSH, T3, T4, cortisol y otras hormonas, u otros no habituales): ahí, si te resulta clínicamente claro a cuál de estos 6 perfiles pertenece (renal, hepatico, gasometrico, cardiaco, pulmonar, hematologico -- troponinas por ejemplo va en cardiaco), sugerilo; si no encaja claramente en ninguno, dejalo en null.\n\nNo inventes valores que no puedas leer con confianza. Si un número es ambiguo (por mala calidad de imagen), no lo incluyas. Si la foto no tiene ningún dato de laboratorio legible, devolvé una lista vacía. No extraigas fecha ni hora del estudio -- eso lo carga el médico a mano, no viaja en esta respuesta.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as (typeof MEDIA_TYPES)[number], data: imageBase64 },
            },
            {
              type: "text",
              text: "Extraé todos los parámetros de laboratorio o de estudio legibles en esta foto.",
            },
          ],
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json({ error: "No se pudo interpretar la imagen." }, { status: 502 });
    }

    return NextResponse.json(response.parsed_output);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `Error al extraer: ${message}` }, { status: 502 });
  }
}
