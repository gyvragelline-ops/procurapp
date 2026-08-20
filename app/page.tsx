"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  STAGES_MULTIORGANICO,
  STRIP_LABELS,
  dotClass,
  chipClass,
  stageLabel,
  humanizeCampo,
  computePotencialEstado,
  computeMeEstado,
  computeCertAuxEstado,
  computeComMuerteEstado,
  computeComDonacionEstado,
  computeMuestrasEstado,
  stagesForTipo,
  stripStagesForTipo,
  ME_CAMPO_KEYS,
  METODOS_CERT_AUX,
  type EstadoEtapa,
  type MeCampos,
  type CertAuxCampos,
} from "@/lib/procuracion/constants";
import { loadPanel, ORGANO_EMOJI, type PanelContent } from "@/lib/procuracion/panels";
import { MUESTRAS_PAQUETES, generarMuestrasPdfs, combinarMuestrasPdfs, tieneDatosMinimos, firmaDatosBase } from "@/lib/procuracion/muestras-pdf";
import { MuestraIconRow } from "./muestra-icons";
import type { Donante, Familiar, EtapaEstadoRow, MuestraRow, OrganoRow, PlanillaGeneradaRow } from "@/lib/procuracion/types";
import PotencialPanel from "./potencial-panel";
import MePanel from "./me-panel";
import CertAuxPanel from "./cert-aux-panel";
import ComMuertePanel from "./com-muerte-panel";
import RecomendacionesComMuerte from "./recomendaciones-com-muerte";
import ComDonacionPanel from "./com-donacion-panel";
import ComDonacionRealizada from "./com-donacion-realizada";
import NuevoDonante from "./nuevo-donante";

const EMPTY_ME_CAMPOS: MeCampos = Object.fromEntries(ME_CAMPO_KEYS.map((k) => [k, null]));
const CERT_AUX_KEYS = METODOS_CERT_AUX.map((m) => m.key);
const EMPTY_CERT_AUX_CAMPOS: CertAuxCampos = Object.fromEntries(CERT_AUX_KEYS.map((k) => [k, null]));

const supabase = createClient();

type StageData =
  | { kind: "panel"; loading: boolean; content?: PanelContent }
  | { kind: "organos"; loading: boolean; organos?: OrganoRow[] };

