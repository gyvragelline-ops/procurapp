// Base operativa · Tablero: lógica pura, con tests. Todo se muestra en
// crudo: los textos de "falta o bloquea" salen de los pendientes reales,
// no se interpreta la aptitud de ningún órgano.
//
// ATENCIÓN: la Base muestra datos de varios donantes y hoy no hay login
// ni RLS. NO usar con donantes reales hasta tener autenticación por rol.

import { REFLEJOS_ME, METODOS_CERT_AUX, reflejoKey, type EstadoEtapa } from "./constants.ts";
import { estadoCalculadoEtapa, estadoEtapa, etapasVisibles, type DatosEtapas } from "./estado-etapas.ts";
import { primeraNoCompleta } from "./marca-etapa.ts";
import { ORGANOS_EQUIPO, horaVigente } from "./quirofano-calculos.ts";
import { esAbierta, minutosDesde, sinRespuesta, urgenteVencida, type Solicitud } from "./base-solicitudes.ts";

// Umbrales operativos (no clínicos).
export const MIN_DATO_VERDE = 60; // último dato de Mantenimiento: verde por debajo
export const MIN_DATO_ROJO = 120; // rojo por encima (bloquea)
export const MIN_MANTENIMIENTO_NO_INICIADO = 120; // aviso ámbar si nunca hubo dato
export const HORAS_QX_ATRAS = 2;
export const HORAS_QX_ADELANTE = 24;

const HORA = 3_600_000;

export type DonanteTablero = {
  id: string;
  pd_numero: string | null;
  folio_numero: string | null;
  nombre_completo: string | null;
  edad: number | null;
  sexo: string | null;
  peso: number | null;
  institucion: string | null;
  localidad: string | null;
  estado_general: string | null;
  tipo_procuracion: "multiorganico" | "corneas" | null;
  created_at: string;
  procurador_nombre?: string | null;
};

export type EquipoTablero = { equipo: string; organos: string[]; organo_otro: string | null; anulado: boolean };

export type InsumosTablero = {
  donante: DonanteTablero;
  etapas: DatosEtapas;
  // registrado_en de cada dato de Mantenimiento NO anulado: filas de
  // enfermería, mediciones del médico y cambios de respirador (sin lab).
  momentosMantenimiento: string[];
  solicitudes: Solicitud[];
  equipos: EquipoTablero[];
};

// ---------------------------------------------------------------- donante
// Activo: estado_general 'activo' (o vacío en filas viejas; el default es
// 'activo'). Cerrado: 'cerrado'.
export const esActivo = (d: Pick<DonanteTablero, "estado_general">) => d.estado_general !== "cerrado";

// Tiempo en protocolo: desde donantes.created_at (alta en Procurapp).
export const minutosEnProtocolo = (d: Pick<DonanteTablero, "created_at">, ahora: number) => minutosDesde(d.created_at, ahora);

// "45 min" · "5 h 20 min" · "5 h" · "1 d 3 h"
export function textoDuracion(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos));
  if (m < 60) return `${m} min`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// En pantalla, iniciales (nunca el nombre completo). "Juan Carlos de la
// Peña" -> "JCP" (sin partículas).
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos", "das", "van", "von"]);
export function iniciales(nombre: string | null): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  return partes.map((p) => p[0]!.toLocaleUpperCase("es")).join("") || "—";
}

// Identificador para exportar a equipos: PD / folio (nunca nombre ni DNI).
export function identificador(d: Pick<DonanteTablero, "id" | "pd_numero" | "folio_numero" | "nombre_completo">): string {
  const partes = [d.pd_numero ? `PD ${d.pd_numero}` : null, d.folio_numero ? `Folio ${d.folio_numero}` : null].filter(Boolean);
  return partes.length ? partes.join(" · ") : `${iniciales(d.nombre_completo)} · ${d.id.slice(0, 8)}`;
}

// ------------------------------------------------------- Mantenimiento
export type EstadoMantenimiento =
  | { tipo: "no_aplica" } // córneas: no hay etapa de Mantenimiento
  | { tipo: "sin_datos"; minutosProtocolo: number; noIniciado: boolean } // noIniciado: aviso ámbar
  | { tipo: "con_datos"; ultimo: string; minutos: number; color: "verde" | "ambar" | "rojo" };

