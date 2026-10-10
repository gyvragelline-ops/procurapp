// Estado de cada etapa de un donante: lógica pura, con tests. La usan la
// pantalla del procurador (app/page.tsx) y la Base operativa, así nunca
// muestran estados distintos. La marca manual prevalece sobre el cálculo.

import {
  STAGES_MULTIORGANICO,
  computeCertAuxEstado,
  computeComDonacionEstado,
  computeComMuerteEstado,
  computeLabImagenesEstado,
  computeMantenimientoEstado,
  computeMeEstado,
  computeMedidasEstado,
  computeMuestrasEstado,
  computePotencialEstado,
  stagesForTipo,
  type CertAuxCampos,
  type EstadoEtapa,
  type MeCampos,
  type TipoProcuracion,
} from "./constants.ts";
import { estadoEtapaCultivos, type Cultivo } from "./cultivos-calculos.ts";
import { estadoEtapaJudicial, estadoEtapaQuirofano, type HorarioQuirofano } from "./quirofano-calculos.ts";
import { estadoConMarca, type MarcaEtapa } from "./marca-etapa.ts";

export type Etapa = { key: string; label: string };

export type DatosEtapas = {
  donante: { servicio: string | null; pd_numero: string | null; fecha_ingreso: string | null; tipo_procuracion: TipoProcuracion | null };
  judicialAplica: boolean;
  meCampos: MeCampos;
  certAuxCampos: CertAuxCampos;
  comMuerteRealizada: boolean;
  comDonacionRealizada: boolean;
  labImagenesCompleto: boolean; // botón viejo (casos anteriores), solo lectura
  medidasCompleto: boolean; // idem
  mantenimientoCompleto: boolean; // idem
  muestras: { obtenida: boolean }[];
  cultivos: Pick<Cultivo, "estado" | "anulado">[];
  horariosQx: HorarioQuirofano[];
  fotosJudiciales: { tipo: string }[];
  // Fotos de DNI y de grupo y factor (etapa 01). Solo para listar lo que
  // falta: NO cambian el estado de ninguna etapa. undefined = no se cargaron
  // (pantalla del procurador) y no se listan.
  fotosDocumentacion?: { tipo: string }[];
  etapasGuardadas: Record<string, EstadoEtapa>; // etapas_estado.estado (las que no se calculan)
  marcas: Record<string, MarcaEtapa>;
};

// Etapas que se ven, en el orden de Procurapp. Intervención judicial solo
// si aplica, siempre anteúltima.
export function etapasVisibles(tipo: TipoProcuracion | null | undefined, judicialAplica: boolean): Etapa[] {
  const base = stagesForTipo(tipo);
  const sinJudicial = base.filter((s) => s.key !== "judicial");
  if (!judicialAplica) return sinJudicial;
  const judicial = base.find((s) => s.key === "judicial") ?? STAGES_MULTIORGANICO.find((s) => s.key === "judicial");
  if (!judicial) return sinJudicial;
  const con = [...sinJudicial];
  con.splice(con.length - 1, 0, judicial);
  return con;
}

// Estado calculado por los datos (sin la marca manual).
export function estadoCalculadoEtapa(key: string, d: DatosEtapas): EstadoEtapa | undefined {
  switch (key) {
    case "potencial":
      return computePotencialEstado(d.donante);
    case "me":
      return computeMeEstado(d.meCampos);
    case "certificacion":
      return computeCertAuxEstado(d.certAuxCampos);
    case "comMuerte":
      return computeComMuerteEstado(d.comMuerteRealizada);
    case "comDonacion":
      return computeComDonacionEstado(d.comDonacionRealizada);
    case "labImagenes":
      return computeLabImagenesEstado(d.labImagenesCompleto);
    case "medidas":
      return computeMedidasEstado(d.medidasCompleto);
    case "mantenimiento":
      return computeMantenimientoEstado(d.mantenimientoCompleto);
    case "muestras":
      return computeMuestrasEstado(d.muestras);
    case "cultivos":
      return estadoEtapaCultivos(d.cultivos);
    case "quirofano":
      return estadoEtapaQuirofano(d.horariosQx);
    case "judicial":
      return estadoEtapaJudicial(d.fotosJudiciales);
    default:
      return d.etapasGuardadas[key];
  }
}

// Estado visible: el calculado, salvo que haya marca manual.
export function estadoEtapa(key: string, d: DatosEtapas): EstadoEtapa | undefined {
  const m = d.marcas[key];
  const c = estadoCalculadoEtapa(key, d);
  return m ? estadoConMarca(c, m.marca).estado : c;
}
