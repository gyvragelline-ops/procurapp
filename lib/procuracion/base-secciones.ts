// Base operativa · secciones del Expediente con sus acciones (revisada,
// copiar, compartir, ver ordenado). Lógica pura, con tests: qué contiene
// cada sección, el texto para WhatsApp y los textos de la línea de tiempo.
//
// Reglas:
// - El texto NUNCA lleva nombre ni DNI (se identifica por PD / folio).
// - "Datos hasta HH:MM" solo donde hay hora real del último dato
//   (Mantenimiento, Laboratorios); en el resto "Generado HH:MM".
// - Sin compartir: foto del DNI y datos de la familia. Comunicación de
//   donación se comparte solo como "Hecha: sí/no".

import type { ExpedienteDatos } from "./base-armado.ts";
import { bombasDeFila, concentracion, dilucionVigenteEn, dosisDesdeVelocidad } from "./mantenimiento-calculos.ts";
import { DROGAS_INFUSION, type DrogaInfusion } from "./mantenimiento-metas.ts";
import { SISTEMAS, filaParametro, textoValor } from "./base-expediente.ts";
import { metodosAuxiliares, medidas, muestrasPorPaquete, neurologico, cierreCertificado, familiarDeContacto, textoAntecedentes } from "./base-expediente-etapas.ts";
import { TIPOS_CULTIVO } from "./cultivos-calculos.ts";
import { antibioticosVigentes } from "./antibioticos-calculos.ts";
import { ORGANOS_EQUIPO, horaVigente, ANESTESISTA } from "./quirofano-calculos.ts";
import { TIPOS_ESTUDIO_INFO } from "./estudios-imagenes-tipos.ts";
import { comunicadaEn } from "./comunicacion-hora.ts";

// Lo que no tiene dato real se muestra así (nunca un valor inventado).
export const SIN_CARGAR = "Sin cargar";

// ------------------------------------------------------------- tipos
export type FilaSeccion = { etiqueta: string; valor: string; detalle?: string | null };
export type GrupoSeccion = { titulo: string | null; filas: FilaSeccion[] };
export type ImagenSeccion = { id: string; etiqueta: string; url: string | null; video: boolean; en: string; compartible: boolean };

export type ContenidoSeccion = {
  clave: string; // misma clave que la marca de revisión (base_revisiones.seccion)
  numero: string;
  titulo: string;
  grupos: GrupoSeccion[]; // lo que se ve, se copia y se comparte
  soloBase: GrupoSeccion[]; // se ve en la Base, NUNCA se copia ni se comparte
  imagenes: ImagenSeccion[];
  datosHasta: string | null; // ISO del último dato real; null -> "Generado"
  acciones: { copiar: boolean; compartir: boolean };
  vacio: string | null; // texto si no hay nada completado
};

// ------------------------------------------------------------- formatos
const p2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (iso: string | number) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const ddmm = (iso: string | number) => {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
};
const mismoDia = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
// "14:20" si es de hoy; "09/10 22:10" si no.
export const horaTexto = (iso: string | number, ahora: number) => (mismoDia(new Date(iso).getTime(), ahora) ? hhmm(iso) : `${ddmm(iso)} ${hhmm(iso)}`);
const fechaHora = (iso: string) => `${ddmm(iso)} ${hhmm(iso)}`;
const fechaSola = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const lleno = (x: string | null | undefined): x is string => !!x && x.trim() !== "";

// Identificación para compartir: PD; si no hay, folio; nunca nombre ni DNI.
export function identificacionCorta(d: { id: string; pd_numero: string | null; folio_numero: string | null }): string {
  if (lleno(d.pd_numero)) return `PD ${d.pd_numero}`;
  if (lleno(d.folio_numero)) return `Folio ${d.folio_numero}`;
  return `Donante ${d.id.slice(0, 8)}`;
}

