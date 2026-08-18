import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ETAPAS_EMOCIONALES, HERRAMIENTAS_TRANSVERSALES } from "@/lib/procuracion/comunicacion-donacion";

const client = new Anthropic();

const AnalisisSchema = z.object({
  etapa: z.number().int().min(1).max(4),
  confianza: z.enum(["alta", "media", "baja"]),
  herramientas_recomendadas: z.array(z.string()),
});

export async function POST(req: NextRequest) {
  let texto: unknown;
  try {
    ({ texto } = await req.json());
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json({ error: "Falta el texto a analizar." }, { status: 400 });
  }

  const etapasDesc = ETAPAS_EMOCIONALES.map(
    (e) => `Etapa ${e.id} — ${e.nombre}: ${e.descripcion}\nEjemplos: ${e.ejemplos.map((f) => `"${f}"`).join(" / ")}`
  ).join("\n\n");

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: zodOutputFormat(AnalisisSchema),
      },
      system:
        "Sos un asistente que ayuda a un procurador de órganos, en tiempo real, a identificar en qué etapa emocional está una familia durante el proceso de comunicación de una muerte y posible donación. El procurador transcribe (a mano o dictado) lo que la familia dice o hace. Con eso, identificá la etapa (1 a 4) según la referencia que te paso, tu nivel de confianza, y qué herramientas de la lista transversal recomendás usar ahora mismo con esa familia.",
      messages: [
        {
          role: "user",
          content: `ETAPAS DE REFERENCIA:\n${etapasDesc}\n\nHERRAMIENTAS TRANSVERSALES DISPONIBLES (elegí solo de esta lista):\n${HERRAMIENTAS_TRANSVERSALES.join(", ")}\n\nTEXTO INGRESADO POR EL PROCURADOR:\n"${texto}"`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json({ error: "No se pudo interpretar la respuesta del análisis." }, { status: 502 });
    }

    return NextResponse.json(response.parsed_output);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `Error al analizar: ${message}` }, { status: 502 });
  }
}
