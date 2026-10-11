// Ficha por equipo (solo Base): qué se incluye, valores editables, valores
// calculados bloqueados, versiones y lo que va al PDF. Lógica pura, con
// tests. Diseño: handoff/disenos/preview-ficha.png.
//
// Reglas:
// - Un valor editado vive SOLO en la ficha: no toca el registro clínico.
// - Los valores CALCULADOS (PaFi, balance) no se editan: se editan sus
//   fuentes (PaO2, FiO2) y se recalculan.
// - Inverosímil (RANGOS_A_VERIFICAR) -> "a verificar": no se manda el valor.
// - FiO2 solo en fracción 0,21–1.
// - Nunca: nombre, DNI, familia, foto del DNI. La ficha se arma con un
//   donante reducido (DonanteFicha) que no tiene esos campos.

import { horaTexto } from "./base-secciones.ts";
import { serie } from "./base-expediente.ts";
import { fio2Valida, leerFio2, pafiGasometria, respiradorVigenteEn, textoFio2, textoFio2Despues } from "./mantenimiento-calculos.ts";
import { MODOS_RESPIRADOR, RANGOS_A_VERIFICAR } from "./mantenimiento-metas.ts";
import { CAMPOS_PLANILLA } from "./medidas-campos.ts";
import { lineaConAutor } from "./base-nombre.ts";
import { evaluarRequisito, itemDonante, itemQuirofano, num, ultimo, type Datos, type FichaOrgano } from "./distribucion.ts";
import { CIERRE_FICHA, ESTUDIOS_POR_ORGANO, PERIMETROS_TORACICOS, SECCION_REQUISITO, type ConfigOrgano, type Requisito } from "./distribucion-requisitos.ts";
import { TIPOS_ESTUDIO_INFO } from "./estudios-imagenes-tipos.ts";

export const A_VERIFICAR = "a verificar";
export const MAX_TEXTO_FICHA = 300;
export const SIN_IDENTIDAD = "Sin nombre ni DNI del donante.";

// ---------------------------------------------------------------- campos
export type TipoCampo = "numero" | "fio2" | "texto";
export type Campo = {
  clave: string; // única dentro de la ficha
  etiqueta: string;
  seccion: string;
  requisito: string; // clave del requisito (o "donante" / "quirofano")
  tipo: TipoCampo;
  unidad: string | null;
  original: string | null; // valor del registro, como se muestra ("0,40", "140")
  numero: number | null; // el mismo valor como número (numero / fio2)
  hora: string | null; // ISO del dato
  nota: string | null; // aclaración que acompaña al valor (no se edita)
  calculo: "pafi" | "bloqueado" | null; // calculado: no se edita a mano
  motivo: string | null; // calculado que no se pudo calcular
  rango: { min: number; max: number } | null; // fuera -> "a verificar"
  informativo: boolean;
};

export type EstudioFicha = { id: string; tipo: string; etiqueta: string; en: string; video: boolean; url: string | null; descripcion: string | null };

export type CamposOrgano = {
  campos: Campo[];
  estudios: EstudioFicha[]; // cargados y mapeados a este órgano
  faltanEstudios: { clave: string; etiqueta: string }[]; // requisitos de estudio sin carga
};

const etiquetaEstudio = (t: string) => TIPOS_ESTUDIO_INFO.find((x) => x.valor === t)?.etiqueta ?? t.replace(/_/g, " ");
const seccionDe = (r: string) => SECCION_REQUISITO[r] ?? "Otros";

function base(r: Pick<Requisito, "clave">, extra: Partial<Campo> & Pick<Campo, "clave" | "etiqueta">): Campo {
  return {
    seccion: seccionDe(r.clave),
    requisito: r.clave,
    tipo: "texto",
    unidad: null,
    original: null,
    numero: null,
    hora: null,
    nota: null,
    calculo: null,
    motivo: null,
    rango: null,
    informativo: false,
    ...extra,
  };
}

