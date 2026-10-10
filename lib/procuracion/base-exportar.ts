// Base operativa · Exportar: lógica pura, con tests. CSV crudo por sección
// (UTF-8 con BOM, ";" y coma decimal, para Excel en castellano) y
// selección de secciones por equipo. Privacidad: lo que sale para un
// equipo NUNCA lleva nombre ni DNI (se identifica por PD / folio); la Base
// puede incluirlos solo con la opción explícita.

import { ETIQUETA_ORIGEN, SISTEMAS, serie, type FuentesExpediente, type Parametro } from "./base-expediente.ts";
import { identificador, type DonanteTablero, type EquipoTablero } from "./base-tablero.ts";
import { ORGANOS_EQUIPO, horaVigente, type HorarioQuirofano } from "./quirofano-calculos.ts";

export const EQUIPOS_EXPORTACION = [
  { valor: "todo", etiqueta: "Todo" },
  { valor: "cardiaco", etiqueta: "Cardíaco" },
  { valor: "pulmonar", etiqueta: "Pulmonar" },
  { valor: "hepatico", etiqueta: "Hepático" },
  { valor: "renal", etiqueta: "Renal" },
  { valor: "pancreas", etiqueta: "Páncreas" },
] as const;
export type EquipoExportacion = (typeof EQUIPOS_EXPORTACION)[number]["valor"];

// ---------------------------------------------------------------- secciones
type Seccion =
  | { key: string; titulo: string; tipo: "parametros"; claves: string[] }
  | { key: string; titulo: string; tipo: "identificacion" | "serologias" | "cultivos" | "quirofano" | "ecg" | "candidato_corazon" }
  | { key: string; titulo: string; tipo: "estudios"; tiposEstudio: string[] | null };

const DROGAS_VASOACTIVAS = ["noradrenalina", "adrenalina", "dopamina", "dobutamina", "isoproterenol", "esmolol", "amiodarona", "vasopresina"].map((d) => `droga:${d}`);

export const SECCIONES: Seccion[] = [
  // bloque común
  { key: "identificacion", titulo: "Datos del donante", tipo: "identificacion" },
  { key: "serologias", titulo: "Serologías", tipo: "serologias" },
  { key: "hemodinamico", titulo: "Hemodinámico", tipo: "parametros", claves: ["pam", "fc", "pvc", ...DROGAS_VASOACTIVAS] },
  { key: "hemograma", titulo: "Hemograma", tipo: "parametros", claves: ["hb", "hto", "gb", "plaquetas"] },
  { key: "hepatograma", titulo: "Hepatograma", tipo: "parametros", claves: ["tgo", "tgp", "bili_total", "bili_directa", "fal", "ggt"] },
  { key: "coagulograma", titulo: "Coagulograma", tipo: "parametros", claves: ["tp", "rin", "kptt", "fibrinogeno"] },
  { key: "amilasa", titulo: "Amilasa", tipo: "parametros", claves: ["amilasa"] },
  { key: "sedimento", titulo: "Sedimento urinario", tipo: "parametros", claves: ["sedimento"] },
  { key: "cultivos", titulo: "Cultivos", tipo: "cultivos" },
  { key: "estudios", titulo: "Imágenes y estudios", tipo: "estudios", tiposEstudio: null },
  { key: "quirofano", titulo: "Hora de quirófano y equipos", tipo: "quirofano" },
  // propio de cada órgano
  { key: "lab_cardiaco", titulo: "Troponina y CPK-MB", tipo: "parametros", claves: ["troponina", "cpk_mb"] },
  { key: "monitoreo_avanzado", titulo: "Monitoreo avanzado", tipo: "parametros", claves: ["gc", "ic_medido", "sat_venosa", "delta_pp", "delta_vs"] },
  { key: "candidato_corazon", titulo: "Candidato a corazón", tipo: "candidato_corazon" },
  { key: "ecg", titulo: "ECG", tipo: "ecg" },
  { key: "ecografias", titulo: "Ecografías", tipo: "estudios", tiposEstudio: ["Ecografia"] },
  { key: "respiratorio", titulo: "Respiratorio", tipo: "parametros", claves: ["sat_o2", "modo", "fio2", "peep", "volumen_corriente", "frecuencia", "presion_plateau", "presion_pico"] },
  { key: "gases", titulo: "Gases", tipo: "parametros", claves: ["ph", "pao2", "pafi"] },
  { key: "torax", titulo: "Rx y TAC de tórax", tipo: "estudios", tiposEstudio: ["Rx_torax", "TAC_torax"] },
  { key: "balance", titulo: "Balance acumulado", tipo: "parametros", claves: ["balance_acumulado"] },
  { key: "renal", titulo: "Renal", tipo: "parametros", claves: ["diuresis_ml", "urea", "creatinina", "osm_serica", "osm_urinaria", "densidad_urinaria", "droga:furosemida"] },
  { key: "electrolitos", titulo: "Sodio y potasio", tipo: "parametros", claves: ["na", "k"] },
  { key: "glucemia", titulo: "Glucemia", tipo: "parametros", claves: ["glucemia"] },
  { key: "insulina", titulo: "Insulina en bomba", tipo: "parametros", claves: ["droga:insulina"] },
  // solo en "Todo"
  { key: "otros", titulo: "Temperatura y otras infusiones", tipo: "parametros", claves: ["temperatura", "droga:potasio", "droga:bicarbonato", "droga:hidrocortisona", "droga:dexametasona"] },
];

