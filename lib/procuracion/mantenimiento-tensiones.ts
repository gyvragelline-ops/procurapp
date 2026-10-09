// Tensiones entre reglas que chocan. Se muestran lado a lado, "a criterio
// médico", SIN resolverse solas: ninguna dice qué hacer, solo qué pesa de
// cada lado. Umbrales en mantenimiento-metas.ts (A VALIDAR). Lógica pura.
import {
  BALANCE_MUY_POSITIVO_ML,
  HIPERNATREMIA_SODIO_MAYOR_A,
  HIPOTENSION_PAM_MENOR_A,
  NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A,
  TENSION_GLUCEMIA_MAYOR_A,
  TENSION_PAFI_MENOR_A,
} from "./mantenimiento-metas.ts";
import type { EstadoDI } from "./mantenimiento-calculos.ts";

export const LEYENDA_TENSION = "A criterio médico.";

export type Tension = {
  id: "volumen_pulmon" | "agua_libre_glucemia" | "corazon_hipotension" | "vasopresina" | "volumen_balance";
  titulo: string;
  lados: [string, string];
  notas: string[];
  leyenda: string;
};

export type EstadoParaTensiones = {
  estadoDI: EstadoDI;
  volemiaPositivas: number; // variables dinámicas que sugieren respuesta a volumen
  pafi: number | null;
  pulmonCandidato: "si" | "no" | "sin_definir";
  sodio: number | null;
  glucemia: number | null;
  corazonCandidato: "si" | "no" | "sin_definir";
  pam: number | null;
  noradrenalinaGamma: number | null;
  vasopresinaActiva: boolean;
  balanceAcumulado: number | null;
};

const n = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");
const t = (x: Omit<Tension, "leyenda">): Tension => ({ ...x, leyenda: LEYENDA_TENSION });

export function tensionesEntreReglas(e: EstadoParaTensiones): Tension[] {
  const out: Tension[] = [];
  const pideVolumen = e.estadoDI !== "sin_criterios" || e.volemiaPositivas > 0;
  const motivoVolumen = [e.estadoDI !== "sin_criterios" ? "diabetes insípida" : null, e.volemiaPositivas > 0 ? "posible hipovolemia" : null]
    .filter(Boolean)
    .join(" y ");
  const pafiBaja = e.pafi !== null && e.pafi < TENSION_PAFI_MENOR_A;
  const pulmon = e.pulmonCandidato === "si";
  const hipotension = e.pam !== null && e.pam < HIPOTENSION_PAM_MENOR_A;

  // 1. Volumen contra pulmón
  if (pideVolumen && (pafiBaja || pulmon)) {
    const ladoPulmon = [pafiBaja ? `PaFi ${n(e.pafi!)} (<${TENSION_PAFI_MENOR_A})` : null, pulmon ? "pulmón candidato" : null].filter(Boolean).join(" y ");
    out.push(t({ id: "volumen_pulmon", titulo: "Volumen contra pulmón", lados: [`Pide volumen: ${motivoVolumen}`, `Cuida el pulmón: ${ladoPulmon}`], notas: [] }));
  }

  // 2. Agua libre contra glucemia
  if (e.sodio !== null && e.sodio > HIPERNATREMIA_SODIO_MAYOR_A && e.glucemia !== null && e.glucemia > TENSION_GLUCEMIA_MAYOR_A) {
    out.push(
      t({
        id: "agua_libre_glucemia",
        titulo: "Agua libre contra glucemia",
        lados: [`Pide agua libre: Na ${n(e.sodio)}`, `Glucemia ${n(e.glucemia)} (>${TENSION_GLUCEMIA_MAYOR_A}): la dextrosa la sube`],
        notas: ["Opción a considerar: solución al medio (0,45 %).", "Insulina como opción para la glucemia."],
      })
    );
  }

  // 3. Corazón candidato contra hipotensión
  if (e.corazonCandidato === "si" && hipotension) {
    out.push(
      t({
        id: "corazon_hipotension",
        titulo: "Corazón candidato contra hipotensión",
        lados: [
          `Corazón candidato: noradrenalina ≤${n(NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A)} γ`,
          `Hipotensión: PAM ${n(e.pam!)}${e.noradrenalinaGamma !== null ? ` con noradrenalina ${n(e.noradrenalinaGamma)} γ` : ""}`,
        ],
        notas: [],
      })
    );
  }

  // 4. Vasopresina: por diabetes insípida y por hemodinamia
  const vasopresinaPorHemodinamia =
    e.vasopresinaActiva || (hipotension && e.noradrenalinaGamma !== null && e.noradrenalinaGamma > NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A);
  if (e.estadoDI !== "sin_criterios" && vasopresinaPorHemodinamia) {
    out.push(
      t({
        id: "vasopresina",
        titulo: "Vasopresina: diabetes insípida y hemodinamia",
        lados: ["Diabetes insípida: vasopresina como opción", e.vasopresinaActiva ? "Ya tiene vasopresina corriendo" : "Hemodinamia: asociar vasopresina"],
        notas: ["No duplicar."],
      })
    );
  }

  // 5. Volumen contra balance muy positivo, con pulmón candidato
  if (pideVolumen && pulmon && e.balanceAcumulado !== null && e.balanceAcumulado > BALANCE_MUY_POSITIVO_ML) {
    out.push(
      t({
        id: "volumen_balance",
        titulo: "Volumen contra balance muy positivo",
        lados: [`Pide volumen: ${motivoVolumen}`, `Balance acumulado +${n(e.balanceAcumulado)} mL con pulmón candidato`],
        notas: [],
      })
    );
  }
  return out;
}
