import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encabezado,
  grillaMantenimiento,
  identificacionCorta,
  organosVigentes,
  revisionesVigentes,
  seccionComunicacion,
  seccionCultivos,
  seccionDocumentacion,
  seccionImagenes,
  seccionJudicial,
  seccionLaboratorios,
  seccionMantenimiento,
  seccionMetodos,
  seccionNeurologico,
  seccionPotencial,
  seccionQuirofano,
  textoLineaAccion,
  textoWhatsApp,
} from "../base-secciones.ts";
import { donantesSimulados } from "../base-demo.ts";

const AHORA = new Date(2026, 9, 10, 14, 32).getTime();
const exp = (id: string) => donantesSimulados(AHORA).find((x) => x.donante.id === id)!.expediente;

test("encabezado: 'Datos hasta' solo con hora real del último dato; si no, 'Generado' (nunca la hora de copiado como dato)", () => {
  const lab = seccionLaboratorios(exp("sim-a"), "08", AHORA);
  assert.ok(lab.datosHasta);
  assert.match(encabezado(lab, "PD 000101", AHORA), /^\*PD 000101 · 08 Laboratorios · Datos hasta \d\d:\d\d\*$/);
  assert.notEqual(encabezado(lab, "PD 000101", AHORA), "*PD 000101 · 08 Laboratorios · Datos hasta 14:32*");
  const man = seccionMantenimiento(exp("sim-a"), "11", AHORA);
  assert.match(encabezado(man, "PD 000101", AHORA), /Datos hasta 14:12\*$/); // último registro de enfermería (hace 20 min)
  const med = seccionNeurologico(exp("sim-a"), "02");
  assert.equal(med.datosHasta, null);
  assert.equal(encabezado(med, "PD 000101", AHORA), "*PD 000101 · 02 Certificación de muerte: examen neurológico · Generado 14:32*");
});

test("el texto nunca lleva nombre ni DNI; se identifica por PD (o folio)", () => {
  const e = exp("sim-a");
  assert.equal(identificacionCorta(e.donante), "PD 000101");
  assert.equal(identificacionCorta({ id: "abcdefgh-1", pd_numero: null, folio_numero: "77" }), "Folio 77");
  const secciones = [seccionPotencial(e, "01"), seccionComunicacion(e, "05", "comDonacion"), seccionNeurologico(e, "02"), seccionQuirofano(e, "13", AHORA)];
  for (const s of secciones) {
    const t = textoWhatsApp(s, identificacionCorta(e.donante), AHORA);
    assert.equal(/Sofía|Alvarez|DNI-000101|DNI-FAM|Familiar Simulado/.test(t), false, s.clave);
  }
});

test("01: datos pedidos; la foto del DNI se ve pero no se comparte", () => {
  const s = seccionPotencial(exp("sim-a"), "01");
  assert.deepEqual(s.grupos[0].filas.map((f) => f.etiqueta), ["Edad", "Servicio", "Cama", "Antecedentes", "Fecha de nacimiento", "Fecha de ingreso"]);
  assert.deepEqual(s.imagenes.map((i) => [i.etiqueta, i.compartible]), [["Foto del DNI", false], ["Foto de grupo y factor", true]]);
  const t = textoWhatsApp(s, "PD 000101", AHORA);
  assert.ok(t.includes("Foto de grupo y factor"));
  assert.equal(t.includes("Foto del DNI"), false);
});

test("02 y 03: solo lo completado y solo el método elegido", () => {
  const s = seccionNeurologico(exp("sim-a"), "02");
  const etiquetas = s.grupos[0].filas.map((f) => f.etiqueta);
  assert.deepEqual(etiquetas, ["1ª evaluación", "2ª evaluación", "Test de apnea", "Causa del coma", "En ARM desde", "Estudio complementario", "Médico de la institución", "Neurólogo"]);
  assert.equal(s.grupos[0].filas[0].valor, "10/10/2026 08:00");
  const vacio = seccionNeurologico(exp("sim-e"), "02");
  assert.equal(vacio.grupos[0].filas.length, 0);
  assert.equal(vacio.vacio, "Sin datos completados.");
  const m = seccionMetodos(exp("sim-a"), "03");
  assert.deepEqual(m.grupos.map((g) => g.titulo), ["EEG", "Doppler transcraneano"]); // potenciales "No corresponde" y angiografía "Pendiente" no aparecen
  assert.ok(m.grupos[0].filas.some((f) => f.etiqueta === "Informe"));
});