// Parámetro del laboratorio / mantenimiento como campo numérico editable.
function campoParametro(r: Requisito, d: Datos, clave: string, etiqueta: string, ahora: number, extra: Partial<Campo> = {}): Campo {
  const u = ultimo(d, clave, ahora);
  const n = u ? Number(u.texto.split(" ")[0].replace(",", ".")) : null;
  const unidad = u ? u.texto.split(" ").slice(1).join(" ") || null : null;
  const esNumero = n !== null && Number.isFinite(n);
  return base(r, {
    clave,
    etiqueta,
    tipo: esNumero || !u ? "numero" : "texto",
    unidad,
    original: u ? u.texto.split(" ")[0] : null,
    numero: esNumero ? n : null,
    hora: u?.en ?? null,
    ...extra,
  });
}

// Requisitos de estudio: van en "Imágenes y estudios" (no son campos).
const REQUISITO_ESTUDIO: Record<string, string[]> = {
  rx_torax: ["Rx_torax"],
  fibrobroncoscopia: ["Broncoscopia"],
  ecocardiograma: ["Ecocardiograma"],
  ecg: ["ECG"],
  coronariografia: ["Coronariografia"],
  ecografia_renal: ["Eco_renal", "Ecografia"],
  ecografia_abdominal: ["Eco_abdominal", "Ecografia", "TAC_abdomen"],
};

const LABS: Partial<Record<string, [string, string][]>> = {
  troponina_cpkmb: [["troponina", "Troponina"], ["cpk_mb", "CPK-MB"]],
  pam: [["pam", "PAM"]],
  sodio: [["na", "Sodio"]],
  hepatograma: [["tgo", "TGO"], ["tgp", "TGP"], ["bili_total", "Bilirrubina total"], ["bili_directa", "Bilirrubina directa"], ["fal", "FA"], ["ggt", "GGT"]],
  tp_kptt: [["tp", "TP"], ["kptt", "KPTT"]],
  amilasa_lipasa: [["amilasa", "Amilasa"], ["lipasa", "Lipasa"]],
  sedimento_proteinuria: [["sedimento", "Sedimento urinario"], ["proteinuria", "Proteinuria"]],
};

