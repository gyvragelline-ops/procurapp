"use client";

// PDF de la ficha por equipo (A4, vectorial: texto seleccionable, Inter
// embebida, imágenes en JPEG comprimido). Lo carga la ficha con import()
// dinámico: @react-pdf/renderer no pesa en la carga inicial de la Base.
// Librería: @react-pdf/renderer (ya usada en la Historia Clínica): arma el
// PDF con texto vectorial y fuentes embebidas a partir de componentes.

import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { FichaArmada } from "@/lib/procuracion/ficha";

let fuentesListas = false;
function registrarFuentes() {
  if (fuentesListas) return;
  const o = window.location.origin;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${o}/fonts/pdf/inter-400.woff`, fontWeight: 400 },
      { src: `${o}/fonts/pdf/inter-600.woff`, fontWeight: 600 },
      { src: `${o}/fonts/pdf/inter-700.woff`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((p) => [p]); // sin cortar palabras
  fuentesListas = true;
}

const FONDO = "#041821";
const MENTA = "#3FE0B0";
const VERDE = "#0F8F83";
const AMBAR = "#B4720A";
const GRIS = "#5E7378";

const s = StyleSheet.create({
  pagina: { fontFamily: "Inter", fontSize: 9.5, color: "#1B2A2E", paddingBottom: 62 },
  cab: { backgroundColor: FONDO, paddingVertical: 16, paddingHorizontal: 28, flexDirection: "row", alignItems: "center" },
  simbolo: { width: 62, height: 57, marginRight: 14 },
  cabMedio: { flexGrow: 1 },
  marca: { color: MENTA, fontSize: 8, fontWeight: 700, letterSpacing: 0.8 },
  equipo: { color: "#FFFFFF", fontSize: 21, fontWeight: 700, marginTop: 2 },
  pd: { color: "#D5E4E2", fontSize: 9, marginTop: 4 },
  cabDer: { alignItems: "flex-end" },
  version: { color: MENTA, fontSize: 10, fontWeight: 700 },
  cabDato: { color: "#D5E4E2", fontSize: 8.5, marginTop: 2 },
  prueba: { marginTop: 5, backgroundColor: "#C98512", color: "#FFFFFF", fontSize: 8, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3 },
  cuerpo: { paddingHorizontal: 28, paddingTop: 10 },
  seccion: { marginTop: 10 },
  seccionTitulo: { color: VERDE, fontSize: 8, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", borderBottomWidth: 0.6, borderBottomColor: "#D9E1E3", paddingBottom: 3, marginBottom: 3 },
  fila: { flexDirection: "row", paddingVertical: 2.5 },
  etiqueta: { width: 180, color: GRIS },
  valorCol: { flex: 1 },
  valor: { fontWeight: 600 },
  valorEditado: { fontWeight: 600, color: AMBAR },
  editado: { color: AMBAR, fontSize: 7.5, marginTop: 1 },
  nota: { color: GRIS, fontSize: 7.5, marginTop: 1 },
  imagenes: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  imagenCaja: { width: 250, marginRight: 12, marginBottom: 10 },
  imagen: { width: 250, height: 180, objectFit: "contain", backgroundColor: "#0E1A1F" },
  imagenPie: { fontSize: 8, color: GRIS, marginTop: 3 },
  video: { width: 250, borderWidth: 0.8, borderColor: "#D9E1E3", borderRadius: 4, padding: 8, marginRight: 12, marginBottom: 10 },
  videoTitulo: { fontWeight: 600 },
  qr: { marginTop: 6, width: 70, height: 70, borderWidth: 0.8, borderColor: "#9AAAAE", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  qrTexto: { fontSize: 6.5, color: GRIS, textAlign: "center", paddingHorizontal: 4 },
  lista: { color: AMBAR },
  cambios: {},
  pie: { position: "absolute", left: 28, right: 28, bottom: 18, borderTopWidth: 0.6, borderTopColor: "#D9E1E3", paddingTop: 5, fontSize: 7.5, color: GRIS },
  pieFila: { flexDirection: "row", justifyContent: "space-between" },
});

export type ImagenesPdf = Record<string, string>; // id del estudio -> data URL JPEG

function FichaPdf({ f, imagenes, simbolo }: { f: FichaArmada; imagenes: ImagenesPdf; simbolo: string }) {
  const fijas = f.imagenes.filter((i) => i.enPdf && imagenes[i.id]);
  const videos = f.imagenes.filter((i) => i.video);
  return (
    <Document title={`${f.pd} · Ficha ${f.equipo} · v${f.version}`} author="Procurapp · Base operativa" subject={`Ficha ${f.organo}`} creator="Procurapp" producer="Procurapp">
      <Page size="A4" style={s.pagina}>
        <View style={s.cab} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={simbolo} style={s.simbolo} />
          <View style={s.cabMedio}>
            <Text style={s.marca}>PROCURAPP · FICHA</Text>
            <Text style={s.equipo}>{f.equipo}</Text>
            <Text style={s.pd}>{[f.pd, f.prueba ? "PRUEBA" : null, f.edadSexo].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={s.cabDer}>
            <Text style={s.version}>VERSIÓN {f.version}</Text>
            {f.datosHasta && <Text style={s.cabDato}>Datos hasta {f.datosHasta}</Text>}
            <Text style={s.cabDato}>Generado {f.generado}</Text>
            {f.prueba && <Text style={s.prueba}>PRUEBA</Text>}
          </View>
        </View>

        <View style={s.cuerpo}>
          {f.secciones.map((sec) => (
            <View key={sec.titulo} style={s.seccion} wrap={false}>
              <Text style={s.seccionTitulo}>{sec.titulo}</Text>
              {sec.filas.map((r, i) => (
                <View key={i} style={s.fila}>
                  <Text style={s.etiqueta}>{r.etiqueta}</Text>
                  <View style={s.valorCol}>
                    <Text style={r.editado ? s.valorEditado : s.valor}>{r.valor}</Text>
                    {r.editado && <Text style={s.editado}>{r.editado}</Text>}
                    {r.nota && <Text style={s.nota}>{r.nota}</Text>}
                  </View>
                </View>
              ))}
            </View>
          ))}

          {(fijas.length > 0 || videos.length > 0) && (
            <View style={s.seccion}>
              <Text style={s.seccionTitulo}>Imágenes</Text>
              <View style={s.imagenes}>
                {fijas.map((i) => (
                  <View key={i.id} style={s.imagenCaja} wrap={false}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={imagenes[i.id]} style={s.imagen} />
                    <Text style={s.imagenPie}>
                      {i.etiqueta} · {i.cuando}
                    </Text>
                  </View>
                ))}
                {videos.map((i) => (
                  <View key={i.id} style={s.video} wrap={false}>
                    <Text style={s.videoTitulo}>
                      {i.etiqueta} · {i.cuando}
                    </Text>
                    <Text style={s.nota}>Video, en enlace seguro aparte (no va dentro del PDF).</Text>
                    <View style={s.qr}>
                      <Text style={s.qrTexto}>Enlace disponible al enviar</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {f.pendientes.length > 0 && (
            <View style={s.seccion} wrap={false}>
              <Text style={s.seccionTitulo}>Pendiente</Text>
              <Text style={s.lista}>{f.pendientes.join(" · ")}</Text>
            </View>
          )}
          {f.aVerificar.length > 0 && (
            <View style={s.seccion} wrap={false}>
              <Text style={s.seccionTitulo}>A verificar (no se envía el valor)</Text>
              <Text style={s.lista}>{f.aVerificar.join(" · ")}</Text>
            </View>
          )}
          {f.cambios && (
            <View style={s.seccion} wrap={false}>
              <Text style={s.seccionTitulo}>
                Cambios respecto de la versión {f.cambios.desde} ({f.cambios.en})
              </Text>
              <Text style={s.cambios}>{f.cambios.lista.join(" · ")}</Text>
            </View>
          )}
        </View>

        <View style={s.pie} fixed>
          <View style={s.pieFila}>
            <Text>{f.pie.join("   ")}</Text>
          </View>
          <View style={s.pieFila}>
            <Text>Procurapp · Procuración y Trasplante · Argentina</Text>
            <Text render={({ pageNumber, totalPages }) => `${f.pd} · v${f.version} · página ${pageNumber} de ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generarPdfFicha(f: FichaArmada, imagenes: ImagenesPdf): Promise<Blob> {
  registrarFuentes();
  const simbolo = `${window.location.origin}/brand/simbolo-240.png`;
  return pdf(<FichaPdf f={f} imagenes={imagenes} simbolo={simbolo} />).toBlob();
}