// ------------------------------------------------------- texto y línea
export function encabezado(c: Pick<ContenidoSeccion, "numero" | "titulo" | "datosHasta">, ident: string, ahora: number): string {
  const hora = c.datosHasta ? `Datos hasta ${horaTexto(c.datosHasta, ahora)}` : `Generado ${horaTexto(ahora, ahora)}`;
  return `*${ident} · ${c.numero} ${c.titulo} · ${hora}*`;
}

// Texto para WhatsApp: *negritas* con asteriscos. Lo de soloBase no entra.
export function textoWhatsApp(c: ContenidoSeccion, ident: string, ahora: number): string {
  const lineas = [encabezado(c, ident, ahora)];
  for (const g of c.grupos) {
    if (!g.filas.length) continue;
    lineas.push("");
    if (g.titulo) lineas.push(`*${g.titulo}*`);
    for (const f of g.filas) lineas.push(`*${f.etiqueta}:* ${f.valor}${f.detalle ? ` (${f.detalle})` : ""}`);
  }
  const imgs = c.imagenes.filter((i) => i.compartible);
  if (imgs.length) {
    lineas.push("", "*Imágenes*");
    for (const i of imgs) lineas.push(`${i.etiqueta} · ${fechaHora(i.en)}`);
  }
  if (lineas.length === 1 && c.vacio) lineas.push("", c.vacio);
  return lineas.join("\n");
}

export type AccionLinea = "copió" | "compartió" | "marcó revisada" | "quitó la marca de revisada";
export function textoLineaAccion(accion: AccionLinea, c: Pick<ContenidoSeccion, "numero" | "titulo">, quien: string, ahora: number, extra?: string): string {
  return `Base · ${quien.trim() || "sin nombre"} · ${accion} ${c.numero} ${c.titulo}${extra ? `: ${extra}` : ""} (${hhmm(ahora)})`;
}

// ------------------------------------------------------------ secciones
const base = (clave: string, numero: string, titulo: string, extra: Partial<ContenidoSeccion> = {}): ContenidoSeccion => ({
  clave,
  numero,
  titulo,
  grupos: [],
  soloBase: [],
  imagenes: [],
  datosHasta: null,
  acciones: { copiar: true, compartir: true },
  vacio: null,
  ...extra,
});
const fila = (etiqueta: string, valor: string | null | undefined, detalle?: string | null): FilaSeccion | null => (lleno(valor) ? { etiqueta, valor, detalle: detalle ?? null } : null);
const filas = (xs: (FilaSeccion | null)[]) => xs.filter((x): x is FilaSeccion => x !== null);

// 01
export function seccionPotencial(d: ExpedienteDatos, numero: string): ContenidoSeccion {
  const x = d.donante;
  const fotos = d.fotosDocumentacion
    .filter((f) => f.tipo === "dni" || f.tipo === "grupo_factor")
    // orden fijo: DNI y después grupo y factor; dentro de cada una, la más nueva primero
    .sort((a, b) => (a.tipo === b.tipo ? b.created_at.localeCompare(a.created_at) : a.tipo === "dni" ? -1 : 1))
    .map((f, i) => ({
      id: `${f.tipo}-${i}`,
      etiqueta: f.tipo === "dni" ? "Foto del DNI" : "Foto de grupo y factor",
      url: f.archivo_url,
      video: false,
      en: f.created_at,
      compartible: f.tipo !== "dni", // la foto del DNI solo se ve
    }));
  return base("potencial", numero, "Potencial donante", {
    grupos: [
      {
        titulo: null,
        filas: [
          { etiqueta: "Edad", valor: x.edad !== null ? `${x.edad} años` : SIN_CARGAR },
          { etiqueta: "Servicio", valor: x.servicio ?? SIN_CARGAR },
          { etiqueta: "Cama", valor: (x as { cama?: string | null }).cama ?? SIN_CARGAR },
          { etiqueta: "Antecedentes", valor: textoAntecedentes(x.antecedentes) },
          { etiqueta: "Fecha de nacimiento", valor: fechaSola((x as { fecha_nacimiento?: string | null }).fecha_nacimiento ?? null) ?? SIN_CARGAR },
          { etiqueta: "Fecha de ingreso", valor: x.fecha_ingreso ? `${fechaSola(x.fecha_ingreso)} ${hhmm(x.fecha_ingreso)}` : SIN_CARGAR },
        ],
      },
    ],
    imagenes: fotos,
  });
}

