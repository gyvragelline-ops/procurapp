import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Donante } from "../types";
import { REFLEJOS_ME, reflejoKey } from "../constants";

const s = StyleSheet.create({
  page: { padding: "34pt 42pt", fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a", lineHeight: 1.35 },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 2 },
  subtitulo: { fontSize: 9, textAlign: "center", color: "#555", marginBottom: 4 },
  encabezado: { fontSize: 9, textAlign: "center", color: "#333", marginBottom: 14 },
  seccion: { marginTop: 9 },
  seccionTitulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, color: "#444", marginBottom: 3, borderBottom: "0.5pt solid #ccc", paddingBottom: 2 },
  fila: { flexDirection: "row", marginBottom: 2 },
  etiqueta: { width: 110, color: "#555" },
  valor: { flex: 1 },
  negrita: { fontFamily: "Helvetica-Bold" },
  parrafo: { marginBottom: 2 },
  dosCol: { flexDirection: "row", gap: 18 },
  col: { flex: 1 },
  excepcion: { color: "#8a3b00", marginTop: 1 },
  firmaFila: { flexDirection: "row", justifyContent: "space-between", marginTop: 24 },
  firmaBloque: { width: "44%" },
  firmaLinea: { borderTop: "1pt solid #333", paddingTop: 3 },
  firmaNombre: { fontSize: 9 },
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fechaHoyLarga(): string {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const ahora = new Date();
  return `${pad2(ahora.getDate())} de ${meses[ahora.getMonth()]} de ${ahora.getFullYear()}`;
}

type Datos = Record<string, string | null>;

function g(datos: Datos, campo: string): string {
  return datos[campo]?.trim() || "—";
}

function hayValor(datos: Datos, campo: string): boolean {
  return !!datos[campo]?.trim();
}

// "12/12 ausentes", con las excepciones puntuales listadas aparte --
// nunca las 24 casillas SI/NO literales.
function resumenReflejos(datos: Datos, momento: "1a" | "2a"): { resumen: string; excepciones: string[] } {
  const total = REFLEJOS_ME.length;
  let ausentes = 0;
  const excepciones: string[] = [];
  for (const r of REFLEJOS_ME) {
    const v = datos[reflejoKey(r.key, momento)];
    if (v === "ausente") {
      ausentes++;
    } else if (v === "presente") {
      excepciones.push(`${r.label}: presente`);
    } else {
      excepciones.push(`${r.label}: sin marcar`);
    }
  }
  return { resumen: `${ausentes}/${total} ausentes`, excepciones };
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={s.fila}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <Text style={s.valor}>{valor}</Text>
    </View>
  );
}

function BloqueEvaluacion({ datos, momento, titulo }: { datos: Datos; momento: "1a" | "2a"; titulo: string }) {
  const { resumen, excepciones } = resumenReflejos(datos, momento);
  const diabetesSi = datos[`diabetes_insipida_${momento}_si`] === "si";
  const diabetesNo = datos[`diabetes_insipida_${momento}_no`] === "si";
  const diabetes = diabetesSi ? "Sí" : diabetesNo ? "No" : "—";
  return (
    <View style={s.col}>
      <Text style={{ ...s.negrita, marginBottom: 3 }}>{titulo}</Text>
      <Fila etiqueta="Hora" valor={g(datos, `hora_${momento}`)} />
      <Fila etiqueta="TAM" valor={g(datos, `ta_tam_${momento}`)} />
      <Fila etiqueta="T° central" valor={g(datos, `t_central_${momento}`)} />
      <Fila etiqueta="Diabetes insípida" valor={diabetes} />
      <Fila etiqueta="Pupilas" valor={g(datos, `pupilas_${momento}`)} />
      <Fila etiqueta="Reflejos" valor={resumen} />
      {excepciones.map((e, i) => (
        <Text key={i} style={s.excepcion}>
          • {e}
        </Text>
      ))}
    </View>
  );
}

function BloqueTestConfirmacion({ datos }: { datos: Datos }) {
  const tipo = datos.tipo_test_confirmacion;
  if (tipo === "apnea") {
    const resultado = datos.apneica1_resultado || "positiva";
    const resultadoTexto = resultado === "positiva" ? "Positiva" : resultado === "negativa" ? "Negativa" : "Indeterminada";
    return (
      <>
        <Fila etiqueta="Tipo" valor="Test de apnea" />
        <Fila etiqueta="CO2 inicial / final" valor={`${g(datos, "apneica1_pco2_inicial")} / ${g(datos, "apneica1_pco2_final")} mmHg`} />
        <Fila etiqueta="Duración" valor={g(datos, "apneica1_duracion")} />
        <Fila etiqueta="Resultado" valor={resultadoTexto} />
      </>
    );
  }
  if (tipo === "atropina") {
    return (
      <>
        <Fila etiqueta="Tipo" valor="Test de atropina" />
        <Fila etiqueta="FC inicial / final" valor={`${g(datos, "fc_inicial")} / ${g(datos, "fc_final")} lpm`} />
        <Fila etiqueta="Fecha / hora" valor={`${g(datos, "atropina_fecha")} ${g(datos, "atropina_hora")}`} />
        <Fila etiqueta="Duración" valor={g(datos, "atropina_duracion")} />
      </>
    );
  }
  return <Fila etiqueta="Tipo" valor="No especificado" />;
}

type Props = {
  donante: Donante;
  neuro: Datos;
  doppler: Datos;
  medico1: string;
  medico2: string;
  metodosCompletos: { eeg: boolean; potenciales: boolean; doppler: boolean };
};

function HistoriaClinicaNeurologicaDoc({ donante, neuro, doppler, medico1, medico2, metodosCompletos }: Props) {
  const cumpleMe = neuro.cumple_me_si === "si" ? "Sí" : neuro.cumple_me_no === "si" ? "No" : "—";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.titulo}>Historia clínica neurológica</Text>
        <Text style={s.subtitulo}>Síntesis del examen para diagnóstico de muerte encefálica</Text>
        <Text style={s.encabezado}>
          {donante.nombre_completo || "—"} — DNI {donante.dni || "—"}
          {donante.institucion ? ` — ${donante.institucion}` : ""} — {fechaHoyLarga()}
        </Text>

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Causa del coma</Text>
          <Text style={s.parrafo}>{g(neuro, "causa_coma")}</Text>
        </View>

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Estudios complementarios (TAC u otro método de imagen)</Text>
          <Text style={s.parrafo}>{g(neuro, "estudios_complementarios")}</Text>
        </View>

        {hayValor(neuro, "arm_fecha_hs") && (
          <View style={s.seccion}>
            <Text style={s.seccionTitulo}>ARM obligada desde</Text>
            <Text style={s.parrafo}>{g(neuro, "arm_fecha_hs")}</Text>
          </View>
        )}

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Examen neurológico — 1ª y 2ª evaluación</Text>
          <View style={s.dosCol}>
            <BloqueEvaluacion datos={neuro} momento="1a" titulo="1ª evaluación" />
            <BloqueEvaluacion datos={neuro} momento="2a" titulo="2ª evaluación" />
          </View>
        </View>

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Test de confirmación</Text>
          <BloqueTestConfirmacion datos={neuro} />
        </View>

        {(metodosCompletos.eeg || metodosCompletos.potenciales || metodosCompletos.doppler) && (
          <View style={s.seccion}>
            <Text style={s.seccionTitulo}>Métodos auxiliares</Text>
            {metodosCompletos.eeg && (
              <Fila etiqueta="EEG" valor={`${g(neuro, "eeg1_fecha")} ${g(neuro, "eeg1_hora")} — ${g(neuro, "eeg1_informe")}`} />
            )}
            {metodosCompletos.potenciales && (
              <>
                <Fila
                  etiqueta="Potenciales evocados"
                  valor={`${g(neuro, "potenciales_fecha")} ${g(neuro, "potenciales_hora")}`}
                />
                <Fila etiqueta="PEAT / PESS / PEV" valor={`${g(neuro, "peat")} / ${g(neuro, "pess")} / ${g(neuro, "pev")}`} />
              </>
            )}
            {metodosCompletos.doppler && (
              <Fila
                etiqueta="Doppler transcraneano"
                valor={`${g(doppler, "fecha_dia")}/${g(doppler, "fecha_mes")}/${g(doppler, "fecha_anio")} ${g(doppler, "fecha_hora_top")} — ${g(doppler, "interpretacion_resto")}`}
              />
            )}
          </View>
        )}

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>¿Cumple criterios de muerte encefálica?</Text>
          <Fila etiqueta="Cumple criterios" valor={cumpleMe} />
          {cumpleMe === "No" && <Fila etiqueta="Motivo y conducta" valor={g(neuro, "no_cumple_motivo")} />}
        </View>

        <View style={s.firmaFila}>
          <View style={s.firmaBloque}>
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>{medico1}</Text>
            </View>
          </View>
          <View style={s.firmaBloque}>
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>{medico2}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generarHistoriaClinicaNeurologicaPdf(supabase: SupabaseClient, donante: Donante): Promise<Blob> {
  const [{ data: neuroRows }, { data: certRows }, { data: dopplerRows }, { data: metodosRows }] = await Promise.all([
    supabase.from("planilla_valores").select("campo_pdf, valor").eq("donante_id", donante.id).eq("planilla_key", "neuro"),
    supabase
      .from("planilla_valores")
      .select("campo_pdf, valor")
      .eq("donante_id", donante.id)
      .eq("planilla_key", "certificado")
      .in("campo_pdf", ["medico1_nombre", "medico2_nombre"]),
    supabase.from("planilla_valores").select("campo_pdf, valor").eq("donante_id", donante.id).eq("planilla_key", "doppler"),
    supabase
      .from("documentacion_estado")
      .select("item_key, estado")
      .eq("donante_id", donante.id)
      .eq("categoria", "certificacion")
      .in("item_key", ["eeg", "potenciales_evocados", "doppler_transcraneano"]),
  ]);

  const toMap = (rows: { campo_pdf: string; valor: string | null }[] | null): Datos =>
    Object.fromEntries((rows ?? []).map((r) => [r.campo_pdf, r.valor]));

  const neuro = toMap(neuroRows as { campo_pdf: string; valor: string | null }[] | null);
  const certificado = toMap(certRows as { campo_pdf: string; valor: string | null }[] | null);
  const doppler = toMap(dopplerRows as { campo_pdf: string; valor: string | null }[] | null);
  const metodos = Object.fromEntries(
    ((metodosRows as { item_key: string; estado: string | null }[]) ?? []).map((r) => [r.item_key, r.estado])
  );

  const medico1 = g(certificado, "medico1_nombre");
  const medico2Base = certificado.medico2_nombre?.trim();
  const medico2 = medico2Base ? `Neurólogo/Neurocirujano: ${medico2Base}` : "—";

  return pdf(
    <HistoriaClinicaNeurologicaDoc
      donante={donante}
      neuro={neuro}
      doppler={doppler}
      medico1={medico1}
      medico2={medico2}
      metodosCompletos={{
        eeg: metodos.eeg === "completo",
        potenciales: metodos.potenciales_evocados === "completo",
        doppler: metodos.doppler_transcraneano === "completo",
      }}
    />
  ).toBlob();
}