export const BLOQUE_COMUN = ["identificacion", "serologias", "hemodinamico", "hemograma", "hepatograma", "coagulograma", "amilasa", "sedimento", "cultivos", "estudios", "quirofano"];

export const PROPIO_DE_EQUIPO: Record<Exclude<EquipoExportacion, "todo">, string[]> = {
  cardiaco: ["lab_cardiaco", "monitoreo_avanzado", "candidato_corazon", "ecg", "ecografias"],
  pulmonar: ["respiratorio", "gases", "torax", "balance"],
  hepatico: ["electrolitos", "glucemia", "ecografias"],
  renal: ["renal", "balance", "electrolitos", "ecografias"],
  pancreas: ["glucemia", "insulina"],
};

// Secciones de cada equipo, en el orden de SECCIONES (sin repetir).
export function seccionesDeEquipo(equipo: EquipoExportacion): string[] {
  const keys = equipo === "todo" ? SECCIONES.map((s) => s.key) : [...BLOQUE_COMUN, ...PROPIO_DE_EQUIPO[equipo]];
  return SECCIONES.map((s) => s.key).filter((k) => keys.includes(k));
}

// -------------------------------------------------------------------- CSV
export const SEPARADOR = ";";
export const BOM = "﻿";
export const COLUMNAS = ["donante", "fecha_hora", "parametro", "valor", "unidad", "origen"] as const;

