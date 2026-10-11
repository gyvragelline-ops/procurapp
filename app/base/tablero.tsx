"use client";

import { filaTablero, ordenarPorUrgencia, resumenTarjetas, type FilaTablero, type InsumosTablero } from "@/lib/procuracion/base-tablero";
import { urgenteVencida } from "@/lib/procuracion/base-solicitudes";
import { exportarTableroCsv } from "@/lib/procuracion/base-exportar";
import { COLOR, colorEtapa, descargar, diaYHora, dosCifras, hace, letraSexo, textoActualizado } from "./ui";
import styles from "./base.module.css";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function reloj(ahora: number) {
  const d = new Date(ahora);
  return `${DIAS[d.getDay()]} ${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)} · ${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
}

export function metaDonante(f: Pick<FilaTablero, "edad" | "sexo" | "peso">): string {
  return [f.edad !== null ? `${f.edad} a` : null, letraSexo(f.sexo), f.peso !== null ? `${f.peso} kg` : null].filter(Boolean).join(" · ") || "Sin cargar";
}

export function textoUltimoDato(f: FilaTablero): { texto: string; color: string } {
  const u = f.ultimoDato;
  if (u.tipo === "con_datos") return { texto: hace(u.minutos), color: u.color === "verde" ? COLOR.g : u.color === "ambar" ? COLOR.a : COLOR.r };
  if (u.tipo === "sin_datos") return u.noIniciado ? { texto: "no iniciado", color: COLOR.a } : { texto: "sin datos", color: COLOR.mu };
  return { texto: "No aplica", color: COLOR.mu };
}

function Fila({ f, i, ahora, onAbrir }: { f: FilaTablero; i: InsumosTablero; ahora: number; onAbrir: (id: string) => void }) {
  const ult = textoUltimoDato(f);
  const urgente = i.solicitudes.some((s) => urgenteVencida(s, ahora));
  const organos = [...new Set(f.equipos.flatMap((e) => e.organos))];
  const falta = [
    ...f.falta.rojo.map((t) => ({ t, c: COLOR.r, w: 600 })),
    ...f.falta.ambar.map((t) => ({ t, c: COLOR.a, w: 600 })),
    ...f.falta.pendientes.map((t) => ({ t, c: COLOR.tx, w: 400 })),
  ];
  return (
    <button type="button" className={styles.fila} onClick={() => onAbrir(f.id)} aria-label={`Abrir expediente ${f.iniciales} ${f.identificador}`}>
      <div className={styles.apilado}>
        <span className={styles.donante}>{f.iniciales}</span>
        <span className={`${styles.chico} ${styles.mu}`}>{metaDonante(f)}</span>
        <span className={`${styles.chico} ${styles.mu} ${styles.num}`}>{f.identificador}</span>
      </div>
      <div className={styles.apilado}>
        <span>{f.hospital ?? "Sin cargar"}</span>
        <span className={`${styles.chico} ${styles.mu}`}>{f.procurador ?? "procurador sin cargar"}</span>
      </div>
      <span className={`${styles.num} ${styles.nw}`}>{f.tiempoEnProtocolo}</span>
      <span style={{ fontWeight: 500 }}>{f.etapaActual ? `${dosCifras(f.etapaActual.numero)} · ${f.etapaActual.label}` : "Todas completas"}</span>
      <div className={styles.barra} title={f.barra.map((e) => `${dosCifras(e.numero)} ${e.label}`).join("\n")}>
        {f.barra.map((e) => (
          <span key={e.key} style={{ background: colorEtapa(e.estado) }} />
        ))}
      </div>
      <span>
        {falta.length === 0
          ? "—"
          : falta.map((x, k) => (
              <span key={k} style={{ color: x.c, fontWeight: x.w }}>
                {k > 0 ? " · " : ""}
                {x.t}
              </span>
            ))}
      </span>
      <span className={styles.num} style={{ fontWeight: 600, color: urgente ? COLOR.r : f.solicitudesAbiertas ? COLOR.a : COLOR.mu }}>
        {f.solicitudesAbiertas}
      </span>
      <span className={`${styles.num} ${styles.nw}`} style={{ color: ult.color, fontWeight: 500 }}>
        {ult.texto}
      </span>
      <div className={styles.apilado}>
        <span className={styles.num} style={{ fontWeight: 600 }}>
          {f.quirofano ? diaYHora(f.quirofano, ahora) : "sin definir"}
        </span>
        <span className={`${styles.chico} ${styles.mu}`}>{organos.join(" · ") || "Sin equipos"}</span>
      </div>
    </button>
  );
}

export default function Tablero({
  insumos,
  ahora,
  cargadoEn,
  onAbrir,
}: {
  insumos: InsumosTablero[] | null;
  ahora: number;
  cargadoEn: number | null;
  onAbrir: (id: string) => void;
}) {
  const lista = insumos ? ordenarPorUrgencia(insumos, ahora) : [];
  const filas = lista.map((i) => ({ i, f: filaTablero(i, ahora) }));
  const r = resumenTarjetas(lista, ahora);
  const kpis = [
    { n: r.activos, t: "protocolos activos", c: COLOR.tx },
    { n: r.requierenAccion, t: "requieren acción ahora", c: COLOR.r },
    { n: r.quirofano24h, t: "quirófano en las próximas 24 h", c: COLOR.a },
    { n: r.solicitudesAbiertas, t: "solicitudes abiertas", c: COLOR.a },
  ];

  function exportar() {
    const csv = exportarTableroCsv(
      filas.map((x) => x.f),
      Date.now()
    );
    descargar(csv.nombre, csv.contenido);
  }

  return (
    <>
      <div className={styles.cabecera}>
        <div className={styles.titulo}>
          <span>Base operativa</span>
          <span className={styles.mu}>Protocolos activos · orden por urgencia</span>
        </div>
        <div className={styles.acciones}>
          <span className={`${styles.num} ${styles.mu}`}>{reloj(ahora)}</span>
          <span className={`${styles.chico} ${styles.mu} ${styles.noImprimir}`}>{textoActualizado(cargadoEn, ahora)}</span>
          <button type="button" className={`${styles.btn} ${styles.noImprimir}`} onClick={() => window.print()}>
            Imprimir tablero
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnAcento} ${styles.noImprimir}`} onClick={exportar} disabled={!insumos}>
            Exportar (Excel / CSV)
          </button>
        </div>
      </div>

      <div className={styles.kpis}>
        {kpis.map((k) => (
          <div key={k.t} className={styles.kpi}>
            <span className={styles.num} style={{ color: k.c }}>
              {insumos ? k.n : "…"}
            </span>
            <span>{k.t}</span>
          </div>
        ))}
      </div>

      <div className={styles.tabla}>
        <div className={`${styles.fila} ${styles.filaTitulos}`}>
          <span>Donante</span>
          <span>Hospital · procurador</span>
          <span>Tiempo</span>
          <span>Etapa actual</span>
          <span>Progreso (01–13)</span>
          <span>Falta o bloquea</span>
          <span>Solicitudes</span>
          <span>Último dato</span>
          <span>Quirófano · equipos</span>
        </div>
        {!insumos && <div className={styles.cardFila}>Cargando…</div>}
        {insumos && filas.length === 0 && <div className={styles.cardFila}>No hay protocolos activos.</div>}
        {filas.map(({ i, f }) => (
          <Fila key={f.id} f={f} i={i} ahora={ahora} onAbrir={onAbrir} />
        ))}
      </div>

      <div className={styles.pie}>
        <span>
          Progreso: <span style={{ color: COLOR.g, fontWeight: 600 }}>■</span> completo · <span style={{ color: COLOR.a, fontWeight: 600 }}>■</span> en curso o falta ·{" "}
          <span style={{ color: COLOR.r, fontWeight: 600 }}>■</span> bloqueado · <span style={{ color: COLOR.n, fontWeight: 600 }}>■</span> sin iniciar. Último dato: de
          Mantenimiento (enfermería, médico, respirador). Tocar una fila abre el expediente.
        </span>
        <span>Datos en crudo, sin interpretar: la aptitud de cada órgano la decide su equipo.</span>
      </div>
    </>
  );
}