// 02: solo lo completado.
export function seccionNeurologico(d: ExpedienteDatos, numero: string): ContenidoSeccion {
  const n = neurologico(d.planillas.neuro);
  const c = cierreCertificado(d.planillas.certificado);
  const evaluacion = (i: 0 | 1) => {
    const partes = [n.fechaExamen, n.evaluaciones[i].hora].filter(lleno);
    return partes.length ? partes.join(" ") : null;
  };
  const t = n.test;
  const test =
    t.tipo === "apnea"
      ? [t.apnea.pco2Inicial && `CO2 inicial ${t.apnea.pco2Inicial} mmHg`, t.apnea.pco2Final && `CO2 final ${t.apnea.pco2Final} mmHg`, t.apnea.duracion && `duración ${t.apnea.duracion}`, t.apnea.resultado && `resultado ${t.apnea.resultado}`].filter(Boolean).join(" · ")
      : t.tipo === "atropina"
        ? [t.atropina.fcInicial && `FC inicial ${t.atropina.fcInicial} lpm`, t.atropina.fcFinal && `FC final ${t.atropina.fcFinal} lpm`, [t.atropina.fecha, t.atropina.hora].filter(Boolean).join(" "), t.atropina.duracion && `duración ${t.atropina.duracion}`].filter(Boolean).join(" · ")
        : null;
  const g = filas([
    fila("1ª evaluación", evaluacion(0)),
    fila("2ª evaluación", evaluacion(1)),
    t.tipo ? fila(t.tipo === "apnea" ? "Test de apnea" : "Test de atropina", test || "elegido, sin resultados") : null,
    fila("Causa del coma", n.causaComa),
    fila("En ARM desde", n.armDesde),
    fila("Estudio complementario", n.estudiosComplementarios),
    fila("Médico de la institución", c.medico1),
    fila("Neurólogo", c.medico2),
  ]);
  return base("me", numero, "Certificación de muerte: examen neurológico", {
    grupos: [{ titulo: null, filas: g }],
    vacio: g.length ? null : "Sin datos completados.",
  });
}

// 03: solo el método elegido (los que están "Completo").
export function seccionMetodos(d: ExpedienteDatos, numero: string): ContenidoSeccion {
  const m = metodosAuxiliares(d.certAux, d.planillas.neuro, d.planillas.doppler).filter((x) => x.estado === "Completo");
  const grupos = m.map((x) => ({
    titulo: x.etiqueta,
    filas: filas([
      fila("Método auxiliar", x.etiqueta),
      fila("Fecha y hora", [x.fecha, x.hora].filter(Boolean).join(" ") || null),
      fila("Informe", x.informe),
      ...x.extra.map((e) => fila(e.etiqueta, e.valor)),
    ]),
  }));
  return base("certificacion", numero, "Certificación de muerte: método auxiliar", { grupos, vacio: m.length ? null : "Sin método auxiliar completo." });
}

// 04 y 05: "Hecha: Sí" SOLO con un registro real ("Realizada", con su fecha y
// hora). Si la etapa está marcada completa a mano sin ese registro, se dice.
export const SIN_DATOS_COMUNICACION = "Marcada completa por el procurador (sin datos cargados)";
export function hechaComunicacion(d: Pick<ExpedienteDatos, "comunicaciones" | "insumos">, cual: "comMuerte" | "comDonacion"): FilaSeccion {
  const reg = d.comunicaciones?.[cual] ?? null;
  if (reg?.estado === "si") {
    const c = comunicadaEn(reg.meta);
    if (c) return { etiqueta: "Hecha", valor: "Sí", detalle: `comunicada ${fechaHora(c)}` };
    // registros anteriores al campo de fecha y hora de la comunicación
    if (reg.updated_at) return { etiqueta: "Hecha", valor: "Sí", detalle: `registrada ${fechaHora(reg.updated_at)} (sin hora de la comunicación)` };
  }
  if (d.insumos.etapas.marcas[cual]?.marca === "completo") return { etiqueta: "Hecha", valor: SIN_DATOS_COMUNICACION, detalle: null };
  return { etiqueta: "Hecha", valor: "No", detalle: null };
}