export default function Home() {
  const [donantes, setDonantes] = useState<Donante[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [donante, setDonante] = useState<Donante | null>(null);
  const [familiar, setFamiliar] = useState<Familiar | null>(null);
  const [etapas, setEtapas] = useState<Record<string, EstadoEtapa>>({});
  const [judicialAplica, setJudicialAplica] = useState(false);
  const [meCampos, setMeCampos] = useState<MeCampos>(EMPTY_ME_CAMPOS);
  const [certAuxCampos, setCertAuxCampos] = useState<CertAuxCampos>(EMPTY_CERT_AUX_CAMPOS);
  const [comMuerteRealizada, setComMuerteRealizada] = useState(false);
  const [comDonacionRealizada, setComDonacionRealizada] = useState(false);
  const [muestras, setMuestras] = useState<MuestraRow[]>([]);
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
    setStageData({});

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
        .from("documentacion_estado")
        .select("item_key, estado")
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
        .from("planillas_generadas")
        .select("planilla_key, archivo_url, generado_en")
        .eq("donante_id", selectedId)
        .order("generado_en", { ascending: false }),
      supabase.from("muestras").select("paquete_key, nombre, tubos, obtenida, retirada").eq("donante_id", selectedId),
    ]).then(([donanteRes, familiarRes, etapasRes, judicialRes, meRes, certAuxRes, comMuerteRes, comDonacionRes, planillasRes, muestrasRes]) => {
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
      setMeCampos(meMap);
      const certAuxMap = { ...EMPTY_CERT_AUX_CAMPOS };
      ((certAuxRes.data as { item_key: string; estado: string | null }[]) ?? []).forEach((r) => {
        (certAuxMap as Record<string, string | null>)[r.item_key] = r.estado;
      });
      setCertAuxCampos(certAuxMap);
      setComMuerteRealizada((comMuerteRes.data as { estado: string | null } | null)?.estado === "si");
      setComDonacionRealizada((comDonacionRes.data as { estado: string | null } | null)?.estado === "si");
      const planillasMap: Record<string, PlanillaGeneradaRow> = {};
      ((planillasRes.data as PlanillaGeneradaRow[]) ?? []).forEach((r) => {
        if (!planillasMap[r.planilla_key]) planillasMap[r.planilla_key] = r;
      });
      setPlanillasGeneradas(planillasMap);
      setMuestras((muestrasRes.data as MuestraRow[]) ?? []);
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
    await supabase.from("muestras").update({ obtenida: nuevo }).eq("donante_id", donante.id).eq("paquete_key", paqueteKey);
  }

  async function marcarTodasObtenidas() {
    if (!donante) return;
    setMuestras((prev) => prev.map((m) => ({ ...m, obtenida: true })));
    await supabase.from("muestras").update({ obtenida: true }).eq("donante_id", donante.id);
  }

  function getEtapaEstado(key: string): EstadoEtapa | undefined {
    if (key === "potencial" && donante) return computePotencialEstado(donante);
    if (key === "me") return computeMeEstado(meCampos);
    if (key === "certificacion") return computeCertAuxEstado(certAuxCampos);
    if (key === "comMuerte") return computeComMuerteEstado(comMuerteRealizada);
    if (key === "comDonacion") return computeComDonacionEstado(comDonacionRealizada);
    if (key === "muestras") return computeMuestrasEstado(muestras);
    return etapas[key];
  }

  const visibleStages = useMemo(() => {
    const base = stagesForTipo(donante?.tipo_procuracion);
    const withoutJudicial = base.filter((s) => s.key !== "judicial");
    if (!judicialAplica) return withoutJudicial;
    const judicialStage =
      base.find((s) => s.key === "judicial") ?? STAGES_MULTIORGANICO.find((s) => s.key === "judicial");
    if (!judicialStage) return withoutJudicial;
    const withJudicial = [...withoutJudicial];
    withJudicial.splice(withJudicial.length - 1, 0, judicialStage);
    return withJudicial;
  }, [judicialAplica, donante?.tipo_procuracion]);

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
      stageData[key] ||
      !donante
    )
      return;

    if (key === "organos") {
      setStageData((s) => ({ ...s, [key]: { kind: "organos", loading: true } }));
      const { data } = await supabase
        .from("organos")
        .select("organo_key, pct, labs, imagenes, faltante")
        .eq("donante_id", donante.id);
      setStageData((s) => ({ ...s, [key]: { kind: "organos", loading: false, organos: (data as OrganoRow[]) ?? [] } }));
      return;
    }

    setStageData((s) => ({ ...s, [key]: { kind: "panel", loading: true } }));
    const content = await loadPanel(supabase, key, donante, familiar, etapas);
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

            <div className="status-strip">
              {stripStagesForTipo(donante.tipo_procuracion).map((k) => (
                <div className="status-cell" key={k}>
                  <div className={`status-dot ${dotClass(getEtapaEstado(k))}`}></div>
                  <div className="lbl">{STRIP_LABELS[k]}</div>
                </div>
              ))}
            </div>

            <div className="section-label" style={{ marginTop: 18 }}>
              Línea de tiempo del caso
            </div>
            <div className="stage-rail">
              {visibleStages.map((s, idx) => {
                const st = getEtapaEstado(s.key);
                const open = openStage === s.key;
                const num = idx + 1 < 10 ? "0" + (idx + 1) : String(idx + 1);
                const data = stageData[s.key];
                return (
                  <div key={s.key}>
                    <div
                      className={`stage-item ${st === "green" ? "done" : ""} ${
                        st === "amber" || st === "red" ? "attn" : ""
                      } ${open ? "open" : ""}`}
                      onClick={() => handleOpenStage(s.key)}
                    >
                      <div className="stage-num">{num}</div>
                      <div className="stage-name">{s.label}</div>
                      <span className={`chip ${chipClass(st)}`}>{stageLabel(st)}</span>
                    </div>

                    {open && (
                      <div className="stage-panel">
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
                          <CertAuxPanel donanteId={donante.id} campos={certAuxCampos} onChange={setCertAuxCampos} />
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
                          </>
                        )}

                        {s.key !== "potencial" &&
                          s.key !== "me" &&
                          s.key !== "certificacion" &&
                          s.key !== "comMuerte" &&
                          s.key !== "comDonacion" &&
                          s.key !== "muestras" &&
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

                        {data?.kind === "organos" && !data.loading && data.organos && (
                          <>
                            {data.organos.length === 0 && <div className="tiny">Sin datos de órganos cargados todavía.</div>}
                            {data.organos.map((o) => (
                              <div className="field-row" key={o.organo_key}>
                                <span className="field-label">
                                  {ORGANO_EMOJI[o.organo_key] ?? ""} {humanizeCampo(o.organo_key)}
                                </span>
                                <span className="field-value">{o.pct}% información</span>
                              </div>
                            ))}
                            {data.organos.length > 0 && (
                              <div className="tiny" style={{ marginTop: 8 }}>
                                Porcentaje de completitud de información — no representa aptitud del órgano.
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
