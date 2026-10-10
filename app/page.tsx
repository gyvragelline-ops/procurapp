"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardarConReintento } from "@/lib/procuracion/guardar";
import {
  ME_CAMPO_KEYS,
  METODOS_CERT_AUX,
  CERTIFICADO_CIERRE_KEYS,
  DOPPLER_CAMPO_KEYS,
  type EstadoEtapa,
  type MeCampos,
  type CertAuxCampos,
} from "@/lib/procuracion/constants";
import { loadPanel, type PanelContent } from "@/lib/procuracion/panels";
import { MUESTRAS_PAQUETES, generarMuestrasPdfs, combinarMuestrasPdfs, tieneDatosMinimos, firmaDatosBase } from "@/lib/procuracion/muestras-pdf";
import { MuestraIconRow } from "./muestra-icons";
import type { Donante, Familiar, EtapaEstadoRow, MuestraRow, PlanillaGeneradaRow } from "@/lib/procuracion/types";
import PotencialPanel from "./potencial-panel";
import MePanel from "./me-panel";
import CertAuxPanel from "./cert-aux-panel";
import ComMuertePanel from "./com-muerte-panel";
import RecomendacionesComMuerte from "./recomendaciones-com-muerte";
import ComDonacionPanel from "./com-donacion-panel";
import ComDonacionRealizada from "./com-donacion-realizada";
import FamiliarContactoPanel from "./familiar-contacto-panel";
import ImagenesVideosPanel from "./imagenes-videos-panel";
import DocumentosPanel from "./documentos-panel";
import DocumentacionFotosPanel from "./documentacion-fotos-panel";
import MedidasPanel from "./medidas-panel";
import MantenimientoPanel from "./mantenimiento-panel";
import CultivosPanel from "./cultivos-panel";
import AntibioticosPanel from "./antibioticos-panel";
import type { Cultivo } from "@/lib/procuracion/cultivos-calculos";
import QuirofanoPanel from "./quirofano-panel";
import ChatDonante from "./chat-donante";
import EtapaFila from "./etapa-fila";
import FranjaEtapas from "./franja-etapas";
import type { MarcaEtapa } from "@/lib/procuracion/marca-etapa";
import { estadoCalculadoEtapa, estadoEtapa, etapasVisibles, type DatosEtapas } from "@/lib/procuracion/estado-etapas";
import { cargarMarcas } from "@/lib/procuracion/marca-etapa-datos";
import type { HorarioQuirofano } from "@/lib/procuracion/quirofano-calculos";
import type { DocumentacionFotoRow } from "@/lib/procuracion/documentacion-fotos";
import NuevoDonante from "./nuevo-donante";

const EMPTY_ME_CAMPOS: MeCampos = Object.fromEntries(ME_CAMPO_KEYS.map((k) => [k, null]));
const CERT_AUX_KEYS = METODOS_CERT_AUX.map((m) => m.key);
const EMPTY_CERT_AUX_CAMPOS: CertAuxCampos = Object.fromEntries(CERT_AUX_KEYS.map((k) => [k, null]));

const supabase = createClient();

type StageData = { kind: "panel"; loading: boolean; content?: PanelContent };

// Fotos de la etapa Intervención judicial (mismo flujo que Documentación).
const CATEGORIAS_JUDICIAL: { valor: "precario" | "autorizacion_juez"; etiqueta: string }[] = [
  { valor: "precario", etiqueta: "Foto del precario" },
  { valor: "autorizacion_juez", etiqueta: "Foto de la autorización del juez" },
];

