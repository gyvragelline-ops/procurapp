require("dotenv").config();
const fs = require("fs");
const { Client } = require("pg");

async function main() {
  const schemaSql = fs.readFileSync("schema.sql", "utf-8");
  const campoMapeoSql = fs.readFileSync("campo_mapeo.sql", "utf-8");

  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await client.connect();

  try {
    console.log("--- Ejecutando schema.sql ---");
    await client.query(schemaSql);
    console.log("OK: schema.sql aplicado.");

    console.log("--- Ejecutando campo_mapeo.sql ---");
    await client.query(campoMapeoSql);
    console.log("OK: campo_mapeo.sql aplicado.");

    console.log("--- Verificaciones ---");

    const tables = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name;"
    );
    console.log("Tablas creadas (" + tables.rows.length + "):");
    tables.rows.forEach((r) => console.log("  -", r.table_name));

    const trigger = await client.query(
      "select tgname, tgenabled, pg_get_triggerdef(oid) as def from pg_trigger where tgname = 'trg_sembrar_etapas';"
    );
    if (trigger.rows.length === 0) {
      console.log("Trigger trg_sembrar_etapas: NO ENCONTRADO");
    } else {
      console.log(
        "Trigger trg_sembrar_etapas: presente, tgenabled=" +
          trigger.rows[0].tgenabled +
          " ('O' = activo)"
      );
    }

    const func = await client.query(
      "select proname from pg_proc where proname = 'sembrar_etapas_donante';"
    );
    console.log(
      "Funcion sembrar_etapas_donante:",
      func.rows.length > 0 ? "presente" : "NO ENCONTRADA"
    );

    const campoMapeoCount = await client.query("select count(*) from campo_mapeo;");
    console.log("Total filas en campo_mapeo:", campoMapeoCount.rows[0].count);

    const perPlanilla = await client.query(
      "select planilla_key, count(*) from campo_mapeo group by planilla_key order by planilla_key;"
    );
    console.log("Por planilla:");
    perPlanilla.rows.forEach((r) => console.log("  -", r.planilla_key, ":", r.count));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERROR name:", err.name);
  console.error("ERROR code:", err.code);
  console.error("ERROR message:", err.message);
  process.exit(1);
});