export function seccionComunicacion(d: ExpedienteDatos, numero: string, cual: "comMuerte" | "comDonacion"): ContenidoSeccion {
  const titulo = cual === "comMuerte" ? "Comunicación de muerte" : "Comunicación de donación";
  const familia = cual === "comDonacion" ? [{ titulo: "Familiar de contacto", filas: familiarDeContacto(d.familiar).map((f) => ({ etiqueta: f.etiqueta, valor: f.valor ?? SIN_CARGAR })) }] : [];
  return base(cual, numero, titulo, { grupos: [{ titulo: null, filas: [hechaComunicacion(d, cual)] }], soloBase: familia });
}

// 06
export function seccionMuestras(d: ExpedienteDatos, numero: string): ContenidoSeccion {
  const m = muestrasPorPaquete(d.muestras);
  return base("muestras", numero, "Muestras", {
    grupos: [{ titulo: null, filas: m.map((x) => ({ etiqueta: x.nombre, valor: x.estado === "Obtenida" ? "Tomada" : x.estado === "Pendiente" ? "No tomada" : x.estado })) }],
    vacio: m.length ? null : "Sin paquetes de muestra cargados.",
  });
}

// 07
export function seccionMedidas(d: ExpedienteDatos, numero: string): ContenidoSeccion {
  return base("medidas", numero, "Medidas antropométricas", {
    grupos: [{ titulo: null, filas: medidas(d.planillas.medidas, d.donante.talla, d.donante.peso).map((x) => ({ etiqueta: x.etiqueta, valor: x.valor ?? SIN_CARGAR })) }],
  });
}

// 08 laboratorios, por sistema (último valor con su unidad y su hora)
export const LAB_POR_SISTEMA: { titulo: string; claves: string[] }[] = [
  { titulo: "Hemodinámico", claves: ["troponina", "cpk_mb"] },
  { titulo: "Respiratorio", claves: ["ph", "pao2", "pafi"] },
  { titulo: "Renal", claves: ["urea", "creatinina", "osm_serica", "osm_urinaria", "densidad_urinaria", "sedimento"] },
  { titulo: "Metabólico", claves: ["na", "k", "glucemia", "amilasa"] },
  { titulo: "Hepático y hematológico", claves: ["tgo", "tgp", "bili_total", "bili_directa", "fal", "ggt", "tp", "rin", "kptt", "fibrinogeno", "hb", "hto", "gb", "plaquetas"] },
];
const PARAMETROS = new Map(SISTEMAS.flatMap((s) => s.parametros.map((x) => [x.clave, x] as const)));

export function seccionLaboratorios(d: ExpedienteDatos, numero: string, ahora: number): ContenidoSeccion {
  let ultimo: string | null = null;
  const grupos = LAB_POR_SISTEMA.map((s) => ({
    titulo: s.titulo,
    filas: s.claves.flatMap((k) => {
      const par = PARAMETROS.get(k);
      if (!par) return [];
      const f = filaParametro(par, { ...d.fuentes, registros: [], mediciones: [] }, ahora); // solo laboratorio
      if (!f.ultimo) return [];
      if (!ultimo || f.ultimo.en > ultimo) ultimo = f.ultimo.en;
      return [{ etiqueta: par.etiqueta, valor: `${textoValor(f.ultimo.valor, par.decimales)}${f.unidad ? ` ${f.unidad}` : ""}`, detalle: horaTexto(f.ultimo.en, ahora) }];
    }),
  })).filter((g) => g.filas.length);
  return base("laboratorios", numero, "Laboratorios", { grupos, datosHasta: ultimo, vacio: grupos.length ? null : "Sin laboratorios cargados." });
}