const p2 = (n: number) => String(n).padStart(2, "0");
export function fechaHoraTexto(iso: string | number): string {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export const horaTexto = (iso: string | number) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

// Número crudo con coma decimal (sin redondear ni separador de miles).
export const numeroCsv = (n: number) => String(n).replace(".", ",");

export function campoCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const t = typeof v === "number" ? numeroCsv(v) : v;
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export type FilaCsv = { donante: string; en: string | null; parametro: string; valor: string | number | null; unidad: string | null; origen: string };

export function armarCsv(encabezado: string[][], filas: FilaCsv[]): string {
  const lineas = [
    ...encabezado.map((l) => l.map(campoCsv).join(SEPARADOR)),
    "",
    COLUMNAS.join(SEPARADOR),
    ...filas.map((f) => [f.donante, f.en ? fechaHoraTexto(f.en) : "", f.parametro, f.valor, f.unidad, f.origen].map(campoCsv).join(SEPARADOR)),
  ];
  return BOM + lineas.join("\r\n") + "\r\n";
}

// ------------------------------------------------------------- los datos
export type DonanteExportacion = DonanteTablero & {
  dni: string | null;
  sexo: string | null;
  talla: number | null;
  grupo_sanguineo: string | null;
  fecha_ingreso: string | null;
  me_hora: string | null;
  causa_muerte: string | null;
};

export type DatosExportacion = {
  donante: DonanteExportacion;
  fuentes: FuentesExpediente;
  cultivos: { tipo: string; tipo_otro: string | null; tomado_en: string; estado: string; germen: string | null; sensibilidad: string | null; resultado_en: string | null; anulado: boolean }[];
  estudios: { tipo_estudio: string; descripcion: string | null; created_at: string }[];
  horariosQx: HorarioQuirofano[];
  equipos: (EquipoTablero & { creado_en: string })[];
  muestras: { paquete_key: string; nombre: string; obtenida: boolean; retirada: boolean }[];
  corazonCandidato: "si" | "no" | "sin_definir" | null;
};

const PARAMETROS = new Map<string, Parametro>(SISTEMAS.flatMap((s) => s.parametros.map((x) => [x.clave, x] as const)));

function filasSeccion(s: Seccion, d: DatosExportacion, donante: string, ahora: number, conIdentidad: boolean): FilaCsv[] {
  const fila = (en: string | null, parametro: string, valor: string | number | null, unidad: string | null, origen: string): FilaCsv => ({ donante, en, parametro, valor, unidad, origen });
  switch (s.tipo) {
    case "parametros":
      return s.claves.flatMap((clave) => {
        const par = PARAMETROS.get(clave);
        const etiqueta = par?.etiqueta ?? clave;
        return serie(clave, d.fuentes, ahora).map((x) => fila(x.en, etiqueta, x.valor, par?.unidad ?? null, ETIQUETA_ORIGEN[x.origen]));
      });
    case "identificacion": {
      const x = d.donante;
      const ficha = (parametro: string, valor: string | number | null, unidad: string | null = null) => fila(x.created_at, parametro, valor, unidad, "Ficha");
      return [
        ...(conIdentidad ? [ficha("Nombre", x.nombre_completo), ficha("DNI", x.dni)] : []),
        ficha("PD", x.pd_numero),
        ficha("Folio", x.folio_numero),
        ficha("Edad", x.edad, "años"),
        ficha("Sexo", x.sexo),
        ficha("Peso", x.peso, "kg"),
        ficha("Talla", x.talla, "cm"),
        ficha("Grupo y factor", x.grupo_sanguineo),
        ficha("Causa de muerte", x.causa_muerte),
        ficha("Institución", [x.institucion, x.localidad].filter(Boolean).join(" · ") || null),
        ficha("Fecha de ingreso", x.fecha_ingreso ? fechaHoraTexto(x.fecha_ingreso) : null),
        ficha("Hora de ME", x.me_hora),
      ];
    }
    case "serologias": {
      // Hoy no hay valores de serología en la base: solo el estado de la muestra.
      const m = d.muestras.find((x) => x.paquete_key === "serologia");
      return [fila(null, "Muestra de serología", m ? (m.retirada ? "retirada" : m.obtenida ? "obtenida" : "pendiente") : "sin muestra cargada", null, "Procurador")];
    }
    case "cultivos":
      return d.cultivos
        .filter((c) => !c.anulado)
        .sort((a, b) => a.tomado_en.localeCompare(b.tomado_en))
        .map((c) =>
          fila(
            c.tomado_en,
            c.tipo === "otro" ? c.tipo_otro ?? "Otro" : c.tipo,
            [c.estado, c.germen, c.sensibilidad ? `sensibilidad: ${c.sensibilidad}` : null, c.resultado_en ? `resultado ${fechaHoraTexto(c.resultado_en)}` : null].filter(Boolean).join(" · "),
            null,
            "Procurador"
          )
        );
    case "estudios":
      return d.estudios
        .filter((e) => s.tiposEstudio === null || s.tiposEstudio.includes(e.tipo_estudio))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => fila(e.created_at, e.tipo_estudio, e.descripcion ?? "(archivo sin descripción)", null, "Procurador"));
    case "quirofano": {
      const h = horaVigente(d.horariosQx);
      const etiquetaOrg = (o: string, otro: string | null) => (o === "otro" ? otro ?? "Otro" : ORGANOS_EQUIPO.find((x) => x.valor === o)?.etiqueta ?? o);
      return [
        fila(h?.registrado_en ?? null, "Hora de quirófano", h ? fechaHoraTexto(h.hora) : "sin hora", null, "Procurador"),
        ...d.equipos
          .filter((e) => !e.anulado)
          .map((e) => fila(e.creado_en, `Equipo ${e.equipo}`, e.organos.map((o) => etiquetaOrg(o, e.organo_otro)).join(", "), null, "Procurador")),
      ];
    }
    case "candidato_corazon":
      return [fila(null, "Candidato a corazón", d.corazonCandidato === "si" ? "sí" : d.corazonCandidato === "no" ? "no" : "sin definir", null, "Médico")];
    case "ecg":
      // Todavía no hay dónde cargar el ECG en Procurapp.
      return [fila(null, "ECG", "sin datos cargados (no hay carga de ECG todavía)", null, "—")];
  }
}