export default function Home() {
  const [donantes, setDonantes] = useState<Donante[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [donante, setDonante] = useState<Donante | null>(null);
  const [familiar, setFamiliar] = useState<Familiar | null>(null);
  const [etapas, setEtapas] = useState<Record<string, EstadoEtapa>>({});
  // Marca manual por etapa (prevalece sobre el cálculo). disponible=false
  // si la base todavía no tiene las columnas: la pantalla sigue igual.
  const [marcas, setMarcas] = useState<Record<string, MarcaEtapa>>({});
  const [marcasDisponibles, setMarcasDisponibles] = useState(false);
  const [judicialAplica, setJudicialAplica] = useState(false);
  const [meCampos, setMeCampos] = useState<MeCampos>(EMPTY_ME_CAMPOS);
  const [certAuxCampos, setCertAuxCampos] = useState<CertAuxCampos>(EMPTY_CERT_AUX_CAMPOS);
  const [dopplerCampos, setDopplerCampos] = useState<Record<string, string | null>>({});
  const [angiografiaMeta, setAngiografiaMeta] = useState<{ fecha?: string; hora?: string; informe?: string }>({});
  const [comMuerteRealizada, setComMuerteRealizada] = useState(false);
  const [comDonacionRealizada, setComDonacionRealizada] = useState(false);
  const [labImagenesCompleto, setLabImagenesCompleto] = useState(false);
  const [medidasCompleto, setMedidasCompleto] = useState(false);
  const [mantenimientoCompleto, setMantenimientoCompleto] = useState(false);
  const [muestras, setMuestras] = useState<MuestraRow[]>([]);
  const [cultivos, setCultivos] = useState<Cultivo[]>([]);
  const [horariosQx, setHorariosQx] = useState<HorarioQuirofano[]>([]);
  const [fotosJudiciales, setFotosJudiciales] = useState<{ tipo: string }[]>([]);
  const [planillasGeneradas, setPlanillasGeneradas] = useState<Record<string, PlanillaGeneradaRow>>({});
  const [generandoPdfs, setGenerandoPdfs] = useState(false);
  const [combinandoPdfs, setCombinandoPdfs] = useState(false);
  const [descargaError, setDescargaError] = useState<string | null>(null);
  const [mostrarIndividual, setMostrarIndividual] = useState(false);
  const lastFirmaGenerada = useRef<Record<string, string>>({});
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [stageData, setStageData] = useState<Record<string, StageData>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);

  function refreshDonantes() {
    return supabase
      .from("donantes")
      .select(
        "id, pd_numero, folio_numero, nombre_completo, dni, fecha_nacimiento, edad, sexo, grupo_sanguineo, grupo_confirmado, peso, talla, cama, institucion, localidad, servicio, denunciante, fecha_ingreso, me_hora, causa_muerte, estado_general, tipo_procuracion, created_at"
      )
      .order("created_at", { ascending: false })
      .then(({ data }) => setDonantes((data as Donante[]) ?? []));
  }

  useEffect(() => {
    refreshDonantes();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingDetail(true);
    setOpenStage(null);
    setMarcas({});
    cargarMarcas(supabase, selectedId).then((r) => {
      setMarcas(r.marcas);
      setMarcasDisponibles(r.disponible);
    });
    setStageData({});
    // Se olvida cualquier generación previa de PDFs de Muestras al entrar
    // a este caso, para que el efecto de más abajo regenere siempre con
    // el motor vigente -- sin esto, si el caso ya se había abierto antes
    // en esta misma pestaña (aunque haya sido con una versión anterior
    // del motor, antes de un redeploy), quedaba sirviendo los PDFs viejos
    // guardados en Storage sin volver a generarlos.
    delete lastFirmaGenerada.current[selectedId];

    Promise.all([
      supabase.from("donantes").select("*").eq("id", selectedId).single(),
      supabase.from("familiares").select("*").eq("donante_id", selectedId).limit(1).maybeSingle(),
      supabase.from("etapas_estado").select("etapa_key, estado").eq("donante_id", selectedId),
      supabase
        .from("documentacion_estado")
        .select("estado")
        .eq("donante_id", selectedId)
        .eq("categoria", "judicial")
        .eq("item_key", "aplica")
        .maybeSingle(),
      supabase
        .from("planilla_valores")
        .select("campo_pdf, valor")
        .eq("donante_id", selectedId)
        .eq("planilla_key", "neuro")
        .in("campo_pdf", ME_CAMPO_KEYS),
      supabase
        .from("planilla_valores")
        .select("campo_pdf, valor")
        .eq("donante_id", selectedId)
        .eq("planilla_key", "certificado")
        .in("campo_pdf", CERTIFICADO_CIERRE_KEYS),
      supabase
        .from("planilla_valores")
        .select("campo_pdf, valor")
        .eq("donante_id", selectedId)
        .eq("planilla_key", "doppler")
        .in("campo_pdf", DOPPLER_CAMPO_KEYS),
      supabase
        .from("documentacion_estado")
        .select("item_key, estado, meta")
        .eq("donante_id", selectedId)
        .eq("categoria", "certificacion")
        .in("item_key", CERT_AUX_KEYS),
      supabase
        .from("documentacion_estado")
        .select("estado")
        .eq("donante_id", selectedId)
        .eq("categoria", "comMuerte")
        .eq("item_key", "realizada")
        .maybeSingle(),
      supabase
        .from("documentacion_estado")
        .select("estado")
        .eq("donante_id", selectedId)
        .eq("categoria", "comDonacion")
        .eq("item_key", "realizada")
        .maybeSingle(),
      supabase
        .from("documentacion_estado")
        .select("estado")
        .eq("donante_id", selectedId)
        .eq("categoria", "labImagenes")
        .eq("item_key", "completo")
        .maybeSingle(),
      supabase
        .from("documentacion_estado")
        .select("estado")
        .eq("donante_id", selectedId)
        .eq("categoria", "medidas")
        .eq("item_key", "completo")
        .maybeSingle(),
      supabase
        .from("documentacion_estado")
        .select("estado")
        .eq("donante_id", selectedId)
        .eq("categoria", "mantenimiento")
        .eq("item_key", "completo")
        .maybeSingle(),
      supabase
        .from("planillas_generadas")
        .select("planilla_key, archivo_url, generado_en")
        .eq("donante_id", selectedId)
        .order("generado_en", { ascending: false }),
      supabase.from("muestras").select("paquete_key, nombre, tubos, obtenida, retirada").eq("donante_id", selectedId),
      supabase
        .from("cultivos")
        .select("id, tipo, tipo_otro, tomado_en, estado, germen, sensibilidad, resultado_en, modificado_en, anulado")
        .eq("donante_id", selectedId)
        .order("tomado_en", { ascending: false }),
      supabase.from("quirofano_horarios").select("id, hora, registrado_en, anulado").eq("donante_id", selectedId).order("registrado_en"),
      supabase.from("documentacion_fotos").select("tipo").eq("donante_id", selectedId).in("tipo", ["precario", "autorizacion_juez"]),
    ]).then(([donanteRes, familiarRes, etapasRes, judicialRes, meRes, certificadoCierreRes, dopplerRes, certAuxRes, comMuerteRes, comDonacionRes, labImagenesRes, medidasRes, mantenimientoRes, planillasRes, muestrasRes, cultivosRes, horariosQxRes, fotosJudicialesRes]) => {
      const donanteData = (donanteRes.data as Donante) ?? null;
      setDonante(donanteData);
      setFamiliar((familiarRes.data as Familiar) ?? null);
      const map: Record<string, EstadoEtapa> = {};
      ((etapasRes.data as EtapaEstadoRow[]) ?? []).forEach((r) => {
        map[r.etapa_key] = r.estado;
      });
      setEtapas(map);
      setJudicialAplica((judicialRes.data as { estado: string | null } | null)?.estado === "si");
      const meMap = { ...EMPTY_ME_CAMPOS };
      ((meRes.data as { campo_pdf: string; valor: string | null }[]) ?? []).forEach((r) => {
        (meMap as Record<string, string | null>)[r.campo_pdf] = r.valor;
      });
      ((certificadoCierreRes.data as { campo_pdf: string; valor: string | null }[]) ?? []).forEach((r) => {
        (meMap as Record<string, string | null>)[r.campo_pdf] = r.valor;
      });
      setMeCampos(meMap);
      const dopplerMap: Record<string, string | null> = {};
      ((dopplerRes.data as { campo_pdf: string; valor: string | null }[]) ?? []).forEach((r) => {
        dopplerMap[r.campo_pdf] = r.valor;
      });
      setDopplerCampos(dopplerMap);
      const certAuxMap = { ...EMPTY_CERT_AUX_CAMPOS };
      const certAuxRows = (certAuxRes.data as { item_key: string; estado: string | null; meta: Record<string, unknown> | null }[]) ?? [];
      certAuxRows.forEach((r) => {
        (certAuxMap as Record<string, string | null>)[r.item_key] = r.estado;
      });
      setCertAuxCampos(certAuxMap);
      const angioRow = certAuxRows.find((r) => r.item_key === "angiografia_cerebral");
      setAngiografiaMeta((angioRow?.meta as { fecha?: string; hora?: string; informe?: string } | null) ?? {});
      setComMuerteRealizada((comMuerteRes.data as { estado: string | null } | null)?.estado === "si");
      setComDonacionRealizada((comDonacionRes.data as { estado: string | null } | null)?.estado === "si");
      setLabImagenesCompleto((labImagenesRes.data as { estado: string | null } | null)?.estado === "si");
      setMedidasCompleto((medidasRes.data as { estado: string | null } | null)?.estado === "si");
      setMantenimientoCompleto((mantenimientoRes.data as { estado: string | null } | null)?.estado === "si");
      const planillasMap: Record<string, PlanillaGeneradaRow> = {};
      ((planillasRes.data as PlanillaGeneradaRow[]) ?? []).forEach((r) => {
        if (!planillasMap[r.planilla_key]) planillasMap[r.planilla_key] = r;
      });
      setPlanillasGeneradas(planillasMap);
      setMuestras((muestrasRes.data as MuestraRow[]) ?? []);
      setCultivos((cultivosRes.data as Cultivo[]) ?? []);
      setHorariosQx((horariosQxRes.data as HorarioQuirofano[]) ?? []);
      setFotosJudiciales((fotosJudicialesRes.data as { tipo: string }[]) ?? []);
      setLoadingDetail(false);
    });
  }, [selectedId]);

  useEffect(() => {
    if (!donante || !tieneDatosMinimos(donante)) return;
    const firma = firmaDatosBase(donante);
    if (lastFirmaGenerada.current[donante.id] === firma) return;
    lastFirmaGenerada.current[donante.id] = firma;
    setGenerandoPdfs(true);
    generarMuestrasPdfs(supabase, donante)
      // Si alguno no se pudo generar, se muestra (antes se salteaba en
      // silencio) y se borra la firma para que se reintente la próxima
      // vez que se abra el donante. Las que sí salieron se cargan igual.
      .catch((e) => {
        delete lastFirmaGenerada.current[donante.id];
        setDescargaError(e instanceof Error ? e.message : "No se pudieron generar los formularios.");
      })
      .then(() =>
        supabase
          .from("planillas_generadas")
          .select("planilla_key, archivo_url, generado_en")
          .eq("donante_id", donante.id)
          .order("generado_en", { ascending: false })
      )
      .then(({ data }) => {
        const map: Record<string, PlanillaGeneradaRow> = {};
        ((data as PlanillaGeneradaRow[]) ?? []).forEach((r) => {
          if (!map[r.planilla_key]) map[r.planilla_key] = r;
        });
        setPlanillasGeneradas(map);
      })
      .finally(() => setGenerandoPdfs(false));
  }, [donante]);

  const prellenables = MUESTRAS_PAQUETES.filter((p) => p.prellenable);
  const todosPrellenadosListos = prellenables.every((p) => planillasGeneradas[p.key]?.archivo_url);

  async function descargarEImprimir() {
    if (!donante || !todosPrellenadosListos) return;
    setCombinandoPdfs(true);
    setDescargaError(null);
    try {
      const urls = [
        ...prellenables.map((p) => planillasGeneradas[p.key].archivo_url as string),
        "/forms/solicitud_covid.pdf",
      ];
      const bytes = await combinarMuestrasPdfs(urls);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      // La descarga es la acción garantizada (mismo mecanismo que ya
      // funcionaba antes). Abrir además una pestaña con el PDF es una
      // mejora best-effort para verlo/imprimirlo directo -- si el
      // navegador la bloquea, la descarga ya se hizo igual.
      const a = document.createElement("a");
      a.href = url;
      a.download = `muestras_${donante.pd_numero ?? donante.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.open(url, "_blank");
    } catch (err) {
      setDescargaError(err instanceof Error ? err.message : "No se pudo generar el PDF combinado.");
    } finally {
      setCombinandoPdfs(false);
    }
  }

  async function toggleObtenida(paqueteKey: string, actual: boolean) {
    if (!donante) return;
    const nuevo = !actual;
    setMuestras((prev) => prev.map((m) => (m.paquete_key === paqueteKey ? { ...m, obtenida: nuevo } : m)));
    const r = await guardarConReintento(() =>
      supabase.from("muestras").update({ obtenida: nuevo }).eq("donante_id", donante.id).eq("paquete_key", paqueteKey)
    );
    if (!r.ok) {
      setMuestras((prev) => prev.map((m) => (m.paquete_key === paqueteKey ? { ...m, obtenida: actual } : m)));
      setDescargaError(r.mensaje);
      return;
    }
    setDescargaError(null);
  }

  async function marcarTodasObtenidas() {
    if (!donante) return;
    const anteriores = muestras;
    setMuestras((prev) => prev.map((m) => ({ ...m, obtenida: true })));
    const r = await guardarConReintento(() => supabase.from("muestras").update({ obtenida: true }).eq("donante_id", donante.id));
    if (!r.ok) {
      setMuestras(anteriores);
      setDescargaError(r.mensaje);
      return;
    }
    setDescargaError(null);
  }

  // Estados de etapa: misma función que la Base operativa
  // (lib/procuracion/estado-etapas.ts). La marca manual prevalece.
  const datosEtapas: DatosEtapas | null = donante
    ? {
        donante,
        judicialAplica,
        meCampos,
        certAuxCampos,
        comMuerteRealizada,
        comDonacionRealizada,
        labImagenesCompleto,
        medidasCompleto,
        mantenimientoCompleto,
        muestras,
        cultivos,
        horariosQx,
        fotosJudiciales,
        etapasGuardadas: etapas,
        marcas,
      }
    : null;
  function getEtapaEstado(key: string): EstadoEtapa | undefined {
    return datosEtapas ? estadoEtapa(key, datosEtapas) : etapas[key];
  }
  function estadoCalculado(key: string): EstadoEtapa | undefined {
    return datosEtapas ? estadoCalculadoEtapa(key, datosEtapas) : etapas[key];
  }

  const visibleStages = useMemo(() => etapasVisibles(donante?.tipo_procuracion, judicialAplica), [judicialAplica, donante?.tipo_procuracion]);

  function irAEtapa(key: string) {
    setOpenStage(key);
    requestAnimationFrame(() => document.getElementById(`etapa-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function handleOpenStage(key: string) {
    if (openStage === key) {
      setOpenStage(null);
      return;
    }
    setOpenStage(key);
    if (
      key === "potencial" ||
      key === "me" ||
      key === "certificacion" ||
      key === "comMuerte" ||
      key === "comDonacion" ||
      key === "muestras" ||
      key === "medidas" ||
      key === "labImagenes" ||
      key === "cultivos" ||
      key === "mantenimiento" ||
      key === "judicial" ||
      key === "quirofano" ||
      stageData[key] ||
      !donante
    )
      return;

    setStageData((s) => ({ ...s, [key]: { kind: "panel", loading: true } }));
    const content = await loadPanel(supabase, key, donante);
    setStageData((s) => ({ ...s, [key]: { kind: "panel", loading: false, content } }));
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21s-7.5-4.6-10-9.5C.3 7.8 2.6 4 6.2 4c2 0 3.4 1 4.8 2.6C12.4 5 13.8 4 15.8 4c3.6 0 5.9 3.8 4.2 7.5C17.5 16.4 12 21 12 21z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div className="brand-text">Procuración</div>
            <div className="brand-sub">vista procurador</div>
          </div>
        </div>
        {selectedId && (
          <button
            className="btn"
            style={{ padding: "6px 10px", fontSize: "11.5px" }}
            onClick={() => setSelectedId(null)}
          >
            Cambiar potencial donante
          </button>
        )}
      </div>

      <main className="app-shell flex-1">
        {!selectedId && !creating && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div className="section-label" style={{ marginBottom: 0 }}>
                Potenciales donantes
              </div>
              <button className="btn btn-accent btn-sm" onClick={() => setCreating(true)}>
                + Nuevo potencial donante
              </button>
            </div>
            {donantes === null && <div className="empty-hint">Cargando…</div>}
            {donantes !== null && donantes.length === 0 && (
              <div className="empty-hint">No hay potenciales donantes cargados todavía.</div>
            )}
            {donantes !== null && donantes.length > 0 && (
              <div className="donor-list">
                {donantes.map((d) => (
                  <div key={d.id} className="donor-row" onClick={() => setSelectedId(d.id)}>
                    <div className="donor-row-top">
                      <span className="donor-row-id">{d.nombre_completo || "Sin nombre"}</span>
                      {d.estado_general && <span className="chip chip-gray">{d.estado_general}</span>}
                    </div>
                    <div className="donor-row-sub">
                      {[
                        d.dni && `DNI ${d.dni}`,
                        d.institucion,
                        d.pd_numero && `PD ${d.pd_numero}`,
                        d.tipo_procuracion === "corneas" ? "Solo córneas" : d.tipo_procuracion === "multiorganico" ? "Multiorgánico" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!selectedId && creating && (
          <NuevoDonante
            onCancel={() => setCreating(false)}
            onCreated={async (id) => {
              setCreating(false);
              await refreshDonantes();
              setSelectedId(id);
            }}
          />
        )}

        {selectedId && loadingDetail && <div className="empty-hint">Cargando potencial donante…</div>}

        {selectedId && !loadingDetail && donante && (
          <>
            <div className="donor-head">
              <div>
                <div className="donor-id">{donante.nombre_completo || "Sin nombre"}</div>
                <div className="donor-meta">
                  {[donante.institucion, donante.pd_numero && `PD Nº ${donante.pd_numero}`].filter(Boolean).join(" · ") || "—"}
                </div>
                <div className="donor-meta">
                  {[
                    donante.dni && `DNI ${donante.dni}`,
                    donante.edad != null && `${donante.edad} años`,
                    donante.sexo,
                    donante.grupo_sanguineo,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>
            </div>

            {/* Chat con la Base: botón fijo abajo a la derecha (no tapa la
                franja de estado); el globito de sin leer es el único aviso
                permitido fuera de las etapas. */}
            <ChatDonante key={donante.id} donanteId={donante.id} />

            {/* Franja de luces (una línea); tocar una abre esa etapa. */}
            <FranjaEtapas etapas={visibleStages} estadoDe={getEtapaEstado} onIr={irAEtapa} />

            <div className="section-label" style={{ marginTop: 18 }}>
              Línea de tiempo del caso
            </div>
            <div className="stage-rail">
              {visibleStages.map((s, idx) => {
                const data = stageData[s.key];
                return (
                  // Contenedor común: encabezado + contenido + marca manual al final.
                  <EtapaFila
                    key={s.key}
                    etapa={s}
                    numero={idx + 1}
                    donanteId={donante.id}
                    calculado={estadoCalculado(s.key)}
                    marca={marcas[s.key]}
                    marcasDisponibles={marcasDisponibles}
                    abierta={openStage === s.key}
                    onAlternar={() => handleOpenStage(s.key)}
                    onMarca={(m) =>
                      setMarcas((prev) => {
                        const sig = { ...prev };
                        if (m) sig[s.key] = m;
                        else delete sig[s.key];
                        return sig;
                      })
                    }
                  >
                        {s.key === "documentacion" && (
                          <div className="field-row" style={{ fontWeight: 600, color: "var(--text)", borderBottom: "1px solid var(--border-soft)", marginBottom: 6 }}>
                            Imprimí y adjuntá a la historia clínica.
                          </div>
                        )}

                        {s.key === "potencial" && donante && (
                          <PotencialPanel
                            donante={donante}
                            judicialAplica={judicialAplica}
                            onDonanteChange={setDonante}
                            onJudicialChange={setJudicialAplica}
                          />
                        )}

                        {s.key === "me" && donante && (
                          <MePanel donanteId={donante.id} campos={meCampos} onChange={setMeCampos} />
                        )}

                        {s.key === "certificacion" && donante && (
                          <CertAuxPanel
                            donanteId={donante.id}
                            campos={certAuxCampos}
                            onChange={setCertAuxCampos}
                            neuroDetalle={meCampos}
                            onNeuroDetalleChange={setMeCampos}
                            dopplerDetalle={dopplerCampos}
                            onDopplerDetalleChange={setDopplerCampos}
                            angiografiaMeta={angiografiaMeta}
                            onAngiografiaMetaChange={setAngiografiaMeta}
                          />
                        )}

                        {s.key === "comMuerte" && donante && (
                          <>
                            <ComMuertePanel
                              donanteId={donante.id}
                              realizada={comMuerteRealizada}
                              onChange={setComMuerteRealizada}
                            />
                            <RecomendacionesComMuerte />
                          </>
                        )}

                        {s.key === "comDonacion" && donante && (
                          <>
                            <ComDonacionRealizada
                              donanteId={donante.id}
                              realizada={comDonacionRealizada}
                              onChange={setComDonacionRealizada}
                            />
                            <ComDonacionPanel donanteId={donante.id} />
                            <FamiliarContactoPanel donanteId={donante.id} familiar={familiar} onChange={setFamiliar} />
                          </>
                        )}

                        {s.key !== "potencial" &&
                          s.key !== "me" &&
                          s.key !== "certificacion" &&
                          s.key !== "comMuerte" &&
                          s.key !== "comDonacion" &&
                          s.key !== "muestras" &&
                          s.key !== "medidas" &&
                          s.key !== "labImagenes" &&
                          data?.loading && <div className="tiny">Cargando…</div>}

                        {data?.kind === "panel" && !data.loading && data.content && (
                          <>
                            {data.content.rows.map((r, i) => (
                              <div className={r.chip ? "check-row" : "field-row"} key={r.label + i}>
                                <span className={r.chip ? "" : "field-label"}>{r.label}</span>
                                {r.chip ? (
                                  <span className={`chip chip-${r.chip.tone}`}>{r.chip.text}</span>
                                ) : (
                                  <span className="field-value">{r.value ?? "—"}</span>
                                )}
                              </div>
                            ))}
                            {data.content.rows.length === 0 && !data.content.note && (
                              <div className="tiny">Sin datos cargados todavía.</div>
                            )}
                            {data.content.note && <div className="tiny" style={{ marginTop: data.content.rows.length ? 8 : 0 }}>{data.content.note}</div>}
                          </>
                        )}

                        {/* Las fotos de DNI y de grupo y factor se cargan ahora en 01 Potencial donante. */}
                        {s.key === "documentacion" && donante && <DocumentosPanel donante={donante} familiar={familiar} />}

                        {s.key === "muestras" && donante && (
                          <>
                            {muestras.length === 0 && <div className="tiny">Sin paquetes de muestra cargados.</div>}
                            {generandoPdfs && <div className="tiny" style={{ marginBottom: 8 }}>Generando formularios prellenados…</div>}

                            {muestras.length > 0 && (
                              <button
                                className="btn btn-accent"
                                style={{ width: "100%", marginBottom: 8 }}
                                disabled={!todosPrellenadosListos || combinandoPdfs}
                                onClick={descargarEImprimir}
                              >
                                {combinandoPdfs
                                  ? "Preparando…"
                                  : todosPrellenadosListos
                                    ? "Descargar e imprimir"
                                    : "Generando formularios…"}
                              </button>
                            )}
                            {descargaError && (
                              <div className="tiny" style={{ color: "var(--red)", marginBottom: 8 }}>
                                {descargaError}
                              </div>
                            )}

                            {muestras.length > 0 && (
                              <button
                                className="btn btn-sm"
                                style={{ width: "100%", marginBottom: 10 }}
                                onClick={marcarTodasObtenidas}
                              >
                                Marcar todos como obtenidos
                              </button>
                            )}

                            {muestras.map((m) => (
                              <div className="field-row" key={m.paquete_key} style={{ paddingTop: 4, paddingBottom: 4 }}>
                                <span className="field-label" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <span>{m.nombre}</span>
                                  <MuestraIconRow paqueteKey={m.paquete_key} />
                                </span>
                                <button
                                  className={`chip ${m.obtenida ? "chip-green" : "chip-gray"}`}
                                  style={{ border: "none", cursor: "pointer" }}
                                  onClick={() => toggleObtenida(m.paquete_key, m.obtenida)}
                                >
                                  {m.obtenida ? "Obtenida" : "Pendiente"}
                                </button>
                              </div>
                            ))}

                            {muestras.length > 0 && (
                              <div className="tiny" style={{ marginTop: 8 }}>
                                {muestras.filter((m) => m.obtenida).length}/{muestras.length} paquetes obtenidos · se
                                retiran todos juntos, en una sola vez.
                              </div>
                            )}

                            {muestras.length > 0 && (
                              <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border-soft)" }}>
                                <span
                                  className="tiny"
                                  style={{ cursor: "pointer", color: "var(--accent)" }}
                                  onClick={() => setMostrarIndividual((v) => !v)}
                                >
                                  {mostrarIndividual ? "Ocultar descargas individuales ▾" : "Descargar formularios individualmente ▸"}
                                </span>
                                {mostrarIndividual && (
                                  <div style={{ marginTop: 6 }}>
                                    {muestras.map((m) => {
                                      const paquete = MUESTRAS_PAQUETES.find((p) => p.key === m.paquete_key);
                                      const generado = planillasGeneradas[m.paquete_key];
                                      return (
                                        <div key={m.paquete_key} className="tiny" style={{ marginBottom: 3 }}>
                                          {m.nombre}:{" "}
                                          {paquete && (
                                            <a href={`/forms/${paquete.archivo}`} target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>
                                              formulario en blanco
                                            </a>
                                          )}
                                          {generado?.archivo_url && (
                                            <>
                                              {" · "}
                                              <a href={generado.archivo_url} target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>
                                                descargar prellenado
                                              </a>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {s.key === "medidas" && donante && (
                          <MedidasPanel
                            donante={donante}
                            onDonanteChange={setDonante}
                          />
                        )}

                        {s.key === "mantenimiento" && donante && (
                          <MantenimientoPanel
                            donante={donante}
                            onDonanteChange={setDonante}
                            cultivos={cultivos}
                            onIrACultivos={() => irAEtapa("cultivos")}
                          />
                        )}

                        {s.key === "cultivos" && donante && (
                          <>
                            <CultivosPanel donanteId={donante.id} cultivos={cultivos} onChange={setCultivos} />
                            <AntibioticosPanel donanteId={donante.id} />
                          </>
                        )}

                        {s.key === "judicial" && donante && (
                          <DocumentacionFotosPanel
                            donanteId={donante.id}
                            categorias={CATEGORIAS_JUDICIAL}
                            conRol
                            onFotosChange={(f: DocumentacionFotoRow[]) => setFotosJudiciales(f.filter((x) => x.tipo === "precario" || x.tipo === "autorizacion_juez"))}
                          />
                        )}

                        {s.key === "quirofano" && donante && (
                          <QuirofanoPanel donanteId={donante.id} horarios={horariosQx} onHorariosChange={setHorariosQx} />
                        )}

                        {s.key === "labImagenes" && donante && (
                          <ImagenesVideosPanel donanteId={donante.id} />
                        )}
                  </EtapaFila>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