// 08 imágenes, por tipo y por fecha
export function seccionImagenes(d: ExpedienteDatos, numero: string): ContenidoSeccion {
  const orden = (t: string) => TIPOS_ESTUDIO_INFO.findIndex((x) => x.valor === t);
  const imagenes = [...d.estudios]
    .sort((a, b) => orden(a.tipo_estudio) - orden(b.tipo_estudio) || b.created_at.localeCompare(a.created_at))
    .map((e) => ({
      id: e.id,
      etiqueta: `${TIPOS_ESTUDIO_INFO.find((x) => x.valor === e.tipo_estudio)?.etiqueta ?? e.tipo_estudio}${e.descripcion ? ` — ${e.descripcion}` : ""}`,
      url: e.archivo_url,
      video: e.archivo_tipo === "video",
      en: e.created_at,
      compartible: true,
    }));
  return base("imagenes", numero, "Imágenes y estudios", { imagenes, vacio: imagenes.length ? null : "Sin imágenes cargadas." });
}

// 09
export function seccionCultivos(d: ExpedienteDatos, numero: string): ContenidoSeccion {
  const cultivos = d.cultivos
    .filter((c) => !c.anulado)
    .sort((a, b) => b.tomado_en.localeCompare(a.tomado_en))
    .map((c) => ({
      etiqueta: c.tipo === "otro" ? c.tipo_otro ?? "Otro" : TIPOS_CULTIVO.find((t) => t.valor === c.tipo)?.etiqueta ?? c.tipo,
      valor: c.estado === "pendiente" ? "Pendiente" : c.estado === "positivo" ? "Positivo" : "Negativo",
      detalle: [`toma ${fechaHora(c.tomado_en)}`, c.germen ? `rescate: ${c.germen}` : null, c.sensibilidad ? `sensibilidad: ${c.sensibilidad}` : null].filter(Boolean).join(" · "),
    }));
  const abs = antibioticosVigentes(d.antibioticos ?? []).map((a) => ({ etiqueta: a.antibiotico, valor: `desde ${fechaHora(a.desde)}`, detalle: a.foco ? `foco: ${a.foco}` : null }));
  return base("cultivos", numero, "Cultivos y antibióticos", {
    grupos: [
      { titulo: "Cultivos", filas: cultivos.length ? cultivos : [{ etiqueta: "Cultivos", valor: "Sin cultivos cargados" }] },
      { titulo: "Antibióticos", filas: abs.length ? abs : [{ etiqueta: "Antibióticos", valor: d.antibioticos === null ? "Sin datos" : "Sin antibióticos cargados" }] },
    ],
  });
}

// 10: solo la marca de revisada
export function seccionDocumentacion(numero: string): ContenidoSeccion {
  return base("documentacion", numero, "Documentación", { acciones: { copiar: false, compartir: false }, vacio: "Formularios para imprimir y adjuntar a la historia clínica (desde la pantalla del procurador)." });
}

// 11 Mantenimiento en vivo: grilla hora a hora (hoja de enfermería)
const VASOACTIVAS: DrogaInfusion[] = ["noradrenalina", "adrenalina", "dopamina", "dobutamina", "vasopresina"];
export type FilaGrilla = {
  en: string;
  tam: number | null;
  fc: number | null;
  temperatura: number | null;
  sat: number | null;
  diuresis: number | null;
  glucemia: number | null;
  drogas: { droga: string; dosis: number | null; unidad: string; mlh: number }[];
};