function camposRequisito(r: Requisito, d: Datos, ahora: number): Campo[] {
  const f = d.fuentes;
  if (r.tipo === "informativo") return [base(r, { clave: r.clave, etiqueta: r.etiqueta, original: r.nota ?? null, informativo: true })];
  if (r.tipo === "texto") return [base(r, { clave: r.clave, etiqueta: r.etiqueta })];
  if (r.tipo === "antecedentes") {
    const a = d.donante.antecedentes?.trim().replace(/\s*\n+\s*/g, " · ") || null;
    return [base(r, { clave: `${r.clave}`, etiqueta: r.etiqueta, original: a })];
  }
  const dato = r.dato!;
  if (LABS[dato]) return LABS[dato]!.map(([k, et]) => campoParametro(r, d, k, et, ahora));
  switch (dato) {
    case "pafi": {
      const g = pafiGasometria(f.lab as never, f.respirador, ahora);
      const pao2 = ultimo(d, "pao2", ahora);
      const fio2 = g.ok ? g.fio2 : (respiradorVigenteEn(f.respirador, Infinity)?.fio2 ?? null);
      const peep = g.ok ? g.peep : (respiradorVigenteEn(f.respirador, Infinity)?.peep ?? null);
      const nota = g.ok && g.minutosDespues !== null ? textoFio2Despues(g.minutosDespues) : null;
      return [
        base(r, { clave: "pao2", etiqueta: "PaO₂", tipo: "numero", unidad: "mmHg", original: pao2 ? num(Number(pao2.texto.split(" ")[0].replace(",", "."))) : null, numero: pao2 ? Number(pao2.texto.split(" ")[0].replace(",", ".")) : null, hora: pao2?.en ?? null }),
        base(r, { clave: "fio2", etiqueta: "FiO₂", tipo: "fio2", original: fio2 === null ? null : fio2Valida(fio2) ? textoFio2(fio2) : String(fio2).replace(".", ","), numero: fio2, nota, rango: RANGOS_A_VERIFICAR.fio2 }),
        base(r, { clave: "peep", etiqueta: "PEEP", tipo: "numero", unidad: "cmH₂O", original: peep === null ? null : num(peep), numero: peep }),
        base(r, { clave: "pafi", etiqueta: "PaO₂/FiO₂ (calculada)", tipo: "numero", calculo: "pafi", original: g.ok ? num(g.valor) : null, numero: g.ok ? g.valor : null, motivo: g.ok ? null : g.motivo, hora: g.ok ? g.medido_en : g.medido_en, rango: RANGOS_A_VERIFICAR.pafi }),
      ];
    }
    case "respirador": {
      const e = respiradorVigenteEn(f.respirador, Infinity);
      if (!e) return [base(r, { clave: r.clave, etiqueta: "Parámetros del respirador" })];
      const modo = e.modo ? (e.modo === "otro" ? e.modo_otro ?? "Otro" : MODOS_RESPIRADOR.find((m) => m.valor === e.modo)?.etiqueta ?? e.modo) : null;
      const partes = [modo, e.volumen_corriente !== null ? `VT ${num(e.volumen_corriente)}` : null, e.frecuencia !== null ? `FR ${num(e.frecuencia)}` : null, e.presion_plateau !== null ? `plateau ${num(e.presion_plateau)}` : null, e.presion_pico !== null ? `pico ${num(e.presion_pico)}` : null].filter(Boolean);
      return [base(r, { clave: r.clave, etiqueta: "Parámetros del respirador", original: partes.join(" · ") || null, hora: e.registrado_en })];
    }
    case "talla_perimetros": {
      const talla = d.donante.talla;
      return [
        base(r, { clave: "talla", etiqueta: "Talla", tipo: "numero", unidad: "cm", original: talla === null ? null : num(talla), numero: talla }),
        ...PERIMETROS_TORACICOS.map((k) => {
          const v = d.planillas.medidas[k];
          const n = v && v.trim() ? Number(v.replace(",", ".")) : null;
          const et = CAMPOS_PLANILLA.find((c) => c.key === k)?.label.replace(/^\d+\.\s*/, "") ?? k;
          return base(r, { clave: k, etiqueta: et, tipo: "numero", unidad: "cm", original: n === null || !Number.isFinite(n) ? null : num(n), numero: n });
        }),
      ];
    }
    case "peso_talla":
      return [
        base(r, { clave: "peso", etiqueta: "Peso", tipo: "numero", unidad: "kg", original: d.donante.peso === null ? null : num(d.donante.peso), numero: d.donante.peso }),
        base(r, { clave: "talla", etiqueta: "Talla", tipo: "numero", unidad: "cm", original: d.donante.talla === null ? null : num(d.donante.talla), numero: d.donante.talla }),
      ];
    case "creatinina_urea": {
      const cr = serie("creatinina", f, ahora);
      const evolucion = cr.length > 1 ? `evolución ${num(cr[0].valor, 2)} (${horaTexto(cr[0].en, ahora)}) → ${num(cr[cr.length - 1].valor, 2)}` : null;
      return [campoParametro(r, d, "creatinina", "Creatinina", ahora, { nota: evolucion }), campoParametro(r, d, "urea", "Urea", ahora)];
    }
    case "diuresis_balance":
      return [
        campoParametro(r, d, "diuresis_ml", "Diuresis (mL de la última fila)", ahora, { rango: RANGOS_A_VERIFICAR.diuresis_ml }),
        { ...campoParametro(r, d, "balance_acumulado", "Balance acumulado", ahora), calculo: "bloqueado" as const, tipo: "numero" as const },
      ];
    default: {
      // texto armado por el cruce (cultivos, vasoactivos, glucemias)
      const ev = evaluarRequisito(r, d, ahora);
      const sinEtiqueta = ev.linea ? ev.linea.replace(/^[^:]+:\s*/, "") : null;
      return [base(r, { clave: r.clave, etiqueta: r.etiqueta, original: ev.marca === "falta" ? null : sinEtiqueta, hora: ev.hora })];
    }
  }
}

