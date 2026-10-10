// Tipos de estudio (lógica pura: la usan el panel de carga y la Base).
export type TipoEstudio = "Laboratorio" | "Rx_torax" | "TAC_torax" | "Ecografia" | "ECG" | "Ecocardiograma" | "Broncoscopia" | "Fotos_cuerpo";

// Sin IA en ningún punto de este archivo ni de ImagenesVideosPanel --
// es solo carga y almacenamiento de archivos. Cada categoría define qué
// modos de carga ofrece (no todas admiten los tres): Laboratorio/Rx/
// Fotos del cuerpo son fotos fijas (Cámara+Galería); TAC es video en
// movimiento (Video+Galería, sin foto); Ecografía admite los tres --
// Cámara para el informe escrito, Video para el estudio en sí.
export type Modo = "foto" | "video" | "galeria";

export const TIPOS_ESTUDIO_INFO: { valor: TipoEstudio; etiqueta: string; nota?: string; modos: Modo[] }[] = [
  { valor: "Laboratorio", etiqueta: "Laboratorio", modos: ["foto", "galeria"] },
  { valor: "Rx_torax", etiqueta: "Rx de tórax", modos: ["foto", "galeria"] },
  { valor: "TAC_torax", etiqueta: "TAC de tórax", modos: ["video", "galeria"] },
  { valor: "Ecografia", etiqueta: "Ecografía", modos: ["foto", "video", "galeria"] },
  { valor: "ECG", etiqueta: "ECG", modos: ["foto", "galeria"] },
  { valor: "Ecocardiograma", etiqueta: "Ecocardiograma", modos: ["foto", "video", "galeria"] },
  { valor: "Broncoscopia", etiqueta: "Broncoscopía", modos: ["foto", "video", "galeria"] },
  {
    valor: "Fotos_cuerpo",
    etiqueta: "Fotos del cuerpo",
    nota: "Tórax, abdomen, tatuajes o marcas identificativas — sin mostrar la cara.",
    modos: ["foto", "galeria"],
  },
];