test("04 y 05: 'Hecha: Sí' solo con registro real (con fecha y hora); marca manual sola no alcanza", () => {
  const e = exp("sim-a");
  // sim-a: 04 y 05 marcadas completas a mano, sin el registro "Realizada"
  e.comunicaciones = { comMuerte: null, comDonacion: null };
  const s = seccionComunicacion(e, "05", "comDonacion");
  assert.deepEqual(s.grupos[0].filas, [{ etiqueta: "Hecha", valor: "Marcada completa por el procurador (sin datos cargados)", detalle: null }]);
  assert.ok(textoWhatsApp(s, "PD 000101", AHORA).includes("*Hecha:* Marcada completa por el procurador (sin datos cargados)"));
  // con el registro real: Sí, con la fecha y hora en que se registró
  e.comunicaciones = {
    comMuerte: { estado: "si", updated_at: new Date(2026, 9, 10, 9, 30).toISOString(), meta: { comunicada_en: new Date(2026, 9, 10, 9, 5).toISOString() } },
    comDonacion: { estado: "no", updated_at: new Date(2026, 9, 10, 9, 0).toISOString() },
  };
  const m = seccionComunicacion(e, "04", "comMuerte");
  assert.deepEqual(m.grupos[0].filas, [{ etiqueta: "Hecha", valor: "Sí", detalle: "comunicada 10/10 09:05" }]);
  assert.ok(textoWhatsApp(m, "PD 000101", AHORA).includes("*Hecha:* Sí (comunicada 10/10 09:05)"));
  // registro viejo, sin la hora de la comunicación: se dice
  e.comunicaciones.comMuerte = { estado: "si", updated_at: new Date(2026, 9, 10, 9, 30).toISOString() };
  assert.equal(seccionComunicacion(e, "04", "comMuerte").grupos[0].filas[0].detalle, "registrada 10/10 09:30 (sin hora de la comunicación)");
  // registro "No realizada" + marca manual: sigue sin datos reales
  assert.equal(seccionComunicacion(e, "05", "comDonacion").grupos[0].filas[0].valor, "Marcada completa por el procurador (sin datos cargados)");
  // sin nada: No
  assert.deepEqual(seccionComunicacion(exp("sim-e"), "05", "comDonacion").grupos[0].filas, [{ etiqueta: "Hecha", valor: "No", detalle: null }]);
  // la familia se ve en la Base pero no entra en el texto
  assert.equal(s.soloBase[0].titulo, "Familiar de contacto");
  assert.equal(textoWhatsApp(s, "PD 000101", AHORA).includes("Familiar"), false);
});

test("08 laboratorios por sistema con unidad y hora; 08 imágenes ordenadas y compartibles", () => {
  const lab = seccionLaboratorios(exp("sim-a"), "08", AHORA);
  assert.deepEqual(lab.grupos.map((g) => g.titulo), ["Hemodinámico", "Respiratorio", "Renal", "Metabólico", "Hepático y hematológico"]);
  assert.ok(lab.grupos[0].filas.some((f) => f.valor === "45,00 ng/L"));
  const im = seccionImagenes(exp("sim-a"), "08");
  assert.deepEqual(im.imagenes.map((i) => i.etiqueta.split(" — ")[0]), ["Rx de tórax", "ECG"]);
  assert.ok(im.imagenes.every((i) => i.compartible));
});