export function estadoMantenimiento(i: Pick<InsumosTablero, "donante" | "etapas" | "momentosMantenimiento">, ahora: number): EstadoMantenimiento {
  const visible = etapasVisibles(i.donante.tipo_procuracion, i.etapas.judicialAplica).some((e) => e.key === "mantenimiento");
  if (!visible) return { tipo: "no_aplica" };
  if (i.momentosMantenimiento.length === 0) {
    const minutosProtocolo = minutosEnProtocolo(i.donante, ahora);
    return { tipo: "sin_datos", minutosProtocolo, noIniciado: minutosProtocolo > MIN_MANTENIMIENTO_NO_INICIADO };
  }
  const ultimo = i.momentosMantenimiento.reduce((a, b) => (b > a ? b : a));
  const minutos = minutosDesde(ultimo, ahora);
  const color = minutos < MIN_DATO_VERDE ? "verde" : minutos <= MIN_DATO_ROJO ? "ambar" : "rojo";
  return { tipo: "con_datos", ultimo, minutos, color };
}

// ------------------------------------------------------------ bloqueos
// Rojo = (a) pedido urgente sin respuesta hace >30 min, o (b) Mantenimiento
// sin dato nuevo hace >2 h, contado desde el ÚLTIMO dato (solo si ya hubo
// alguno). Con la etapa Mantenimiento completa, (b) no aplica.
export type Bloqueo = { motivo: "urgente_sin_respuesta" | "mantenimiento_sin_datos"; desde: string; texto: string };

const mantenimientoCompleto = (i: Pick<InsumosTablero, "etapas">) => estadoEtapa("mantenimiento", i.etapas) === "green";

export function bloqueos(i: InsumosTablero, ahora: number): Bloqueo[] {
  const r: Bloqueo[] = i.solicitudes
    .filter((s) => urgenteVencida(s, ahora))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((s) => ({
      motivo: "urgente_sin_respuesta" as const,
      desde: s.created_at,
      texto: `Pedido urgente sin respuesta hace ${textoDuracion(minutosDesde(s.created_at, ahora))}: ${s.titulo}`,
    }));
  const m = estadoMantenimiento(i, ahora);
  if (m.tipo === "con_datos" && m.color === "rojo" && !mantenimientoCompleto(i)) {
    r.push({ motivo: "mantenimiento_sin_datos", desde: m.ultimo, texto: `Mantenimiento sin datos hace ${textoDuracion(m.minutos)}` });
  }
  return r;
}

// Aviso ámbar (no rojo): nunca hubo dato de Mantenimiento y pasaron 2 h.
export function avisos(i: InsumosTablero, ahora: number): string[] {
  const m = estadoMantenimiento(i, ahora);
  return m.tipo === "sin_datos" && m.noIniciado && !mantenimientoCompleto(i) ? ["Mantenimiento no iniciado"] : [];
}

// ------------------------------------------------- barra de etapas 01–13
export type EtapaBarra = { key: string; label: string; numero: number; estado: EstadoEtapa };

// Estados de la barra en la Base: los de Procurapp (con marca manual) y
// Mantenimiento en rojo si bloquea, o en ámbar si no se inició.
export function barraEtapas(i: InsumosTablero, ahora: number): EtapaBarra[] {
  const b = bloqueos(i, ahora);
  const noIniciado = avisos(i, ahora).length > 0;
  return etapasVisibles(i.donante.tipo_procuracion, i.etapas.judicialAplica).map((e, idx) => {
    let estado: EstadoEtapa = estadoEtapa(e.key, i.etapas) ?? "gray";
    if (e.key === "mantenimiento") {
      if (b.some((x) => x.motivo === "mantenimiento_sin_datos")) estado = "red";
      else if (noIniciado && estado === "gray") estado = "amber";
    }
    return { key: e.key, label: e.label, numero: idx + 1, estado };
  });
}

// Etapa actual: la primera no completa (null = todas completas).
export function etapaActual(barra: EtapaBarra[]): EtapaBarra | null {
  const k = primeraNoCompleta(
    barra.map((e) => e.key),
    (key) => barra.find((e) => e.key === key)?.estado
  );
  return barra.find((e) => e.key === k) ?? null;
}

