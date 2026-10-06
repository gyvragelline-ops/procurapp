// Sugerencias por reglas fijas (sin IA) del panel de Mantenimiento.
// Apoyo a la decisión, NO indicación: cada sugerencia lleva
// LEYENDA_VERIFICACION. Fármacos y dosis salen de DOSIS
// (mantenimiento-metas.ts), tal cual el spec -- no se agrega ninguno acá.
//
// Bradicardia: solo isoproterenol, dopamina o marcapasos (spec). El
// anticolinérgico clásico está PROHIBIDO en toda la app (no actúa en el
// corazón denervado del donante): hay un test que verifica que su nombre
// no aparece en ninguna sugerencia ni en estos archivos.
import {
  BRADICARDIA_FC_MENOR_A,
  DOSIS,
  HIPERNATREMIA_SODIO_MAYOR_A,
  HIPOTENSION_PAM_MENOR_A,
  HORAS_LAB_DESACTUALIZADO,
  HTA_PAM_MAYOR_A,
  IC_NO_BETABLOQUEAR_MENOR_A,
  LEYENDA_VERIFICACION,
  NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A,
  TAQUICARDIA_FC_MAYOR_A,
} from "./mantenimiento-metas.ts";
import type { EstadoDI } from "./mantenimiento-calculos.ts";

export type Sugerencia = {
  id:
    | "hta_taquicardia"
    | "hipotension"
    | "hipovolemia"
    | "bradicardia"
    | "taquicardia"
    | "deterioro_miocardico"
    | "hipernatremia"
    | "nutricion"
    | "potasio"
    | "diabetes_insipida";
  titulo: string;
  nivel: "rojo" | "amarillo" | "info";
  lineas: string[];
  leyenda: string;
  // Dato en que se apoya la sugerencia, con su edad ("Na 152, de hace
  // 7 h"); `destacada` si es más viejo que HORAS_LAB_DESACTUALIZADO.
  notas?: { texto: string; destacada: boolean }[];
};

export type EstadoParaSugerencias = {
  pam: number | null;
  fc: number | null;
  noradrenalinaGamma: number | null; // null = sin noradrenalina corriendo
  vasopresinaActiva: boolean; // infusión no anulada y con velocidad > 0
  disfuncionMiocardica: boolean;
  ic: number | null; // medido o calculado
  corazonCandidato: "si" | "no" | "sin_definir";
  sodio: number | null;
  volemia: { cargadas: number; positivas: number };
  estadoDI: EstadoDI;
  nutricionPrevia: "si" | "no" | null;
  // Horas desde que se midió el sodio usado (null = sin dato de hora).
  sodioHaceHoras: number | null;
};

const s = (sug: Omit<Sugerencia, "leyenda">): Sugerencia => ({ ...sug, leyenda: LEYENDA_VERIFICACION });

// "Na 152, de hace 7 h" -- siempre que una sugerencia se apoya en el sodio.
function notaSodio(sodio: number | null, horas: number | null): { texto: string; destacada: boolean }[] {
  if (sodio === null) return [];
  const edad =
    horas === null ? "sin hora" : horas < 1 ? "de hace menos de 1 h" : `de hace ${Math.floor(horas)} h`;
  return [{ texto: `Na ${String(sodio).replace(".", ",")}, ${edad}`, destacada: horas !== null && horas > HORAS_LAB_DESACTUALIZADO }];
}
// Números en los textos con coma decimal ("0,3", no "0.3").
const n = (x: number) => String(x).replace(".", ",");

