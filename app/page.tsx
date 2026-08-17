"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  STAGES,
  STRIP_STAGES,
  STRIP_LABELS,
  ETAPA_PLANILLAS,
  dotClass,
  chipClass,
  stageLabel,
  humanizeCampo,
  type EstadoEtapa,
} from "@/lib/procuracion/constants";
import type {
  Donante,
  Familiar,
  EtapaEstadoRow,
  CampoMapeoRow,
  PlanillaValorRow,
  MuestraRow,
  OrganoRow,
  CampoDisplay,
} from "@/lib/procuracion/types";

const supabase = createClient();

function resolveCanonico(
  fuente: string,
  donante: Donante,
  familiar: Familiar | null
): string | null {
  const [tabla, columna] = fuente.split(".");
  const source =
    tabla === "donantes"
      ? (donante as unknown as Record<string, unknown>)
      : tabla === "familiares" && familiar
        ? (familiar as unknown as Record<string, unknown>)
        : null;
  if (!source) return null;
  const val = source[columna];
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "boolean") return val ? "Sí" : "No";
  return String(val);
}

export default function Home() {
  const [donantes, setDonantes] = useState<Donante[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [donante, setDonante] = useState<Donante | null>(null);
  const [familiar, setFamiliar] = useState<Familiar | null>(null);
  const [etapas, setEtapas] = useState<Record<string, EstadoEtapa>>({});
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [stageData, setStageData] = useState<
    Record<string, { loading: boolean; campos?: CampoDisplay[]; muestras?: MuestraRow[]; organos?: OrganoRow[] }>
  >({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    supabase
      .from("donantes")
      .select(
        "id, pd_numero, folio_numero, nombre_completo, dni, fecha_nacimiento, edad, sexo, grupo_sanguineo, grupo_confirmado, peso, talla, cama, institucion, localidad, servicio, denunciante, fecha_ingreso, me_hora, causa_muerte, estado_general, created_at"
      )
      .order("created_at", { ascending: false })
      .then(({ data }) => setDonantes((data as Donante[]) ?? []));
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
    ]).then(([donanteRes, familiarRes, etapasRes]) => {
      setDonante((donanteRes.data as Donante) ?? null);
      setFamiliar((familiarRes.data as Familiar) ?? null);
      const map: Record<string, EstadoEtapa> = {};
      ((etapasRes.data as EtapaEstadoRow[]) ?? []).forEach((r) => {
        map[r.etapa_key] = r.estado;
      });
      setEtapas(map);
      setLoadingDetail(false);
    });
  }, [selectedId]);

  async function handleOpenStage(key: string) {
    if (openStage === key) {
      setOpenStage(null);
      return;
    }
    setOpenStage(key);
    if (stageData[key] || !donante) return;

    if (key === "muestras") {
      setStageData((s) => ({ ...s, [key]: { loading: true } }));
      const { data } = await supabase
        .from("muestras")
        .select("paquete_key, nombre, tubos, obtenida, retirada")
        .eq("donante_id", donante.id);
      setStageData((s) => ({ ...s, [key]: { loading: false, muestras: (data as MuestraRow[]) ?? [] } }));
      return;
    }

    if (key === "organos") {
      setStageData((s) => ({ ...s, [key]: { loading: true } }));
      const { data } = await supabase
        .from("organos")
        .select("organo_key, pct, labs, imagenes, faltante")
        .eq("donante_id", donante.id);
      setStageData((s) => ({ ...s, [key]: { loading: false, organos: (data as OrganoRow[]) ?? [] } }));
      return;
    }

    const planillas = ETAPA_PLANILLAS[key] ?? [];
    if (planillas.length === 0) {
      setStageData((s) => ({ ...s, [key]: { loading: false, campos: [] } }));
      return;
    }

    setStageData((s) => ({ ...s, [key]: { loading: true } }));
    const [mapeoRes, valoresRes] = await Promise.all([
      supabase
        .from("campo_mapeo")
        .select("planilla_key, campo_pdf, tipo_campo, fuente_canonica")
        .in("planilla_key", planillas)
        .order("campo_pdf"),
      supabase
        .from("planilla_valores")
        .select("planilla_key, campo_pdf, valor")
        .eq("donante_id", donante.id)
        .in("planilla_key", planillas),
    ]);

    const valoresMap = new Map<string, string | null>();
    ((valoresRes.data as PlanillaValorRow[]) ?? []).forEach((v) => {
      valoresMap.set(v.planilla_key + "::" + v.campo_pdf, v.valor);
    });

    const campos: CampoDisplay[] = ((mapeoRes.data as CampoMapeoRow[]) ?? []).map((m) => ({
      campo_pdf: m.campo_pdf,
      valor: m.fuente_canonica
        ? resolveCanonico(m.fuente_canonica, donante, familiar)
        : (valoresMap.get(m.planilla_key + "::" + m.campo_pdf) ?? null),
    }));

    setStageData((s) => ({ ...s, [key]: { loading: false, campos } }));
  }

  const visibleStages = useMemo(() => STAGES, []);

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
            Cambiar donante
          </button>
        )}
      </div>

      <main className="app-shell flex-1">
        {!selectedId && (
          <>
            <div className="section-label">Donantes</div>
            {donantes === null && <div className="empty-hint">Cargando…</div>}
            {donantes !== null && donantes.length === 0 && (
              <div className="empty-hint">No hay donantes cargados todavía.</div>
            )}
            {donantes !== null && donantes.length > 0 && (
              <div className="donor-list">
                {donantes.map((d) => (
                  <div key={d.id} className="donor-row" onClick={() => setSelectedId(d.id)}>
                    <div className="donor-row-top">
                      <span className="donor-row-id">{d.nombre_completo || "Sin nombre"}</span>
                      {d.estado_general && (
                        <span className="chip chip-gray">{d.estado_general}</span>
                      )}
                    </div>
                    <div className="donor-row-sub">
                      {[d.dni && `DNI ${d.dni}`, d.institucion, d.pd_numero && `PD ${d.pd_numero}`]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selectedId && loadingDetail && <div className="empty-hint">Cargando donante…</div>}

        {selectedId && !loadingDetail && donante && (
          <>
            <div className="donor-head">
              <div>
                <div className="donor-id">{donante.nombre_completo || "Sin nombre"}</div>
                <div className="donor-meta">
                  {[donante.institucion, donante.pd_numero && `PD Nº ${donante.pd_numero}`]
                    .filter(Boolean)
                    .join(" · ") || "—"}
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
              {STRIP_STAGES.map((k) => (
                <div className="status-cell" key={k}>
                  <div className={`status-dot ${dotClass(etapas[k])}`}></div>
                  <div className="lbl">{STRIP_LABELS[k]}</div>
                </div>
              ))}
            </div>

            <div className="section-label" style={{ marginTop: 18 }}>
              Línea de tiempo del caso
            </div>
            <div className="stage-rail">
              {visibleStages.map((s, idx) => {
                const st = etapas[s.key];
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
                        {data?.loading && <div className="tiny">Cargando…</div>}

                        {data && !data.loading && data.campos && data.campos.length > 0 && (
                          <>
                            {data.campos.map((c, i) => (
                              <div className="field-row" key={c.campo_pdf + i}>
                                <span className="field-label">{humanizeCampo(c.campo_pdf)}</span>
                                <span className="field-value">{c.valor ?? "—"}</span>
                              </div>
                            ))}
                          </>
                        )}

                        {data && !data.loading && data.campos && data.campos.length === 0 && (
                          <div className="tiny">
                            Sin planilla asociada todavía a esta etapa — próximamente.
                          </div>
                        )}

                        {data && !data.loading && data.muestras && (
                          <>
                            {data.muestras.length === 0 && (
                              <div className="tiny">Sin paquetes de muestra cargados.</div>
                            )}
                            {data.muestras.map((m) => (
                              <div className="field-row" key={m.paquete_key}>
                                <span className="field-label">
                                  {m.nombre}
                                  <br />
                                  <span className="tiny">{m.tubos || "—"}</span>
                                </span>
                                <span className={`chip ${m.obtenida ? "chip-green" : "chip-gray"}`}>
                                  {m.obtenida ? "Obtenida" : "Pendiente"}
                                </span>
                              </div>
                            ))}
                          </>
                        )}

                        {data && !data.loading && data.organos && (
                          <>
                            {data.organos.length === 0 && (
                              <div className="tiny">Sin datos de órganos cargados todavía.</div>
                            )}
                            {data.organos.map((o) => (
                              <div className="field-row" key={o.organo_key}>
                                <span className="field-label">{humanizeCampo(o.organo_key)}</span>
                                <span className="field-value">{o.pct}% información</span>
                              </div>
                            ))}
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
