// =====================================================================
// DISTRIBUCIÓN POR ÓRGANO · requisitos de cada equipo
// A VALIDAR CON PROTOCOLO CUCAIBA/INCUCAI
// =====================================================================
// Archivo de configuración para editar a mano: qué pide cada equipo y
// con qué dato de la app se cruza. Lógica pura (lo usan la Base y los
// tests). La app NO juzga la aptitud: la decide cada equipo.
//
// Tipos de requisito:
//   "dato"         se cruza con lo cargado: ✓ listo / ○ falta.
//   "texto"        la app no lo carga: ○ falta, y la Base lo escribe en
//                  la ficha (no se guarda).
//   "antecedentes" texto libre del donante: "!" con el texto; la Base
//                  decide si lo incluye.
//   "informativo"  "!" con una nota fija (lo hace otro); no cuenta para
//                  "N de M listos" y viene destildado.
//
// `dato`: de dónde sale (lo interpreta lib/procuracion/distribucion.ts).

export type OrganoDistribucion = "pulmon" | "corazon" | "rinon" | "higado" | "pancreas";
export type TipoRequisito = "dato" | "texto" | "antecedentes" | "informativo";

export type ClaveDato =
  | "pafi" // PaO2/FiO2 con la FiO2 y la PEEP del respirador de esa hora
  | "rx_torax" // última Rx de tórax: "de hace X h"
  | "fibrobroncoscopia"
  | "talla_perimetros" // talla + todos los perímetros torácicos cargados
  | "respirador" // último evento del respirador
  | "cultivo_aspirado"
  | "ecocardiograma"
  | "ecg"
  | "vasoactivos"
  | "troponina_cpkmb"
  | "pam"
  | "coronariografia"
  | "creatinina_urea" // evolutivas: primera → última
  | "diuresis_balance"
  | "sedimento_proteinuria"
  | "ecografia_renal"
  | "hepatograma"
  | "tp_kptt"
  | "ecografia_abdominal"
  | "sodio"
  | "peso_talla"
  | "hemocultivos"
  | "glucemias"
  | "amilasa_lipasa";

export type Requisito = {
  clave: string;
  etiqueta: string;
  tipo: TipoRequisito;
  dato?: ClaveDato;
  nota?: string; // texto fijo de los informativos, o aclaración
};

// Rx de tórax: con más de estas horas se marca "!" (solo se avisa).
export const RX_TORAX_HORAS_AVISO = 12;

// Perímetros torácicos de la planilla de medidas (op2_p2) que se listan
// en la ficha pulmonar, cada uno con su nombre.
export const PERIMETROS_TORACICOS = ["p_axilar", "p_xif"] as const;

export type ConfigOrgano = {
  clave: OrganoDistribucion;
  etiqueta: string;
  equipo: string; // nombre por defecto del equipo en la ficha
  organoQuirofano: "pulmones" | "corazon" | "rinones" | "higado" | "pancreas"; // clave en órganos aceptados y equipos
  color: string; // dibujo
  fondo: [string, string]; // degradé de la cabecera de la imagen
  requisitos: Requisito[];
};

