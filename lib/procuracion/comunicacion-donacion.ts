export type EtapaEmocional = {
  id: number;
  nombre: string;
  descripcion: string;
  ejemplos: string[];
};

export const ETAPAS_EMOCIONALES: EtapaEmocional[] = [
  {
    id: 1,
    nombre: "Negación",
    descripcion:
      "Incluye depresión/enojo, desorganización/confusión, aceptación/rechazo de lo que está pasando.",
    ejemplos: [
      "Le late el corazón, está vivo…",
      "Me lo quiero llevar así…",
      "Queremos esperar un milagro",
      "Cuando le hablo me escucha, acelera la respiración",
      "Esto es porque ustedes no hicieron lo que había que hacer",
    ],
  },
  {
    id: 2,
    nombre: "Aceptación, dudas, explicaciones",
    descripcion: "La familia empieza a aceptar pero todavía pregunta y busca explicaciones.",
    ejemplos: [
      "¿Cómo es que le late el corazón y está muerto?",
      "Pero yo lo noto calentito",
      "¿No puede intentarse una cirugía más?",
      "¿Y si lo derivamos a otro lugar?",
    ],
  },
  {
    id: 3,
    nombre: "Hablar del fallecido (lo que ya no es)",
    descripcion: "La familia empieza a hablar de la persona fallecida en pasado.",
    ejemplos: [
      "Estaba estudiando y se esforzaba mucho",
      "Siempre tuvo malas compañías pero era bueno",
      "Era un excelente padre de familia",
    ],
  },
  {
    id: 4,
    nombre: "Hablar de la familia (lo que será)",
    descripcion:
      "La familia empieza a proyectarse a futuro sin el fallecido — habilita pasar a hablar de donación.",
    ejemplos: [
      "¿Y ahora cómo le digo a los hijos?",
      "¿Y cómo puedo seguir sin él en mi vida?",
      "No sé cómo hacer con todo lo que me espera",
      "¿Y si hubiera hecho algo distinto?",
    ],
  },
];

export const HERRAMIENTAS_TRANSVERSALES: string[] = [
  "Silencios, tiempo, espacio",
  "Escucha activa",
  "Reflejo de emociones",
  "Resumen de información",
  "Preguntas abiertas",
  "Relación de ayuda",
];

export type FraseSugerida = {
  frase: string;
  herramienta: string;
};

export type AnalisisComunicacion = {
  etapa: number;
  frases_sugeridas: FraseSugerida[];
};

export type RegistroComunicacion = {
  id: string;
  texto: string;
  etapa_detectada: number | null;
  frases_sugeridas: FraseSugerida[];
  created_at: string;
};