// ------------------------------------------------- pendientes por etapa
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Lo que falta en una etapa, sacado de los datos reales. Vacío si está
// completa (calculada verde).
export function pendientesEtapa(key: string, d: DatosEtapas): string[] {
  const marca = d.marcas[key]?.marca;
  const calc = estadoCalculadoEtapa(key, d);
  const extra = marca === "no_completo" ? ["marcada no completa manualmente"] : [];
  if (calc === "green") return extra;
  const r: string[] = [];
  switch (key) {
    case "potencial": {
      if (!d.donante.servicio) r.push("falta servicio");
      if (!d.donante.pd_numero) r.push("falta N° PD");
      if (!d.donante.fecha_ingreso) r.push("falta fecha de ingreso");
      break;
    }
    case "me": {
      const c = d.meCampos;
      if (!c.hora_1a) r.push("falta hora de 1ª evaluación");
      if (!c.hora_2a) r.push("falta hora de 2ª evaluación");
      const def = (v: string | null | undefined) => v === "ausente" || v === "presente";
      const sinDefinir = REFLEJOS_ME.reduce((n, x) => n + (def(c[reflejoKey(x.key, "1a")]) ? 0 : 1) + (def(c[reflejoKey(x.key, "2a")]) ? 0 : 1), 0);
      if (sinDefinir) r.push(`${plural(sinDefinir, "reflejo sin completar", "reflejos sin completar")}`);
      const presentes = REFLEJOS_ME.filter((x) => x.grupo === "B" && (c[reflejoKey(x.key, "1a")] === "presente" || c[reflejoKey(x.key, "2a")] === "presente"));
      if (presentes.length) r.push(`reflejo de tronco presente: ${presentes.map((x) => x.label).join(", ")}`);
      if (c.tipo_test_confirmacion === "apnea") {
        if (!c.apneica1_pco2_inicial || !c.apneica1_pco2_final) r.push("falta pCO2 inicial/final del test de apnea");
      } else if (c.tipo_test_confirmacion === "atropina") {
        if (!c.fc_inicial || !c.fc_final) r.push("falta FC inicial/final del test de atropina");
      } else r.push("falta test de confirmación");
      break;
    }
    case "certificacion":
      if (!METODOS_CERT_AUX.some((m) => d.certAuxCampos[m.key] === "completo")) r.push("ningún método auxiliar completo");
      break;
    case "comMuerte":
      r.push("comunicación de muerte sin registrar");
      break;
    case "comDonacion":
      r.push("comunicación de donación sin registrar");
      break;
    case "muestras": {
      const total = d.muestras.length;
      const faltan = d.muestras.filter((m) => !m.obtenida).length;
      r.push(total === 0 ? "sin muestras cargadas" : `faltan ${faltan} de ${total} muestras`);
      break;
    }
    case "cultivos": {
      const vig = d.cultivos.filter((c) => !c.anulado);
      const pend = vig.filter((c) => c.estado === "pendiente").length;
      r.push(vig.length === 0 ? "sin cultivos cargados" : `${plural(pend, "cultivo pendiente", "cultivos pendientes")} de resultado`);
      break;
    }
    case "judicial": {
      if (!d.fotosJudiciales.some((f) => f.tipo === "precario")) r.push("falta foto del precario");
      if (!d.fotosJudiciales.some((f) => f.tipo === "autorizacion_juez")) r.push("falta autorización del juez");
      break;
    }
    case "quirofano":
      r.push("sin hora de quirófano");
      break;
    default:
      // medidas, labImagenes, mantenimiento, documentacion, entregaCorneas:
      // se completan con la marca manual.
      if (marca !== "completo") r.push("sin marcar completa");
  }
  if (marca === "completo") return [];
  return [...extra, ...r];
}

// "Falta o bloquea": bloqueos (rojo), avisos (ámbar) y lo que falta en la
// etapa actual.
export function faltaOBloquea(i: InsumosTablero, ahora: number): { rojo: string[]; ambar: string[]; pendientes: string[] } {
  const actual = etapaActual(barraEtapas(i, ahora));
  return {
    rojo: bloqueos(i, ahora).map((b) => b.texto),
    ambar: avisos(i, ahora),
    pendientes: actual ? pendientesEtapa(actual.key, i.etapas) : [],
  };
}

// ------------------------------------------------------------ quirófano
export function quirofanoEnVentana(i: Pick<InsumosTablero, "etapas">, ahora: number): string | null {
  const h = horaVigente(i.etapas.horariosQx);
  if (!h) return null;
  const t = new Date(h.hora).getTime();
  return t >= ahora - HORAS_QX_ATRAS * HORA && t <= ahora + HORAS_QX_ADELANTE * HORA ? h.hora : null;
}

// ------------------------------------------------------------- urgencia
// 1° bloqueado (el bloqueo más viejo primero) · 2° quirófano entre 2 h
// atrás y 24 h adelante (el más cercano primero) · 3° solicitud abierta sin
// respuesta (urgentes antes; la más vieja primero) · 4° el resto. Empate:
// más tiempo en protocolo; después el id (orden estable).
export type Urgencia = { nivel: 1 | 2 | 3 | 4; clave: number };

