const COLORES: Record<string, string> = {
  morado: "#8b5cf6",
  celeste: "#38bdf8",
  rojo: "#ef4444",
};

function TuboIcon({ color }: { color: string }) {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" style={{ display: "block" }}>
      <rect x="2.5" y="4" width="8" height="10.5" rx="4" fill="#fff" stroke="#8a94a3" strokeWidth="1" />
      <rect x="1.5" y="1" width="10" height="3.5" rx="1.2" fill={COLORES[color] ?? "#94a3b8"} />
    </svg>
  );
}

function FrascoIcon() {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" style={{ display: "block" }}>
      <rect x="1.5" y="5.5" width="10" height="9" rx="1.8" fill="#fff" stroke="#8a94a3" strokeWidth="1" />
      <rect x="4" y="1.5" width="5" height="4.5" fill="#fbbf24" stroke="#8a94a3" strokeWidth="1" />
    </svg>
  );
}

function HisopoIcon() {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" style={{ display: "block" }}>
      <line x1="6.5" y1="6" x2="6.5" y2="15" stroke="#8a94a3" strokeWidth="1.4" />
      <ellipse cx="6.5" cy="2.8" rx="3.2" ry="2.2" fill="#f1f5f9" stroke="#8a94a3" strokeWidth="1" />
    </svg>
  );
}

type ItemMuestra = {
  tipo: "tubo" | "frasco" | "hisopo";
  color?: string;
  cantidad: number;
  etiqueta?: string;
  sinCantidad?: boolean;
};

const MUESTRA_ITEMS: Record<string, ItemMuestra[]> = {
  hla: [{ tipo: "tubo", color: "morado", cantidad: 10 }],
  lab: [
    { tipo: "tubo", color: "morado", cantidad: 1 },
    { tipo: "tubo", color: "celeste", cantidad: 1 },
    { tipo: "tubo", color: "rojo", cantidad: 1 },
    { tipo: "frasco", cantidad: 1, etiqueta: "orina" },
  ],
  hemocultivo: [
    { tipo: "frasco", cantidad: 1, etiqueta: "Aeróbico", sinCantidad: true },
    { tipo: "frasco", cantidad: 1, etiqueta: "Anaeróbico", sinCantidad: true },
  ],
  urocultivo: [{ tipo: "frasco", cantidad: 1, etiqueta: "estéril orina" }],
  serologia: [{ tipo: "tubo", color: "rojo", cantidad: 2 }],
  preablacion: [
    { tipo: "tubo", color: "rojo", cantidad: 1 },
    { tipo: "frasco", cantidad: 1, etiqueta: "orina" },
  ],
  grupors: [
    { tipo: "tubo", color: "morado", cantidad: 1 },
    { tipo: "tubo", color: "rojo", cantidad: 1 },
  ],
  covid: [{ tipo: "hisopo", cantidad: 1, etiqueta: "hisopado", sinCantidad: true }],
};

export function MuestraIconRow({ paqueteKey }: { paqueteKey: string }) {
  const items = MUESTRA_ITEMS[paqueteKey];
  if (!items) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          {it.tipo === "tubo" && <TuboIcon color={it.color ?? "rojo"} />}
          {it.tipo === "frasco" && <FrascoIcon />}
          {it.tipo === "hisopo" && <HisopoIcon />}
          <span className="tiny" style={{ opacity: 0.75 }}>
            {it.sinCantidad ? it.etiqueta : `${it.cantidad}x${it.etiqueta ? ` ${it.etiqueta}` : ""}`}
          </span>
        </span>
      ))}
    </span>
  );
}