export const ORGANOS_DISTRIBUCION: ConfigOrgano[] = [
  {
    clave: "pulmon",
    etiqueta: "Pulmón",
    equipo: "Equipo pulmonar",
    organoQuirofano: "pulmones",
    color: "#6FA8C9",
    fondo: ["#2D6E91", "#6FA8C9"],
    requisitos: [
      { clave: "pafi", etiqueta: "PaO₂/FiO₂ con FiO₂ y PEEP", tipo: "dato", dato: "pafi" },
      { clave: "desafio", etiqueta: "Prueba de desafío (FiO₂ 1,0 y PEEP 5)", tipo: "texto" },
      { clave: "rx_torax", etiqueta: "Rx de tórax actualizada", tipo: "dato", dato: "rx_torax" },
      { clave: "fibrobroncoscopia", etiqueta: "Fibrobroncoscopia", tipo: "dato", dato: "fibrobroncoscopia" },
      { clave: "talla_perimetros", etiqueta: "Talla y perímetro torácico", tipo: "dato", dato: "talla_perimetros" },
      { clave: "respirador", etiqueta: "Parámetros del respirador", tipo: "dato", dato: "respirador" },
      { clave: "cultivo_aspirado", etiqueta: "Cultivo de aspirado traqueal", tipo: "dato", dato: "cultivo_aspirado" },
      { clave: "antecedentes", etiqueta: "Antecedentes (tabaquismo)", tipo: "antecedentes" },
    ],
  },
  {
    clave: "corazon",
    etiqueta: "Corazón",
    equipo: "Equipo cardíaco",
    organoQuirofano: "corazon",
    color: "#C8402F",
    fondo: ["#8E2A1F", "#D0604F"],
    requisitos: [
      { clave: "ecocardiograma", etiqueta: "Ecocardiograma (FEVI, grosor, válvulas)", tipo: "dato", dato: "ecocardiograma", nota: "FEVI, grosor y válvulas: escribirlos en la ficha" },
      { clave: "ecg", etiqueta: "ECG", tipo: "dato", dato: "ecg" },
      { clave: "vasoactivos", etiqueta: "Dosis de vasoactivos", tipo: "dato", dato: "vasoactivos" },
      { clave: "troponina_cpkmb", etiqueta: "Troponina y CPK-MB", tipo: "dato", dato: "troponina_cpkmb" },
      { clave: "pam", etiqueta: "PAM", tipo: "dato", dato: "pam" },
      { clave: "coronariografia", etiqueta: "Cinecoronariografía (si hay factores de riesgo o edad >45)", tipo: "dato", dato: "coronariografia" },
    ],
  },
  {
    clave: "rinon",
    etiqueta: "Riñón",
    equipo: "Equipo renal",
    organoQuirofano: "rinones",
    color: "#B5533C",
    fondo: ["#8A3B28", "#C4694F"],
    requisitos: [
      { clave: "creatinina_urea", etiqueta: "Creatinina y urea evolutivas", tipo: "dato", dato: "creatinina_urea" },
      { clave: "diuresis_balance", etiqueta: "Diuresis horaria y balance", tipo: "dato", dato: "diuresis_balance" },
      { clave: "sedimento_proteinuria", etiqueta: "Sedimento y proteinuria", tipo: "dato", dato: "sedimento_proteinuria" },
      { clave: "ecografia_renal", etiqueta: "Ecografía renal", tipo: "dato", dato: "ecografia_renal" },
      { clave: "antecedentes", etiqueta: "Antecedentes (HTA, diabetes)", tipo: "antecedentes" },
      { clave: "hla", etiqueta: "HLA y crossmatch", tipo: "informativo", nota: "lo hace INCUCAI" },
      { clave: "biopsia", etiqueta: "Biopsia renal", tipo: "informativo", nota: "si criterio expandido" },
    ],
  },
  {
    clave: "higado",
    etiqueta: "Hígado",
    equipo: "Equipo hepático",
    organoQuirofano: "higado",
    color: "#8C4A2F",
    fondo: ["#5E2F1C", "#9C5A3D"],
    requisitos: [
      { clave: "hepatograma", etiqueta: "TGO, TGP, bilirrubina total y directa, FA, GGT", tipo: "dato", dato: "hepatograma" },
      { clave: "tp_kptt", etiqueta: "TP y KPTT", tipo: "dato", dato: "tp_kptt" },
      { clave: "ecografia_abdominal", etiqueta: "Ecografía abdominal", tipo: "dato", dato: "ecografia_abdominal" },
      { clave: "sodio", etiqueta: "Sodio", tipo: "dato", dato: "sodio" },
      { clave: "peso_talla", etiqueta: "Peso y talla", tipo: "dato", dato: "peso_talla" },
      { clave: "antecedentes", etiqueta: "Antecedentes (alcohol)", tipo: "antecedentes" },
      { clave: "hemocultivos", etiqueta: "Hemocultivos", tipo: "dato", dato: "hemocultivos" },
    ],
  },
  {
    clave: "pancreas",
    etiqueta: "Páncreas",
    equipo: "Equipo de páncreas",
    organoQuirofano: "pancreas",
    color: "#D9A441",
    fondo: ["#9C6E1A", "#D9A441"],
    requisitos: [
      { clave: "glucemias", etiqueta: "Glucemias seriadas", tipo: "dato", dato: "glucemias" },
      { clave: "amilasa_lipasa", etiqueta: "Amilasa y lipasa", tipo: "dato", dato: "amilasa_lipasa" },
      { clave: "diabetes_previa", etiqueta: "Diabetes previa (sí / no / desconocido)", tipo: "texto" },
      { clave: "peso_talla", etiqueta: "Peso y talla", tipo: "dato", dato: "peso_talla" },
      { clave: "aspecto", etiqueta: "Aspecto macroscópico", tipo: "informativo", nota: "lo informa el cirujano" },
    ],
  },
];

// Ítems que van en todas las fichas (no cuentan para "N de M listos").
export const ITEMS_COMUNES = {
  donante: { clave: "donante", etiqueta: "Datos del donante (sexo, edad, peso, talla, grupo)" },
  quirofano: { clave: "quirofano", etiqueta: "Quirófano y anestesista" },
} as const;

// Cierre de todos los mensajes.
export const CIERRE_FICHA = "La aptitud la decide cada equipo.";

// ---------------------------------------------------------------------
// Estudios cargados -> órganos (A VALIDAR). Lo que no está acá no entra en
// ninguna ficha: "Laboratorio" (foto del informe) y "Fotos del cuerpo"
// pueden mostrar nombre o DNI. Incluye los tipos que suma la Fase 3.
export const ESTUDIOS_POR_ORGANO: Record<string, OrganoDistribucion[]> = {
  Rx_torax: ["pulmon", "corazon"],
  TAC_torax: ["pulmon"],
  Broncoscopia: ["pulmon"],
  Ecocardiograma: ["corazon"],
  ECG: ["corazon"],
  Coronariografia: ["corazon"],
  Ecografia: ["higado", "rinon", "pancreas"],
  Eco_abdominal: ["higado", "rinon", "pancreas"],
  TAC_abdomen: ["higado", "rinon", "pancreas"],
  Eco_renal: ["rinon"],
};

// Sección del PDF de cada requisito (los que no figuran van a "Otros").
export const SECCION_REQUISITO: Record<string, string> = {
  pafi: "Oxigenación",
  desafio: "Oxigenación",
  respirador: "Respirador",
  talla_perimetros: "Medidas",
  peso_talla: "Medidas",
  antecedentes: "Antecedentes",
  cultivo_aspirado: "Cultivos",
  hemocultivos: "Cultivos",
  vasoactivos: "Hemodinamia",
  pam: "Hemodinamia",
  troponina_cpkmb: "Laboratorio",
  hepatograma: "Laboratorio",
  tp_kptt: "Laboratorio",
  sodio: "Laboratorio",
  amilasa_lipasa: "Laboratorio",
  glucemias: "Laboratorio",
  creatinina_urea: "Función renal",
  diuresis_balance: "Función renal",
  sedimento_proteinuria: "Función renal",
  diabetes_previa: "Antecedentes",
  hla: "Informativo",
  biopsia: "Informativo",
  aspecto: "Informativo",
};