export function camposOrgano(cfg: ConfigOrgano, d: Datos, ahora: number): CamposOrgano {
  const campos: Campo[] = [];
  const vistos = new Set<string>();
  const faltanEstudios: { clave: string; etiqueta: string }[] = [];
  for (const r of cfg.requisitos) {
    if (REQUISITO_ESTUDIO[r.clave]) {
      const hay = d.estudios.some((e) => REQUISITO_ESTUDIO[r.clave].includes(e.tipo_estudio));
      if (!hay) faltanEstudios.push({ clave: r.clave, etiqueta: r.etiqueta });
      continue;
    }
    for (const c of camposRequisito(r, d, ahora)) {
      if (vistos.has(c.clave)) continue; // p. ej. la talla, una sola vez
      vistos.add(c.clave);
      campos.push(c);
    }
  }
  const don = itemDonante(d);
  const qx = itemQuirofano(d, null, ahora);
  campos.unshift(base({ clave: "donante" }, { clave: "donante", etiqueta: "Datos del donante", seccion: "Donante", requisito: "donante", original: don.marca === "falta" ? null : don.linea }));
  campos.push(base({ clave: "quirofano" }, { clave: "quirofano", etiqueta: "Quirófano y anestesista", seccion: "Quirófano", requisito: "quirofano", original: qx.linea }));
  const estudios = [...d.estudios]
    .filter((e) => (ESTUDIOS_POR_ORGANO[e.tipo_estudio] ?? []).includes(cfg.clave))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((e) => ({ id: e.id, tipo: e.tipo_estudio, etiqueta: etiquetaEstudio(e.tipo_estudio), en: e.created_at, video: e.archivo_tipo === "video", url: e.archivo_url, descripcion: e.descripcion }));
  return { campos, estudios, faltanEstudios };
}

// ------------------------------------------------------------- ediciones
export type Edicion = { valor: string; numero: number | null; en: string; por: string };
export type Ediciones = Record<string, Edicion>;

// Validar lo que la Base escribe en un campo.
export function validarEdicion(c: Campo, texto: string): { ok: true; valor: string; numero: number | null } | { ok: false; error: string } {
  if (c.calculo) return { ok: false, error: c.calculo === "pafi" ? "Se calcula: editá la PaO₂ o la FiO₂." : "Se calcula a partir de los registros: no se edita en la ficha." };
  if (c.informativo) return { ok: false, error: "Es informativo: no se edita." };
  const t = texto.trim();
  if (!t) return { ok: false, error: "Escribí un valor." };
  if (c.tipo === "fio2") {
    const f = leerFio2(t);
    return f.ok ? { ok: true, valor: textoFio2(f.valor), numero: f.valor } : f;
  }
  if (c.tipo === "numero") {
    const n = Number(t.replace(",", "."));
    if (!/^-?\d+([.,]\d+)?$/.test(t) || !Number.isFinite(n)) return { ok: false, error: "Escribí un número (coma o punto decimal)." };
    return { ok: true, valor: t.replace(".", ","), numero: n };
  }
  if (t.length > MAX_TEXTO_FICHA) return { ok: false, error: `Máximo ${MAX_TEXTO_FICHA} caracteres.` };
  return { ok: true, valor: t, numero: null };
}

// Valor de cada campo con las ediciones aplicadas y los calculados
// recalculados.
export type ValorCampo = {
  campo: Campo;
  valor: string | null; // lo que se muestra / manda (null = sin dato)
  aVerificar: boolean;
  editado: { antes: string | null; en: string; por: string } | null;
  nota: string | null;
};

const fuera = (n: number | null, r: Campo["rango"]) => n !== null && r !== null && (n < r.min || n > r.max);

export function valoresCampos(campos: Campo[], ed: Ediciones): ValorCampo[] {
  const numDe = (clave: string) => {
    const c = campos.find((x) => x.clave === clave);
    if (!c) return null;
    return ed[clave] ? ed[clave].numero : c.numero;
  };
  return campos.map((c) => {
    const e = ed[c.clave];
    if (c.calculo === "pafi") {
      const pao2 = numDe("pao2");
      const fio2 = numDe("fio2");
      const tocado = !!(ed.pao2 || ed.fio2);
      if (!tocado) return { campo: c, valor: c.motivo ? null : c.original, aVerificar: fuera(c.numero, c.rango), editado: null, nota: c.motivo };
      if (pao2 === null || !(pao2 > 0)) return { campo: c, valor: null, aVerificar: false, editado: null, nota: "falta PaO₂" };
      if (fio2 === null) return { campo: c, valor: null, aVerificar: false, editado: null, nota: "FiO₂ no registrada para esta gasometría" };
      if (!fio2Valida(fio2)) return { campo: c, valor: null, aVerificar: false, editado: null, nota: "FiO₂ inválida (esperado 0,21–1)" };
      const v = pao2 / fio2;
      return { campo: c, valor: num(v), aVerificar: fuera(v, c.rango), editado: null, nota: `recalculada con ${[ed.pao2 ? "PaO₂" : null, ed.fio2 ? "FiO₂" : null].filter(Boolean).join(" y ")} editada` };
    }
    if (e) return { campo: c, valor: e.valor, aVerificar: c.tipo === "fio2" ? !fio2Valida(e.numero) : fuera(e.numero, c.rango), editado: { antes: c.original, en: e.en, por: e.por }, nota: c.clave === "fio2" ? null : c.nota };
    const invalidaFio2 = c.tipo === "fio2" && c.numero !== null && !fio2Valida(c.numero);
    return { campo: c, valor: c.original, aVerificar: invalidaFio2 || fuera(c.numero, c.rango), editado: null, nota: c.nota };
  });
}