export function urgencia(i: InsumosTablero, ahora: number): Urgencia {
  const b = bloqueos(i, ahora);
  if (b.length) return { nivel: 1, clave: Math.min(...b.map((x) => new Date(x.desde).getTime())) };
  const qx = quirofanoEnVentana(i, ahora);
  if (qx) return { nivel: 2, clave: new Date(qx).getTime() };
  const abiertas = i.solicitudes.filter(sinRespuesta);
  if (abiertas.length) {
    const urgentes = abiertas.filter((s) => s.prioridad === "urgente");
    const grupo = urgentes.length ? urgentes : abiertas;
    const masVieja = Math.min(...grupo.map((s) => new Date(s.created_at).getTime()));
    return { nivel: 3, clave: (urgentes.length ? 0 : 1) * 1e15 + masVieja };
  }
  return { nivel: 4, clave: 0 };
}

export function ordenarPorUrgencia<T extends InsumosTablero>(xs: T[], ahora: number): T[] {
  const u = new Map(xs.map((x) => [x.donante.id, urgencia(x, ahora)]));
  return [...xs].sort((a, b) => {
    const ua = u.get(a.donante.id)!;
    const ub = u.get(b.donante.id)!;
    return (
      ua.nivel - ub.nivel ||
      ua.clave - ub.clave ||
      a.donante.created_at.localeCompare(b.donante.created_at) ||
      a.donante.id.localeCompare(b.donante.id)
    );
  });
}

// --------------------------------------------------------------- tarjetas
export function resumenTarjetas(xs: InsumosTablero[], ahora: number) {
  const activos = xs.filter((x) => esActivo(x.donante));
  return {
    activos: activos.length,
    requierenAccion: activos.filter((x) => urgencia(x, ahora).nivel === 1 || x.solicitudes.some(esAbierta)).length,
    quirofano24h: activos.filter((x) => quirofanoEnVentana(x, ahora) !== null).length,
    solicitudesAbiertas: activos.reduce((n, x) => n + x.solicitudes.filter(esAbierta).length, 0),
  };
}

// ---------------------------------------------------------- fila completa
const etiquetaOrgano = (o: string, otro: string | null) => (o === "otro" ? otro ?? "Otro" : ORGANOS_EQUIPO.find((x) => x.valor === o)?.etiqueta ?? o);

export function filaTablero(i: InsumosTablero, ahora: number) {
  const d = i.donante;
  const barra = barraEtapas(i, ahora);
  return {
    id: d.id,
    iniciales: iniciales(d.nombre_completo),
    identificador: identificador(d),
    edad: d.edad,
    sexo: d.sexo,
    peso: d.peso,
    hospital: [d.institucion, d.localidad].filter(Boolean).join(" · ") || null,
    procurador: d.procurador_nombre ?? null,
    tiempoEnProtocolo: textoDuracion(minutosEnProtocolo(d, ahora)),
    barra,
    etapaActual: etapaActual(barra),
    falta: faltaOBloquea(i, ahora),
    solicitudesAbiertas: i.solicitudes.filter(esAbierta).length,
    ultimoDato: estadoMantenimiento(i, ahora),
    quirofano: horaVigente(i.etapas.horariosQx)?.hora ?? null,
    equipos: i.equipos
      .filter((e) => !e.anulado)
      .map((e) => ({ equipo: e.equipo, organos: e.organos.map((o) => etiquetaOrgano(o, e.organo_otro)) })),
    urgencia: urgencia(i, ahora),
  };
}
export type FilaTablero = ReturnType<typeof filaTablero>;

// ---------------------------------------------------- cerrar protocolo
export const RESULTADOS_CIERRE = [
  { valor: "donante_efectivo", etiqueta: "Donante efectivo" },
  { valor: "negativa_familiar", etiqueta: "Negativa familiar" },
  { valor: "contraindicacion_medica", etiqueta: "Contraindicación médica" },
  { valor: "paro_cardiaco", etiqueta: "Paro cardíaco" },
  { valor: "otro", etiqueta: "Otro" },
] as const;
export type ResultadoCierre = (typeof RESULTADOS_CIERRE)[number]["valor"];

export function validarCierre(resultado: ResultadoCierre | null, detalle: string): { ok: true; detalle: string | null } | { ok: false; error: string } {
  if (!resultado) return { ok: false, error: "Elegí el resultado del protocolo." };
  const t = detalle.trim();
  if (resultado === "otro" && !t) return { ok: false, error: "Con 'Otro', escribí el motivo." };
  if (t.length > 300) return { ok: false, error: "El detalle es demasiado largo (máximo 300 caracteres)." };
  return { ok: true, detalle: t || null };
}

export function textoTimelineCierre(resultado: ResultadoCierre, detalle: string | null, hora: string): string {
  const e = RESULTADOS_CIERRE.find((r) => r.valor === resultado)!.etiqueta;
  return `Protocolo cerrado — ${e}${detalle ? `: ${detalle}` : ""} (${hora})`;
}
export const textoTimelineReapertura = (hora: string) => `Protocolo reabierto (${hora})`;
