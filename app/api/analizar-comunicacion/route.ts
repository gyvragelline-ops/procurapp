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
  avance_donacion: z.object({
    procurador_menciono_donacion: z.boolean(),
    puede_avanzar: z.boolean(),
    mensaje: z.string(),
  }),
});

const HistorialEntradaSchema = z.object({
  texto: z.string(),
  etapa: z.number().int().min(1).max(4).nullable(),
});

export async function POST(req: NextRequest) {
  let texto: unknown;
  let historial_reciente: unknown;
  try {
    ({ texto, historial_reciente } = await req.json());
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json({ error: "Falta el texto a analizar." }, { status: 400 });
  }

  const historialParsed = z.array(HistorialEntradaSchema).max(3).safeParse(historial_reciente);
  const historial = historialParsed.success ? historialParsed.data : [];

  const etapasDesc = ETAPAS_EMOCIONALES.map(
    (e) => `Etapa ${e.id} — ${e.nombre}: ${e.descripcion}\nEjemplos: ${e.ejemplos.map((f) => `"${f}"`).join(" / ")}`
  ).join("\n\n");

  const historialDesc =
    historial.length > 0
      ? historial
          .slice()
          .reverse()
          .map((h, i) => `${i + 1}. (etapa ${h.etapa ?? "?"}) "${h.texto}"`)
          .join("\n")
      : "Sin registros previos en esta conversación.";

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: zodOutputFormat(AnalisisSchema),
      },
      system:
        "Sos un asistente que ayuda a un procurador de órganos, en tiempo real, a acompañar a una familia durante la comunicación de una muerte y una posible donación. El procurador transcribe (a mano o dictado) lo que la familia dice o hace. Con eso, identificá la etapa emocional (1 a 4) según la referencia que te paso, y generá de 1 a 3 frases concretas que el procurador pueda decir en voz alta, ahora mismo, en respuesta a lo que la familia dijo.\n\nRegla más importante, sin excepción: TODA frase generada valida primero la emoción o la confusión de la familia, en tono cálido y cercano — recién después, si hace falta, puede sumar información. Nunca generes una frase que arranque corrigiendo, explicando o informando algo técnico (por ejemplo, no arranques explicando por qué el cuerpo sigue tibio o por qué el respirador lo mantiene así); eso suena a clase de medicina y no es lo que necesita esa familia en este momento. Primero se nombra y se acompaña lo que la familia siente ('te escucho', 'entiendo que...', 'debe ser muy difícil...'), y solo si es imprescindible se agrega una aclaración breve al final, nunca al principio ni como eje de la frase.\n\nCada frase tiene que estar inspirada en una de las herramientas transversales de la lista, pero el contenido principal es la frase en sí, no el nombre de la técnica. La frase debe sonar natural, empática y en español rioplatense/argentino coloquial (tuteo, sin formalismos), como algo que una persona diría de verdad y no como un manual. Nada de frases genéricas o robóticas: tienen que estar adaptadas específicamente a lo que esa familia dijo en el texto ingresado. Para cada frase indicá también, en el campo 'herramienta', el nombre de la técnica de la lista transversal que la inspiró.\n\nEjemplos del tono correcto:\n- Familia dice 'queremos esperar un milagro' → 'Entiendo que te aferres a tu fe, debe ser muy difícil sentirte así' (herramienta: Reflejo de emociones).\n- Familia dice 'pero yo lo noto calentito' → 'Te escucho: lo tocás y lo sentís tibio, y eso te confunde muchísimo. Es una de las cosas más difíciles de entender en este momento' (herramienta: Reflejo de emociones) — nunca 'Está tibio porque el respirador...' como frase principal.\n\nNo alcanza con devolver solo el nombre de la técnica: siempre generá la frase completa, con la validación emocional primero.\n\nADEMÁS, evaluá si el procurador se está adelantando de etapa con la familia. Mirá el texto actual Y el historial reciente de esta misma conversación (te lo paso abajo) como una secuencia, no una frase aislada. Marcá 'procurador_menciono_donacion' en true solo si el procurador narra que él mismo (o algún profesional) ya introdujo el tema de la donación de órganos con la familia (por ejemplo: preguntó si donarían, mencionó la posibilidad, empezó a explicar el proceso). Si el procurador todavía no mencionó donación en absoluto, poné 'procurador_menciono_donacion' en false y dejá 'mensaje' vacío ('').\n\nSi 'procurador_menciono_donacion' es true, evaluá si corresponde avanzar mirando la etapa emocional de la familia (actual + tendencia del historial):\n- Si la familia sigue en etapa 1 o 2 (negación, dudas/explicaciones), poné 'puede_avanzar' en false y 'mensaje' con un texto tipo: 'Todavía no — la familia sigue en [nombre de la etapa], conviene seguir trabajando ahí antes de avanzar.'\n- Si la familia está en etapa 3, sé conservador: solo poné 'puede_avanzar' en true si el historial muestra una tendencia clara hacia la etapa 4; si hay cualquier duda, poné 'puede_avanzar' en false con el mismo tipo de mensaje.\n- Si la familia está en etapa 4 o dio señales claras de estar lista, poné 'puede_avanzar' en true y 'mensaje' confirmando que puede avanzar (breve, cálido).\nAnte la duda, siempre priorizá 'puede_avanzar: false' — es preferible sugerir seguir trabajando la etapa actual antes que apurar el paso a hablar de donación.",
      messages: [
        {
          role: "user",
          content: `ETAPAS DE REFERENCIA:\n${etapasDesc}\n\nHERRAMIENTAS TRANSVERSALES DISPONIBLES (cada frase debe inspirarse en una de estas):\n${HERRAMIENTAS_TRANSVERSALES.join(", ")}\n\nHISTORIAL RECIENTE DE ESTA CONVERSACIÓN (de más antiguo a más reciente, antes del texto actual):\n${historialDesc}\n\nTEXTO INGRESADO POR EL PROCURADOR AHORA (lo que la familia dijo/hizo, y lo que él mismo dijo/hizo):\n"${texto}"`,
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
