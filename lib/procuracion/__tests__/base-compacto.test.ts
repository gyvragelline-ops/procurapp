import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoTarjeta, laboratorioCondensado, numeroTarjeta, progresoEtapas, tarjetaDeEtapa, unirSecciones } from "../base-compacto.ts";
import { seccionComunicacion, seccionMuestras, seccionLaboratorios, textoWhatsApp, type ContenidoSeccion } from "../base-secciones.ts";
import { donantesSimulados } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 14, 32).getTime();
const exp = (id: string) => donantesSimulados(AHORA).find((x) => x.donante.id === id)!.expediente;

test("progreso: una entrada por etapa, con etiqueta corta, ✓ solo si fue marcada completa a mano, y su tarjeta", () => {
  const barra = [
    { key: "potencial", label: "Potencial donante", numero: 1, estado: "green" as const },
    { key: "documentacion", label: "Documentación", numero: 10, estado: "amber" as const },
    { key: "labImagenes", label: "Laboratorio e imágenes", numero: 8, estado: "gray" as const },
  ];
  const p = progresoEtapas(barra, { potencial: { marca: "completo" }, documentacion: { marca: "no_completo" } });
  assert.deepEqual(
    p.map((x) => [x.etiqueta, x.manual, x.tarjeta]),
    [
      ["Datos", true, "potencial"],
      ["Document.", false, "potencial"], // 10 lleva a la tarjeta 01
      ["Lab. e imág.", false, "laboratorios"],
    ]
  );
  assert.equal(tarjetaDeEtapa("entregaCorneas"), "potencial");
});

test("número de tarjeta: 01 · 02·03 · 04–06", () => {
  assert.equal(numeroTarjeta([1]), "01");
  assert.equal(numeroTarjeta([3, 2]), "02·03");
  assert.equal(numeroTarjeta([4, 5, 6]), "04–06");
  assert.equal(numeroTarjeta([]), "");
});

test("estado de la tarjeta: completa / N pendientes / bloqueada / sin iniciar", () => {
  assert.deepEqual(estadoTarjeta([{ estado: "green", pendientes: [] }, { estado: "green", pendientes: [] }]), { texto: "completa", color: "g", detalle: [] });
  assert.deepEqual(estadoTarjeta([{ estado: "green", pendientes: ["x"] }, { estado: "amber", pendientes: ["a", "b"] }]), { texto: "2 pendientes", color: "a", detalle: ["a", "b"] });
  assert.equal(estadoTarjeta([{ estado: "amber", pendientes: ["a"] }]).texto, "1 pendiente");
  assert.equal(estadoTarjeta([{ estado: "red", pendientes: ["sin datos"] }, { estado: "green", pendientes: [] }]).texto, "bloqueada");
  assert.equal(estadoTarjeta([{ estado: "gray", pendientes: [] }]).texto, "sin iniciar");
  assert.equal(estadoTarjeta([{ estado: "amber", pendientes: [] }]).texto, "en curso");
});

test("tarjeta 04–06: une las secciones; lo de solo Base (familia) sigue sin copiarse ni compartirse", () => {
  const d = exp("sim-a");
  const u = unirSecciones("comunicacion", "04–06", "Comunicación y muestras", [
    { c: seccionComunicacion(d, "04", "comMuerte"), subtitulo: "Comunicación de muerte" },
    { c: seccionComunicacion(d, "05", "comDonacion"), subtitulo: "Comunicación de donación" },
    { c: seccionMuestras(d, "06"), subtitulo: "Muestras" },
  ]);
  assert.deepEqual(
    u.grupos.map((g) => g.titulo),
    ["Comunicación de muerte", "Comunicación de donación", "Muestras"]
  );
  assert.equal(u.soloBase[0].titulo, "Familiar de contacto");
  const t = textoWhatsApp(u, "PD 000101", AHORA);
  assert.match(t, /^\*PD 000101 · 04–06 Comunicación y muestras · Generado 14:32\*/);
  for (const g of u.soloBase) for (const f of g.filas) assert.ok(!t.includes(f.valor), `no debe salir: ${f.valor}`);
});

test("unir: sección vacía muestra su aviso; datos hasta = el más nuevo; copiar si alguna se copia", () => {
  const c = (extra: Partial<ContenidoSeccion>): ContenidoSeccion => ({
    clave: "x",
    numero: "01",
    titulo: "X",
    grupos: [],
    soloBase: [],
    imagenes: [],
    datosHasta: null,
    acciones: { copiar: false, compartir: false },
    vacio: null,
    ...extra,
  });
  const u = unirSecciones("k", "02·03", "Certificación de muerte", [
    { c: c({ grupos: [{ titulo: null, filas: [{ etiqueta: "Causa", valor: "ACV" }] }], datosHasta: "2026-10-10T10:00:00.000Z", acciones: { copiar: true, compartir: true } }), subtitulo: "Examen neurológico" },
    { c: c({ vacio: "Sin método auxiliar completo.", datosHasta: "2026-10-10T12:00:00.000Z" }), subtitulo: "Método auxiliar" },
  ]);
  assert.deepEqual(u.grupos, [
    { titulo: "Examen neurológico", filas: [{ etiqueta: "Causa", valor: "ACV" }] },
    { titulo: "Método auxiliar", filas: [{ etiqueta: "Método auxiliar", valor: "Sin método auxiliar completo." }] },
  ]);
  assert.equal(u.datosHasta, "2026-10-10T12:00:00.000Z");
  assert.deepEqual(u.acciones, { copiar: true, compartir: true });
});

test("laboratorio condensado: un renglón por sistema con los mismos valores que la sección completa", () => {
  const d = exp("sim-a");
  const filas = laboratorioCondensado(d, AHORA);
  const completa = seccionLaboratorios(d, "08", AHORA);
  assert.deepEqual(
    filas.map((f) => f.etiqueta),
    completa.grupos.map((g) => g.titulo)
  );
  for (const g of completa.grupos) {
    const f = filas.find((x) => x.etiqueta === g.titulo)!;
    for (const v of g.filas) assert.ok(f.valor.includes(`${v.etiqueta} ${v.valor}`), `${g.titulo}: falta ${v.etiqueta}`);
    // hora de referencia = la que comparten más valores; solo los demás llevan la suya
    const horas = g.filas.map((v) => v.detalle);
    const ref = f.detalle;
    assert.ok(horas.every((h) => horas.filter((x) => x === h).length <= horas.filter((x) => x === ref).length));
    for (const v of g.filas) assert.equal(f.valor.includes(`${v.etiqueta} ${v.valor} (${v.detalle})`), v.detalle !== ref);
  }
});
