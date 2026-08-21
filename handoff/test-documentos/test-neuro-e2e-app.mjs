// Prueba end-to-end REAL: usa la app en el navegador (no inserts directos
// en la base) para crear un donante, cargar Certificación (Examen
// neurológico) y Certificación (Métodos auxiliares) a través de la UI,
// descargar Historia Clínica Neurológica desde el flujo real de
// Documentación, y leer el PDF descargado campo por campo.
//
// Uso: BASE_URL=http://localhost:3010 node handoff/test-documentos/test-neuro-e2e-app.mjs
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import { PDFDocument } from "pdf-lib";
import dotenv from "dotenv";

dotenv.config({ path: `${process.cwd()}/.env.local` });
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL || "http://localhost:3010";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const resultados = [];
function check(campo, esperado, obtenido) {
  resultados.push({ campo, esperado, obtenido, ok: obtenido === esperado });
}

async function fillFieldRow(page, label, valor) {
  // Filas "field-row": <span class="field-label">Label</span> + valor clickeable
  const row = page.locator(".field-row", { has: page.locator(".field-label", { hasText: label }) }).first();
  await row.locator(".field-value").click();
  const input = row.locator("input, textarea").first();
  await input.fill(valor);
  await input.blur();
  await page.waitForTimeout(150);
}

async function clickSiNo(page, label, opcion) {
  const row = page.locator(".field-row", { has: page.locator(".field-label", { hasText: label }) }).first();
  await row.getByRole("button", { name: opcion, exact: true }).click();
  await page.waitForTimeout(150);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const nombreDonante = `TEST E2E APP ${Date.now()} -- borrar`;
  let donanteId = null;

  try {
    console.log("--- Crear potencial donante NUEVO a través de la app ---");
    await page.goto(BASE_URL);
    await page.getByRole("button", { name: "+ Nuevo potencial donante" }).click();
    await page.getByPlaceholder("Opcional").first().fill(nombreDonante);
    await page.getByRole("button", { name: "Multiorgánico" }).click();
    await page.getByRole("button", { name: "Crear potencial donante" }).click();
    await page.waitForSelector(".donor-id");
    console.log("  Donante creado:", nombreDonante);

    // Recupera el id real desde la base para poder limpiar al final.
    const { data: donRow } = await supabase.from("donantes").select("id").eq("nombre_completo", nombreDonante).single();
    donanteId = donRow.id;
    console.log("  donante_id:", donanteId);

    console.log("--- Abrir 'Certificación (Examen neurológico)' y cargar datos ---");
    await page.getByText("Certificación (Examen neurológico)", { exact: true }).click();
    await page.waitForTimeout(300);

    await fillFieldRow(page, "Fecha del examen", "20/08/2026");
    await fillFieldRow(page, "Causa del coma", "TEC grave");

    // 1ª Evaluación
    await page.getByText("1ª Evaluación", { exact: false }).click();
    await page.waitForTimeout(200);
    await fillFieldRow(page, "Hora", "08:00");
    await fillFieldRow(page, "TAM", "93");
    await fillFieldRow(page, "Temperatura central", "36.5");
    await clickSiNo(page, "Diabetes insípida", "Sí");
    await fillFieldRow(page, "Pupilas", "Midriáticas arreactivas");
    await page.getByRole("button", { name: "Marcar todos ausentes" }).first().click();
    await page.waitForTimeout(300);
    // Marca "Fotomotor" de la 1ª evaluación como presente (toggle sobre el primer chip "Ausente" con label Fotomotor)
    await page
      .locator(".field-row", { has: page.locator(".field-label", { hasText: "Fotomotor" }) })
      .first()
      .locator("button")
      .click();
    await page.waitForTimeout(200);

    // 2ª Evaluación
    await page.getByText("2ª Evaluación", { exact: false }).click();
    await page.waitForTimeout(200);
    const evalRows = page.locator(".field-row", { has: page.locator(".field-label", { hasText: "Hora" }) });
    await evalRows.nth(1).locator(".field-value").click();
    await evalRows.nth(1).locator("input").fill("10:15");
    await evalRows.nth(1).locator("input").blur();
    await page.waitForTimeout(150);

    console.log("--- Cerrar sesión de página, generar PDF vía Documentación ---");
    await page.getByText("Documentación", { exact: true }).click();
    await page.waitForTimeout(300);
    const downloadPromise = page.waitForEvent("download");
    await page
      .locator(".field-row", { has: page.locator("span", { hasText: "Historia Clínica Neurológica" }) })
      .getByRole("button", { name: /Descargar|Generando/ })
      .click();
    const download = await downloadPromise;
    const outPath = path.join(os.tmpdir(), `neuro_e2e_${Date.now()}.pdf`);
    await download.saveAs(outPath);
    console.log("  PDF descargado en:", outPath);

    console.log("--- Leer el PDF descargado (archivo real, no aislado) ---");
    const bytes = fs.readFileSync(outPath);
    const outDoc = await PDFDocument.load(bytes);
    const getText = (f) => {
      try {
        return outDoc.getForm().getTextField(f).getText() ?? "";
      } catch {
        return "<<NO EXISTE>>";
      }
    };
    const getCheck = (f) => {
      try {
        return outDoc.getForm().getCheckBox(f).isChecked();
      } catch {
        return false;
      }
    };

    check("nombre", nombreDonante, getText("nombre"));
    check("causa_coma", "TEC grave", getText("causa_coma"));
    check("fecha_1a", "20/08/2026", getText("fecha_1a"));
    check("fecha_2a", "20/08/2026", getText("fecha_2a"));
    check("hora_1a", "08:00", getText("hora_1a"));
    check("hora_2a", "10:15", getText("hora_2a"));
    check("ta_tam_1a", "93", getText("ta_tam_1a"));
    check("t_central_1a", "36.5", getText("t_central_1a"));
    check("pupilas_1a", "Midriáticas arreactivas", getText("pupilas_1a"));
    check("diabetes_insipida_1a_si", "true", String(getCheck("diabetes_insipida_1a_si")));
    check("reflejo_fotomotor_1a_si", "true", String(getCheck("reflejo_fotomotor_1a_si")));
    check("reflejo_fotomotor_1a_no", "false", String(getCheck("reflejo_fotomotor_1a_no")));
    check("reflejo_corneano_1a_si", "false", String(getCheck("reflejo_corneano_1a_si")));
    check("reflejo_corneano_1a_no", "true", String(getCheck("reflejo_corneano_1a_no")));

    console.log("\n=== RESULTADOS (leídos del PDF real descargado) ===");
    let ok = 0,
      fail = 0;
    for (const r of resultados) {
      console.log(`  ${r.ok ? "OK" : "FALLO"}  ${r.campo}  esperado="${r.esperado}"  obtenido="${r.obtenido}"`);
      r.ok ? ok++ : fail++;
    }
    console.log(`\nTotal: ${resultados.length}  OK: ${ok}  FALLO: ${fail}`);
    fs.unlinkSync(outPath);
  } finally {
    await browser.close();
    if (donanteId) {
      console.log("\n--- Limpieza ---");
      await supabase.from("planilla_valores").delete().eq("donante_id", donanteId);
      await supabase.from("etapas_estado").delete().eq("donante_id", donanteId);
      await supabase.from("donantes").delete().eq("id", donanteId);
      console.log("Listo.");
    }
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