export function grillaMantenimiento(d: ExpedienteDatos, ahora: number, horas = 12): FilaGrilla[] {
  const desde = ahora - horas * 3_600_000;
  const f = d.fuentes;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return f.registros
    .filter((r) => !r.anulado && new Date(r.registrado_en).getTime() > desde && new Date(r.registrado_en).getTime() <= ahora)
    .sort((a, b) => a.registrado_en.localeCompare(b.registrado_en))
    .map((r) => {
      const t = new Date(r.registrado_en).getTime();
      const glu = f.lab.filter((x) => !x.anulado && x.parametro === "glucemia" && Math.abs(new Date(x.medido_en).getTime() - t) <= 30 * 60_000);
      // bombas de ESTA fila (no la vigente de ahora): velocidad de esa hora y la dilución vigente en ese momento
      const deFila = bombasDeFila(f.bombas, r.id);
      return {
        en: r.registrado_en,
        tam: num((r as Record<string, unknown>).pam),
        fc: num((r as Record<string, unknown>).fc),
        temperatura: num(r.temperatura),
        sat: num((r as Record<string, unknown>).sat_o2),
        diuresis: num(r.diuresis_ml),
        glucemia: glu.length ? glu[glu.length - 1].valor : null,
        drogas: VASOACTIVAS.flatMap((dr) => {
          const bomba = deFila.find((x) => x.droga === dr && x.velocidad_ml_h > 0);
          if (!bomba) return [];
          const dil = dilucionVigenteEn(f.infusiones, dr, t);
          const conc = dil ? concentracion(dr, dil.dilucion) : null;
          const dosis = conc && conc.ok ? dosisDesdeVelocidad(dr, bomba.velocidad_ml_h, conc.valor, f.pesoKg) : null;
          return [{ droga: DROGAS_INFUSION[dr].etiqueta, dosis: dosis && dosis.ok ? dosis.dosis : null, unidad: dosis && dosis.ok ? dosis.unidad : "mL/h", mlh: bomba.velocidad_ml_h }];
        }),
      };
    });
}

export function seccionMantenimiento(d: ExpedienteDatos, numero: string, ahora: number): ContenidoSeccion {
  const g = grillaMantenimiento(d, ahora);
  const u = g[g.length - 1];
  const sist = (clave: string) => {
    const par = PARAMETROS.get(clave);
    if (!par) return null;
    const f = filaParametro(par, d.fuentes, ahora);
    return f.ultimo ? fila(par.etiqueta, `${textoValor(f.ultimo.valor, par.decimales)}${f.unidad ? ` ${f.unidad}` : ""}`, horaTexto(f.ultimo.en, ahora)) : null;
  };
  const drogas = VASOACTIVAS.flatMap((dr) => {
    const f = filaParametro(PARAMETROS.get(`droga:${dr}`)!, d.fuentes, ahora);
    return f.ultimo ? [{ etiqueta: DROGAS_INFUSION[dr].etiqueta, valor: `${textoValor(f.ultimo.valor, 2)} ${f.unidad ?? ""}`.trim(), detalle: f.nota }] : [];
  });
  const resumen = filas([sist("pam"), sist("fc"), sist("temperatura"), sist("sat_o2"), sist("diuresis_ml"), sist("glucemia"), sist("balance_acumulado")]);
  return base("mantenimiento", numero, "Mantenimiento", {
    grupos: [
      { titulo: "Últimos valores", filas: resumen },
      { titulo: "Vasoactivos", filas: drogas.length ? drogas : [{ etiqueta: "Vasoactivos", valor: "ninguno en curso" }] },
    ],
    datosHasta: u?.en ?? null,
    vacio: g.length ? null : "Sin registros de enfermería en las últimas 12 h.",
  });
}

// 12 Intervención judicial
export type MarcaJudicial = { id: string; autorizado: boolean; marcado_por: string | null; marcado_en: string; anulado: boolean };
export const autorizacionVigente = (xs: MarcaJudicial[]) => [...xs].filter((x) => !x.anulado).sort((a, b) => b.marcado_en.localeCompare(a.marcado_en))[0] ?? null;