// ------------------------------------------------------------- tildes
export type Tildes = Record<string, boolean>; // campos, "est:<id>" y "falta:<clave>"

export function tildesIniciales(co: CamposOrgano): Tildes {
  const t: Tildes = {};
  for (const c of co.campos) t[c.clave] = !c.informativo;
  for (const e of co.estudios) t[`est:${e.id}`] = true;
  for (const f of co.faltanEstudios) t[`falta:${f.clave}`] = true;
  return t;
}

// ------------------------------------------------------------- versiones
// Lo que se guarda de cada envío (ficha_envios) y se compara.
export type Instantanea = {
  valores: Record<string, { etiqueta: string; valor: string }>;
  estudios: Record<string, string>; // id -> etiqueta con fecha
};

export function instantanea(vs: ValorCampo[], co: CamposOrgano, t: Tildes, ahora: number): Instantanea {
  const valores: Instantanea["valores"] = {};
  for (const v of vs) {
    if (!t[v.campo.clave]) continue;
    valores[v.campo.clave] = { etiqueta: v.campo.etiqueta, valor: v.aVerificar ? A_VERIFICAR : (v.valor ?? "pendiente") };
  }
  const estudios: Instantanea["estudios"] = {};
  for (const e of co.estudios) if (t[`est:${e.id}`]) estudios[e.id] = `${e.etiqueta} · ${horaTexto(e.en, ahora)}`;
  return { valores, estudios };
}

export function diffFichas(antes: Instantanea, ahora: Instantanea): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(ahora.valores)) {
    const a = antes.valores[k];
    if (!a) out.push(`${v.etiqueta} agregado`);
    else if (a.valor !== v.valor) out.push(`${v.etiqueta} ${a.valor} → ${v.valor}`);
  }
  for (const [k, a] of Object.entries(antes.valores)) if (!ahora.valores[k]) out.push(`${a.etiqueta} quitado`);
  for (const [id, et] of Object.entries(ahora.estudios)) if (!antes.estudios[id]) out.push(`${et.split(" · ")[0]} agregada`);
  for (const [id, et] of Object.entries(antes.estudios)) if (!ahora.estudios[id]) out.push(`${et.split(" · ")[0]} quitada`);
  return out;
}

export type EnvioPrevio = { version: number; creado_en: string; anulado: boolean; valores: Instantanea["valores"]; incluye: { estudios?: Instantanea["estudios"] } | null };

// Versión de lo que se va a mandar: si no cambió nada respecto de la
// última, es la misma; si cambió, la siguiente (los números no se reusan).
export function versionPropuesta(envios: EnvioPrevio[], actual: Instantanea): { version: number; nueva: boolean; anterior: EnvioPrevio | null } {
  const vigentes = envios.filter((e) => !e.anulado).sort((a, b) => b.version - a.version);
  const max = envios.reduce((m, e) => Math.max(m, e.version), 0);
  const ultima = vigentes[0] ?? null;
  if (!ultima) return { version: max + 1, nueva: true, anterior: null };
  const igual = diffFichas({ valores: ultima.valores, estudios: ultima.incluye?.estudios ?? {} }, actual).length === 0;
  if (igual) return { version: ultima.version, nueva: false, anterior: vigentes[1] ?? null };
  return { version: max + 1, nueva: true, anterior: ultima };
}