export function generarSugerencias(e: EstadoParaSugerencias): Sugerencia[] {
  const out: Sugerencia[] = [];
  const hta = e.pam !== null && e.pam > HTA_PAM_MAYOR_A;
  const taquicardia = e.fc !== null && e.fc > TAQUICARDIA_FC_MAYOR_A;
  const bradicardia = e.fc !== null && e.fc < BRADICARDIA_FC_MENOR_A;
  const hipotension = e.pam !== null && e.pam < HIPOTENSION_PAM_MENOR_A;
  const icBajo = e.ic !== null && e.ic < IC_NO_BETABLOQUEAR_MENOR_A;

  // HTA + taquicardia (reflejo de Cushing / tormenta adrenérgica)
  if (hta && taquicardia) {
    const lineas = ["Es esperable (reflejo de Cushing / tormenta adrenérgica) y NO se trata."];
    if (icBajo) {
      lineas.push(`IC <${n(IC_NO_BETABLOQUEAR_MENOR_A)}: ecocardiograma antes de tratar.`);
    } else if (e.disfuncionMiocardica) {
      // Única sugerencia en la tormenta adrenérgica con disfunción.
      lineas.push(`Con disfunción miocárdica: ${DOSIS.esmolol}.`);
    } else {
      lineas.push("Sin disfunción miocárdica: esperar.");
    }
    lineas.push("Después viene hipotensión y colapso cardiovascular: anticiparse.");
    out.push(s({ id: "hta_taquicardia", titulo: "Hipertensión con taquicardia", nivel: "amarillo", lineas }));
  }

  // Hipotensión
  if (hipotension) {
    const lineas = ["Primero descartar hipovolemia."];
    if (e.noradrenalinaGamma !== null && e.noradrenalinaGamma > NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A) {
      lineas.push(`Noradrenalina >${n(NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A)} γ: asociar ${DOSIS.vasopresinaHemodinamia}.`);
    } else {
      lineas.push(`${DOSIS.noradrenalina}.`);
    }
    if (e.corazonCandidato === "si") {
      lineas.push(`Corazón candidato: mantener noradrenalina ≤${n(NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A)} γ.`);
    }
    out.push(s({ id: "hipotension", titulo: "Hipotensión", nivel: "rojo", lineas }));
  }

  // Hipovolemia: al menos una variable dinámica positiva
  if (e.volemia.positivas > 0) {
    const lineas = [
      `${e.volemia.positivas} de ${e.volemia.cargadas} variables dinámicas cargadas sugieren respuesta a volumen.`,
      "Ringer lactato o solución 0,9%.",
    ];
    if (e.sodio !== null && e.sodio > HIPERNATREMIA_SODIO_MAYOR_A) lineas.push("Con sodio alto: solución 0,45% o agua libre.");
    out.push(s({ id: "hipovolemia", titulo: "Posible hipovolemia", nivel: "amarillo", lineas }));
  }

  // Bradicardia
  if (bradicardia) {
    out.push(
      s({
        id: "bradicardia",
        titulo: "Bradicardia",
        nivel: "rojo",
        lineas: [`${DOSIS.isoproterenol} o ${DOSIS.dopaminaBradicardia}.`, "Si es refractaria: marcapasos transitorio."],
      })
    );
  }

  // Taquicardia (sin HTA: con HTA la cubre la regla de arriba)
  if (taquicardia && !hta) {
    out.push(
      s({
        id: "taquicardia",
        titulo: "Taquicardia",
        nivel: "amarillo",
        lineas: ["Revisar ionograma, temperatura, oxigenación y volemia; corregir la causa.", `Opción: ${DOSIS.amiodarona}.`],
      })
    );
  }

  // Deterioro miocárdico
  if (e.disfuncionMiocardica || icBajo) {
    out.push(
      s({
        id: "deterioro_miocardico",
        titulo: "Deterioro miocárdico",
        nivel: "amarillo",
        lineas: [`${DOSIS.dobutamina}, con seguimiento por ecocardiograma.`],
      })
    );
  }

  // Hipernatremia
  if (e.sodio !== null && e.sodio > HIPERNATREMIA_SODIO_MAYOR_A) {
    out.push(
      s({
        id: "hipernatremia",
        titulo: "Hipernatremia",
        nivel: "amarillo",
        lineas: [
          "Monitorizar el sodio.",
          "Reponer con solución al medio o agua libre.",
          "Opciones: desmopresina o vasopresina.",
          "Meta: sodio <155. Si el hígado es candidato, apuntar a mantenerlo bajo.",
        ],
        notas: notaSodio(e.sodio, e.sodioHaceHoras),
      })
    );
  }

  // Diabetes insípida
  if (e.estadoDI !== "sin_criterios") {
    const lineas = [
      "Antes de confirmar, descartar otras causas de poliuria: diuresis osmótica por glucemia alta, manitol o diuréticos, sobrecarga de volumen.",
      "Reponer con agua libre o solución al medio.",
    ];
    if (hipotension) lineas.push(`Con inestabilidad hemodinámica: ${DOSIS.desmopresinaDI} o ${DOSIS.vasopresinaDI}.`);
    if (e.vasopresinaActiva) lineas.push("Ya tiene vasopresina por la presión: no duplicar.");
    out.push(
      s({
        id: "diabetes_insipida",
        titulo: e.estadoDI === "probable" ? "Diabetes insípida probable" : "Sospecha de diabetes insípida",
        nivel: e.estadoDI === "probable" ? "rojo" : "amarillo",
        lineas,
        notas: notaSodio(e.sodio, e.sodioHaceHoras),
      })
    );
    // Potasio: vigilancia mientras haya diabetes insípida.
    out.push(
      s({
        id: "potasio",
        titulo: "Potasio",
        nivel: "info",
        lineas: ["Vigilar el potasio: cae mientras haya diabetes insípida."],
      })
    );
  }

  // Nutrición
  if (e.nutricionPrevia !== null) {
    out.push(
      s({
        id: "nutricion",
        titulo: "Nutrición",
        nivel: "info",
        lineas: [
          e.nutricionPrevia === "si" ? "Recibía nutrición: dejarla a dosis mínima." : "No recibía nutrición: suspender.",
          "No dejarla a dosis plena. Queda a criterio médico.",
        ],
      })
    );
  }

  // Rojas primero, después amarillas, después informativas.
  const orden = { rojo: 0, amarillo: 1, info: 2 } as const;
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
