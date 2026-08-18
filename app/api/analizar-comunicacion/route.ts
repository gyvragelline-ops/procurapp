import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ETAPAS_EMOCIONALES, HERRAMIENTAS_TRANSVERSALES } from "@/lib/procuracion/comunicacion-donacion";

const client = new Anthropic();

const AnalisisSchema = z.object({
  etapa: z.number().int().min(1).max(4),
  frases_sugeridas: z
    .array(
      z.object({
        frase: z.string(),
        herramienta: z.string(),
      })
    )
    .min(1)
    .max(3),
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
        "Sos un asistente que ayuda a un procurador de órganos, en tiempo real, a acompañar a una familia durante la comunicación de una muerte y una posible donación. El procurador transcribe (a mano o dictado) lo que la familia dice o hace. Con eso, identificá la etapa emocional (1 a 4) según la referencia que te paso, y generá de 1 a 3 frases concretas que el procurador pueda decir en voz alta, ahora mismo, en respuesta a lo que la familia dijo.\n\nCada frase tiene que estar inspirada en una de las herramientas transversales de la lista, pero el contenido principal es la frase en sí, no el nombre de la técnica. La frase debe sonar natural, empática y en español rioplatense/argentino coloquial (tuteo, sin formalismos), como algo que una persona diría de verdad y no como un manual. Nada de frases genéricas o robóticas: tienen que estar adaptadas específicamente a lo que esa familia dijo en el texto ingresado. Para cada frase indicá también, en el campo 'herramienta', el nombre de la técnica de la lista transversal que la inspiró.\n\nEjemplo: si la familia dice 'queremos esperar un milagro', una frase válida sería 'Entiendo que te aferres a tu fe, debe ser muy difícil sentirte así' con herramienta 'Reflejo de emociones' — no alcanza con devolver solo el nombre de la técnica.",
      messages: [
        {
          role: "user",
          content: `ETAPAS DE REFERENCIA:\n${etapasDesc}\n\nHERRAMIENTAS TRANSVERSALES DISPONIBLES (cada frase debe inspirarse en una de estas):\n${HERRAMIENTAS_TRANSVERSALES.join(", ")}\n\nTEXTO INGRESADO POR EL PROCURADOR (lo que la familia dijo/hizo):\n"${texto}"`,
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
