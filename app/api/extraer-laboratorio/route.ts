import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic();

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const ExtraccionSchema = z.object({
  items: z.array(
    z.object({
      parametro: z.string(),
      valor: z.string(),
      unidad: z.string().nullable(),
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
        "Sos un asistente que lee fotos de resultados de laboratorio o de pedidos de estudios, tomadas con el celular por un procurador de órganos, muchas veces con letra chica, hojas superpuestas, mala luz o encuadre torcido. Tu tarea es extraer TODOS los parámetros con valor numérico o de texto que puedas leer con confianza razonable, cada uno como un ítem separado.\n\nPara cada ítem devolvé:\n- 'parametro': el nombre del parámetro tal como aparece impreso o escrito en la foto (no lo traduzcas, no lo normalices, copiá el nombre real, incluyendo abreviaturas si así aparece).\n- 'valor': el valor tal como está escrito (número o texto).\n- 'unidad': la unidad si está indicada en la hoja (ej. 'mg/dL', '%', 'UI/L'), o null si no hay unidad visible.\n\nNo inventes valores que no puedas leer con confianza. Si un número es ambiguo (por mala calidad de imagen), no lo incluyas. Si la foto no tiene ningún dato de laboratorio legible, devolvé una lista vacía.",
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
