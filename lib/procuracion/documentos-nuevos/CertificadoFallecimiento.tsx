import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { Donante } from "../types";
import type { ValorCampo } from "../documentos-pdf";

const s = StyleSheet.create({
  page: { padding: "50pt 56pt", fontSize: 11, fontFamily: "Helvetica", color: "#1a1a1a", lineHeight: 1.5 },
  titulo: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 },
  subtitulo: { fontSize: 9, textAlign: "center", color: "#555", marginBottom: 28 },
  parrafo: { marginBottom: 14, textAlign: "justify" },
  negrita: { fontFamily: "Helvetica-Bold" },
  seccion: { marginTop: 20, marginBottom: 8 },
  seccionTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, color: "#555", marginBottom: 8 },
  firmaFila: { flexDirection: "row", justifyContent: "space-between", marginTop: 48 },
  firmaBloque: { width: "44%" },
  firmaLinea: { borderTop: "1pt solid #333", paddingTop: 4 },
  firmaNombre: { fontSize: 10 },
  firmaRol: { fontSize: 8, color: "#666", marginTop: 2 },
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fechaHoyLarga(): string {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const ahora = new Date();
  return `${pad2(ahora.getDate())} de ${meses[ahora.getMonth()]} de ${ahora.getFullYear()}`;
}

function v(valores: Map<string, ValorCampo>, campo: string): string {
  return valores.get(campo)?.valor?.trim() || "—";
}

function sexoTexto(sexo: string | null): string {
  if (sexo === "masculino") return "masculino";
  if (sexo === "femenino") return "femenino";
  return "—";
}

type Props = {
  donante: Donante;
  valores: Map<string, ValorCampo>;
};

function CertificadoFallecimientoDoc({ donante, valores }: Props) {
  const medico1 = v(valores, "medico1_nombre");
  const medico2 = v(valores, "medico2_nombre"); // ya viene con el prefijo "Neurólogo/Neurocirujano: " aplicado en aplicarReglasCertificado
  const archivoLugar = v(valores, "archivo_lugar");
  const hora = donante.me_hora ? donante.me_hora.slice(0, 5) : "—";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.titulo}>Certificado de fallecimiento</Text>
        <Text style={s.subtitulo}>Diagnóstico de muerte encefálica — Ley 24.193 y su reglamentación</Text>

        <Text style={s.parrafo}>
          Certificamos que <Text style={s.negrita}>{donante.nombre_completo || "—"}</Text>, DNI{" "}
          <Text style={s.negrita}>{donante.dni || "—"}</Text>, sexo {sexoTexto(donante.sexo)}
          {donante.institucion ? `, internado/a en ${donante.institucion}` : ""}, falleció el {fechaHoyLarga()} a las{" "}
          <Text style={s.negrita}>{hora}</Text> horas, conforme a los criterios de diagnóstico de muerte encefálica
          establecidos por la normativa vigente.
        </Text>

        <Text style={s.parrafo}>
          La documentación respaldatoria del diagnóstico (examen neurológico, estudios complementarios y protocolo
          correspondiente) se archiva en: <Text style={s.negrita}>{archivoLugar}</Text>.
        </Text>

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Médicos que suscriben</Text>
        </View>

        <View style={s.firmaFila}>
          <View style={s.firmaBloque}>
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>{medico1}</Text>
              <Text style={s.firmaRol}>Médico 1</Text>
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

export async function generarCertificadoFallecimientoPdf(donante: Donante, valores: Map<string, ValorCampo>): Promise<Blob> {
  return pdf(<CertificadoFallecimientoDoc donante={donante} valores={valores} />).toBlob();
}
