// Dibujos de los órganos (SVG, del diseño handoff/disenos/
// Base-Expediente-Compacto.dc.html). Lógica pura: devuelve el SVG como
// texto, para la pantalla y para la imagen de cabecera de la ficha.

import type { OrganoDistribucion } from "./distribucion-requisitos.ts";

const TRAZOS: Record<OrganoDistribucion, (c: string) => string> = {
  pulmon: (c) =>
    `<path d="M17 12C10 12 4 22 5 32c0 3 3 4 6 3 4-1 6-5 6-9z" fill="${c}"/><path d="M23 12c7 0 13 10 12 20 0 3-3 4-6 3-4-1-6-5-6-9z" fill="${c}"/><path d="M20 3v15M20 18l-5 5M20 18l5 5" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  corazon: (c) => `<path d="M20 36C8 28 3 20 6 13c3-6 11-6 14 0 3-6 11-6 14 0 3 7-2 15-14 23z" fill="${c}"/><path d="M15 12c0-6 3-9 8-9" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  rinon: (c) => `<path d="M22 4C12 3 5 11 6 22c1 10 8 15 14 12 3-2 1-6 3-8 2-2 6-2 7-6C32 12 29 4 22 4z" fill="${c}"/><path d="M24 27c2 1 4 3 4 6" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  higado: (c) => `<path d="M2 17c8-8 22-10 36-3-1 10-9 20-20 20-8 0-14-6-16-17z" fill="${c}"/><circle cx="27" cy="30" r="3.5" fill="#2E8B57"/>`,
  pancreas: (c) => `<path d="M3 24c5-8 15-11 24-8 6 2 11 4 10 9-1 4-7 4-13 2-7-2-12 2-17 5-3 1-5-3-4-8z" fill="${c}"/>`,
};

export function svgOrgano(organo: OrganoDistribucion, color: string, lado = 40): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${lado}" height="${lado}">${TRAZOS[organo](color)}</svg>`;
}

export const dataUrlOrgano = (organo: OrganoDistribucion, color: string, lado = 40) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOrgano(organo, color, lado))}`;