// El último dato (con hora) entre todas las filas exportadas.
function ultimoDato(filas: FilaCsv[]): string | null {
  return filas.reduce<string | null>((a, f) => (f.en && (!a || f.en > a) ? f.en : a), null);
}

export function textoTimelineExportacion(equipo: EquipoExportacion, conIdentidad: boolean, hora: string): string {
  const e = EQUIPOS_EXPORTACION.find((x) => x.valor === equipo)!.etiqueta;
  const base = equipo === "todo" ? `Exportado completo, ${hora}` : `Exportado para equipo ${e}, ${hora}`;
  return conIdentidad ? `${base} (con nombre y DNI)` : base;
}

// Un CSV por sección. Para un equipo la identidad nunca sale, aunque se
// pida: solo la Base, con la opción explícita.
export function exportarCsv(
  d: DatosExportacion,
  opciones: { equipo: EquipoExportacion; destino: "equipo" | "base"; incluirNombreYDni: boolean },
  ahora: number
): { archivos: { nombre: string; seccion: string; contenido: string }[]; datosHasta: string; ultimoDato: string | null; timeline: string } {
  const conIdentidad = opciones.destino === "base" && opciones.incluirNombreYDni;
  const donante = conIdentidad && d.donante.nombre_completo ? `${identificador(d.donante)} · ${d.donante.nombre_completo}` : identificador(d.donante);
  const equipoEtiqueta = EQUIPOS_EXPORTACION.find((x) => x.valor === opciones.equipo)!.etiqueta;
  const datosHasta = fechaHoraTexto(ahora);
  const sello = (() => {
    const x = new Date(ahora);
    return `${x.getFullYear()}${p2(x.getMonth() + 1)}${p2(x.getDate())}-${p2(x.getHours())}${p2(x.getMinutes())}`;
  })();
  const idArchivo = (d.donante.pd_numero ? `PD${d.donante.pd_numero}` : d.donante.id.slice(0, 8)).replace(/[^A-Za-z0-9_-]/g, "");

  const porSeccion = seccionesDeEquipo(opciones.equipo).map((key) => {
    const s = SECCIONES.find((x) => x.key === key)!;
    return { s, filas: filasSeccion(s, d, donante, ahora, conIdentidad) };
  });
  const ultimo = ultimoDato(porSeccion.flatMap((x) => x.filas));
  const archivos = porSeccion.map(({ s, filas }) => ({
    seccion: s.key,
    nombre: `procurapp_${idArchivo}_${opciones.equipo}_${s.key}_${sello}.csv`,
    contenido: armarCsv(
      [
        ["Procurapp", `Equipo: ${equipoEtiqueta}`, `Sección: ${s.titulo}`],
        ["Datos hasta", datosHasta, "Último dato", ultimo ? fechaHoraTexto(ultimo) : "—"],
      ],
      filas
    ),
  }));
  return { archivos, datosHasta, ultimoDato: ultimo, timeline: textoTimelineExportacion(opciones.equipo, conIdentidad, horaTexto(ahora)) };
}