// ------------------------------------------------------------- la ficha armada
// Solo lo necesario del donante: NUNCA nombre, DNI ni familia.
export type DonanteFicha = { pd_numero: string | null; folio_numero: string | null; id: string; es_prueba: boolean; edad: number | null; sexo: string | null };
export const donanteFicha = (d: { id: string; pd_numero: string | null; folio_numero: string | null; es_prueba?: boolean | null; edad: number | null; sexo: string | null }): DonanteFicha => ({
  id: d.id,
  pd_numero: d.pd_numero,
  folio_numero: d.folio_numero,
  es_prueba: d.es_prueba === true,
  edad: d.edad,
  sexo: d.sexo,
});

export type FilaFicha = { etiqueta: string; valor: string; editado: string | null; aVerificar: boolean; nota: string | null };
export type FichaArmada = {
  equipo: string;
  organo: string;
  pd: string;
  prueba: boolean;
  edadSexo: string | null;
  version: number;
  datosHasta: string | null;
  generado: string;
  secciones: { titulo: string; filas: FilaFicha[] }[];
  imagenes: (EstudioFicha & { enPdf: boolean; cuando: string })[];
  pendientes: string[];
  aVerificar: string[];
  cambios: { desde: number; en: string; lista: string[] } | null;
  pie: string[];
};

const p2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (t: number | string) => `${p2(new Date(t).getHours())}:${p2(new Date(t).getMinutes())}`;
const SEXO: Record<string, string> = { masculino: "M", femenino: "F" };
const ORDEN_SECCION = ["Donante", "Oxigenación", "Respirador", "Hemodinamia", "Laboratorio", "Función renal", "Medidas", "Antecedentes", "Cultivos", "Informativo", "Otros"];

export function armarFicha(a: {
  cfg: ConfigOrgano;
  nombreEquipo: string;
  donante: DonanteFicha;
  co: CamposOrgano;
  valores: ValorCampo[];
  tildes: Tildes;
  version: number;
  anterior: EnvioPrevio | null;
  instantaneaActual: Instantanea;
  ahora: number;
}): FichaArmada {
  const { donante: d, ahora } = a;
  const pd = d.pd_numero ? `PD ${d.pd_numero}` : d.folio_numero ? `Folio ${d.folio_numero}` : `Donante ${d.id.slice(0, 8)}`;
  const secciones = new Map<string, FilaFicha[]>();
  const pendientes: string[] = [];
  const aVerificar: string[] = [];
  let hasta: string | null = null;
  let quirofano: string | null = null;
  for (const v of a.valores) {
    const c = v.campo;
    if (!a.tildes[c.clave]) continue;
    if (c.clave === "quirofano") {
      if (v.valor) quirofano = v.valor;
      else pendientes.push(c.etiqueta);
      continue;
    }
    if (v.aVerificar) {
      aVerificar.push(c.etiqueta);
      continue;
    }
    if (v.valor === null) {
      // un calculado que no se pudo calcular dice el motivo (nunca un número)
      if (c.calculo === "pafi" && v.nota) {
        const filas = secciones.get(c.seccion) ?? [];
        filas.push({ etiqueta: c.etiqueta, valor: v.nota, editado: null, aVerificar: false, nota: null });
        secciones.set(c.seccion, filas);
      } else pendientes.push(c.etiqueta);
      continue;
    }
    if (c.hora && (!hasta || c.hora > hasta)) hasta = c.hora;
    const filas = secciones.get(c.seccion) ?? [];
    filas.push({
      etiqueta: c.etiqueta,
      valor: `${v.valor}${c.unidad ? ` ${c.unidad}` : ""}`,
      editado: v.editado ? `† editado por Base ${hhmm(v.editado.en)} (versión anterior: ${v.editado.antes ?? "sin dato"})` : null,
      aVerificar: false,
      nota: v.nota,
    });
    secciones.set(c.seccion, filas);
  }
  for (const f of a.co.faltanEstudios) if (a.tildes[`falta:${f.clave}`]) pendientes.push(f.etiqueta);
  const imagenes = a.co.estudios.filter((e) => a.tildes[`est:${e.id}`]).map((e) => ({ ...e, enPdf: !e.video, cuando: horaTexto(e.en, ahora) }));
  const cambios = a.anterior
    ? { desde: a.anterior.version, en: horaTexto(a.anterior.creado_en, ahora), lista: diffFichas({ valores: a.anterior.valores, estudios: a.anterior.incluye?.estudios ?? {} }, a.instantaneaActual) }
    : null;
  return {
    equipo: a.nombreEquipo,
    organo: a.cfg.etiqueta,
    pd,
    prueba: d.es_prueba,
    edadSexo: [d.edad !== null ? `${d.edad} años` : null, d.sexo ? SEXO[d.sexo] ?? d.sexo : null].filter(Boolean).join(" · ") || null,
    version: a.version,
    datosHasta: hasta ? horaTexto(hasta, ahora) : null,
    generado: horaTexto(ahora, ahora),
    secciones: [...secciones.entries()].sort((x, y) => ORDEN_SECCION.indexOf(x[0]) - ORDEN_SECCION.indexOf(y[0])).map(([titulo, filas]) => ({ titulo, filas })),
    imagenes,
    pendientes,
    aVerificar,
    cambios: cambios && cambios.lista.length ? cambios : null,
    pie: [quirofano ? quirofano : null, CIERRE_FICHA, SIN_IDENTIDAD].filter((x): x is string => !!x),
  };
}