export function seccionJudicial(d: ExpedienteDatos, numero: string, ahora: number): ContenidoSeccion {
  const a = autorizacionVigente(d.autorizacionJudicial ?? []);
  const fotos = d.fotosJudiciales
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .map((f, i) => ({
      id: `${f.tipo}-${i}`,
      etiqueta: f.tipo === "precario" ? "Foto del precario" : "Autorización del juez",
      url: (f as { archivo_url?: string | null }).archivo_url ?? null,
      video: false,
      en: f.created_at,
      compartible: true,
    }));
  return base("judicial", numero, "Intervención judicial", {
    grupos: [{ titulo: null, filas: [{ etiqueta: "Autorizado", valor: a ? (a.autorizado ? "Sí" : "No") : "Sin marcar", detalle: a ? `${a.marcado_por ?? "Base"} · ${horaTexto(a.marcado_en, ahora)}` : null }] }],
    imagenes: fotos,
  });
}

// 13 Órganos aceptados / quirófano
export type MarcaOrgano = { id: string; organo: string; aceptado: boolean; equipo_id: string | null; marcado_por: string | null; marcado_en: string; anulado: boolean };
export function organosVigentes(xs: MarcaOrgano[]): Map<string, MarcaOrgano> {
  const m = new Map<string, MarcaOrgano>();
  for (const x of [...xs].filter((x) => !x.anulado).sort((a, b) => a.marcado_en.localeCompare(b.marcado_en))) m.set(x.organo, x);
  return m;
}
export const ORGANOS_BASE = ORGANOS_EQUIPO.filter((o) => o.valor !== "otro");

export function seccionQuirofano(d: ExpedienteDatos, numero: string, ahora: number): ContenidoSeccion {
  const h = horaVigente(d.insumos.etapas.horariosQx);
  const marcas = organosVigentes(d.organosAceptados ?? []);
  const equipoDe = (id: string | null) => d.equipos.find((e) => e.id === id)?.equipo ?? null;
  const organos = ORGANOS_BASE.flatMap((o) => {
    const m = marcas.get(o.valor);
    return m ? [{ etiqueta: o.etiqueta, valor: m.aceptado ? "Aceptado" : "No aceptado", detalle: [equipoDe(m.equipo_id), `${m.marcado_por ?? "Base"} ${horaTexto(m.marcado_en, ahora)}`].filter(Boolean).join(" · ") }] : [];
  });
  const equipos = d.equipos
    .filter((e) => !e.anulado)
    .map((e) => ({
      etiqueta: e.equipo,
      valor: e.organos.map((o) => (o === "otro" ? e.organo_otro ?? "Otro" : ORGANOS_EQUIPO.find((x) => x.valor === o)?.etiqueta ?? o)).join(", "),
      detalle: `anestesista: ${ANESTESISTA.find((a) => a.valor === e.anestesista)?.etiqueta.toLowerCase() ?? e.anestesista} · avisó ${horaTexto(e.creado_en, ahora)}`,
    }));
  return base("quirofano", numero, "Órganos aceptados y quirófano", {
    grupos: [
      { titulo: null, filas: [{ etiqueta: "Hora de quirófano", valor: h ? fechaHora(h.hora) : "Sin definir" }] },
      { titulo: "Órganos", filas: organos.length ? organos : [{ etiqueta: "Órganos", valor: "Ninguno marcado" }] },
      { titulo: "Equipos avisados", filas: equipos.length ? equipos : [{ etiqueta: "Equipos", valor: "Ninguno" }] },
    ],
  });
}

// Revisión de la Base por sección (vigente = la última no anulada).
export type Revision = { id: string; seccion: string; revisado_por: string | null; revisado_en: string; anulado: boolean };
export function revisionesVigentes(xs: Revision[]): Map<string, Revision> {
  const m = new Map<string, Revision>();
  for (const x of [...xs].filter((x) => !x.anulado).sort((a, b) => a.revisado_en.localeCompare(b.revisado_en))) m.set(x.seccion, x);
  return m;
}