test("09: por cultivo tipo, fecha, estado, rescate y sensibilidad; por antibiótico cuál, foco y desde", () => {
  const s = seccionCultivos(exp("sim-a"), "09");
  const t = textoWhatsApp(s, "PD 000101", AHORA);
  assert.ok(t.includes("*Cultivos*") && t.includes("*Antibióticos*"));
  assert.ok(t.includes("*Aspirado traqueal:* Pendiente (toma"));
  assert.ok(t.includes("*Piperacilina-tazobactam (simulado):* desde") && t.includes("foco: Respiratorio"));
});

test("10: solo la marca de revisada (sin copiar ni compartir)", () => {
  assert.deepEqual(seccionDocumentacion("10").acciones, { copiar: false, compartir: false });
});

test("11: grilla hora a hora de la hoja de enfermería, con la dosis de vasoactivos", () => {
  const g = grillaMantenimiento(exp("sim-a"), AHORA);
  assert.equal(g.length, 12);
  const u = g[g.length - 1];
  assert.equal(u.drogas[0].droga, "Noradrenalina");
  assert.ok(u.drogas[0].dosis !== null && Math.abs(u.drogas[0].dosis - 0.26) < 0.01);
  assert.equal(u.drogas[0].mlh, 15);
  // cada fila con SU velocidad (no la vigente de ahora): las primeras horas iban a 6 mL/h
  assert.equal(g[0].drogas[0].mlh, 6);
  assert.ok(g[0].drogas[0].dosis !== null && Math.abs(g[0].drogas[0].dosis - 0.103) < 0.005, String(g[0].drogas[0].dosis));
  assert.ok(g.every((x, i) => i === 0 || x.en > g[i - 1].en));
});

test("12 y 13: autorización y órganos: vale la última marca no anulada", () => {
  const e = exp("sim-c");
  e.autorizacionJudicial = [
    { id: "1", autorizado: false, marcado_por: "Ana", marcado_en: "2026-10-10T10:00:00Z", anulado: true },
    { id: "2", autorizado: true, marcado_por: "Ana", marcado_en: "2026-10-10T11:00:00Z", anulado: false },
  ];
  assert.deepEqual(seccionJudicial(e, "12", AHORA).grupos[0].filas[0].valor, "Sí");
  const m = organosVigentes([
    { id: "a", organo: "higado", aceptado: true, equipo_id: "c-q1", marcado_por: null, marcado_en: "2026-10-10T10:00:00Z", anulado: false },
    { id: "b", organo: "higado", aceptado: false, equipo_id: null, marcado_por: null, marcado_en: "2026-10-10T11:00:00Z", anulado: false },
  ]);
  assert.equal(m.get("higado")?.aceptado, false);
  e.organosAceptados = [{ id: "a", organo: "higado", aceptado: true, equipo_id: "c-q1", marcado_por: "Ana", marcado_en: "2026-10-10T10:00:00Z", anulado: false }];
  const q = seccionQuirofano(e, "13", AHORA);
  assert.equal(q.grupos[1].filas[0].valor, "Aceptado");
  assert.ok(q.grupos[1].filas[0].detalle?.startsWith("Hígado Hospital Simulado"));
});

test("revisión de la Base y línea de tiempo: quién, qué y hora; sin borrado (vale la última no anulada)", () => {
  const r = revisionesVigentes([
    { id: "1", seccion: "cultivos", revisado_por: "Ana", revisado_en: "2026-10-10T10:00:00Z", anulado: true },
    { id: "2", seccion: "cultivos", revisado_por: "Luis", revisado_en: "2026-10-10T11:00:00Z", anulado: false },
  ]);
  assert.equal(r.get("cultivos")?.revisado_por, "Luis");
  assert.equal(textoLineaAccion("copió", { numero: "09", titulo: "Cultivos y antibióticos" }, "Laura", AHORA), "Base · Laura · copió 09 Cultivos y antibióticos (14:32)");
  assert.equal(textoLineaAccion("compartió", { numero: "08", titulo: "Imágenes y estudios" }, "", AHORA, "Rx de tórax"), "Base · sin nombre · compartió 08 Imágenes y estudios: Rx de tórax (14:32)");
});
