// Marca Procurapp: el símbolo (sin letras: el nombre lo escribe la app) y
// el mapa de Argentina de fondo, tenue, con nodos menta y líneas finas.
// Solo visual. Colores en globals.css (--marca-*).

/* eslint-disable @next/next/no-img-element */

export function Simbolo({ alto, className }: { alto: number; className?: string }) {
  const src = alto > 96 ? "/brand/simbolo-240.png" : "/brand/simbolo-96.png";
  return <img src={src} alt="" aria-hidden width={Math.round((alto * 710) / 650)} height={alto} className={className} style={{ display: "block", flex: "none" }} />;
}

// Nodos y líneas del mapa: SOLO DECORATIVOS. No representan ubicaciones
// reales (ni hospitales, ni equipos, ni donantes) ni ningún dato del
// sistema; las posiciones son aproximadas y fijas. Coordenadas de
// mapa-argentina.svg (viewBox 0 0 472 1000).
const NODOS: [number, number][] = [
  [197, 145],
  [417, 164],
  [220, 285],
  [305, 332],
  [111, 330],
  [358, 382],
  [129, 514],
  [265, 506],
  [142, 723],
  [102, 897],
];
const LINEAS: [number, number][] = [
  [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [5, 7], [4, 6], [6, 7], [6, 8], [8, 9], [2, 5],
];

export function MapaArgentina({ className, opacidad = 0.5 }: { className?: string; opacidad?: number }) {
  return (
    <div className={className} aria-hidden style={{ pointerEvents: "none", opacity: opacidad }}>
      <svg viewBox="0 0 472 1000" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: "block" }}>
        <image href="/brand/mapa-argentina.svg" x="0" y="0" width="472" height="1000" />
        {LINEAS.map(([a, b], i) => (
          <line key={i} x1={NODOS[a][0]} y1={NODOS[a][1]} x2={NODOS[b][0]} y2={NODOS[b][1]} stroke="var(--marca-menta)" strokeOpacity="0.45" strokeWidth="1.6" />
        ))}
        {NODOS.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="11" fill="var(--marca-menta)" fillOpacity="0.18" />
            <circle cx={x} cy={y} r="5" fill="var(--marca-menta)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