// Texto plano de la ficha ("Copiar texto").
export function textoFicha(f: FichaArmada): string {
  const out = [`*${f.prueba ? "PRUEBA · " : ""}${f.pd} · Ficha ${f.equipo} · versión ${f.version}*`, [f.datosHasta ? `Datos hasta ${f.datosHasta}` : null, `Generado ${f.generado}`].filter(Boolean).join(" · ")];
  if (f.edadSexo) out.push(f.edadSexo);
  for (const s of f.secciones) {
    out.push("", `*${s.titulo}*`);
    for (const r of s.filas) out.push(`• ${r.etiqueta}: ${r.valor}${r.nota ? ` (${r.nota})` : ""}${r.editado ? ` ${r.editado}` : ""}`);
  }
  if (f.imagenes.length) {
    out.push("", "*Imágenes y estudios*");
    for (const i of f.imagenes) out.push(`• ${i.etiqueta} · ${i.cuando}${i.video ? " · video: enlace disponible al enviar" : ""}`);
  }
  if (f.pendientes.length) out.push("", "*Pendiente*", ...f.pendientes.map((p) => `• ${p}`));
  if (f.aVerificar.length) out.push("", "*A verificar* (no se envía el valor)", ...f.aVerificar.map((p) => `• ${p}`));
  if (f.cambios) out.push("", `*Cambios respecto de la versión ${f.cambios.desde} (${f.cambios.en})*`, f.cambios.lista.join(" · "));
  out.push("", ...f.pie);
  return out.join("\n");
}

// ------------------------------------------------------------- línea de tiempo
export function lineaEdicionFicha(organo: string, c: Pick<Campo, "etiqueta">, antes: string | null, despues: string, quien: string, ahora: number): string {
  return lineaConAutor(quien, `editó en la ficha de ${organo}: ${c.etiqueta} ${antes ?? "sin dato"} → ${despues} (el registro clínico no cambia) (${hhmm(ahora)})`);
}

export type AccionFicha = "descargó" | "copió el texto de";
export function lineaAccionFicha(accion: AccionFicha, f: FichaArmada, adjuntos: number, editados: string[], quien: string, ahora: number): string {
  return lineaConAutor(quien, `${accion} la ficha v${f.version} de ${f.organo} para ${f.equipo} · ${adjuntos} ${adjuntos === 1 ? "imagen" : "imágenes"}${editados.length ? ` · editados: ${editados.join(", ")}` : ""} (${hhmm(ahora)})`);
}
export const lineaDescargaFicha = (f: FichaArmada, adjuntos: number, editados: string[], quien: string, ahora: number) => lineaAccionFicha("descargó", f, adjuntos, editados, quien, ahora);

export const editadosTexto = (vs: ValorCampo[]) => vs.filter((v) => v.editado).map((v) => `${v.campo.etiqueta} ${v.editado!.antes ?? "sin dato"} → ${v.valor}`);

export type { FichaOrgano };
