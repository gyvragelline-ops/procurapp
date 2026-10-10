// Medidas antropométricas (planilla_valores, planilla_key='op2_p2'): los 8
// campos de la planilla OP2, en cm. Lógica pura: los usan el panel del
// procurador y la Base.
export const PLANILLA_MEDIDAS = "op2_p2";

export const CAMPOS_PLANILLA: { key: string; label: string; ayuda: string }[] = [
  { key: "l_esternal", label: "1. Línea esternal", ayuda: "Longitud del esternón, desde el manubrio hasta el apéndice xifoides" },
  { key: "p_axilar", label: "2. Perímetro axilar", ayuda: "Circunferencia torácica completa, cinta métrica a la altura de ambas axilas" },
  { key: "p_xif", label: "3. Perímetro xifoideo", ayuda: "Circunferencia completa a la altura del apéndice xifoides" },
  { key: "p_umbilic", label: "4. Perímetro umbilical", ayuda: "Circunferencia completa a la altura del ombligo" },
  { key: "biliaco", label: "5. Biilíaco", ayuda: "Distancia entre ambas crestas ilíacas (no circunferencia)" },
  { key: "xifopubiano", label: "6. Xifopubiano", ayuda: "Distancia entre el apéndice xifoides y la sínfisis del pubis" },
  {
    key: "d_ventral",
    label: "7. Dorso ventral",
    ayuda: "Diámetro anteroposterior del abdomen: paciente en decúbito supino, desde el plano de la camilla hasta el punto más prominente de la pared abdominal",
  },
  { key: "femur", label: "8. Fémur", ayuda: "Longitud del fémur" },
];
