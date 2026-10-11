// Barra superior de la Base (escritorio): oscura, con el símbolo, el
// nombre "Procurapp" (escrito por la app) y "BASE OPERATIVA · ARGENTINA";
// el mapa de Argentina tenue, recortado dentro de la barra. A la derecha,
// lo que ya tenía cada pantalla (pestañas, "Actualizado", botones).
import type { ReactNode } from "react";
import { MapaArgentina, Simbolo } from "../marca";
import styles from "./base.module.css";

export default function BarraMarca({ children }: { children: ReactNode }) {
  return (
    <header className={styles.barraMarca}>
      <MapaArgentina className={styles.mapaBarra} opacidad={0.95} />
      <div className={styles.marcaBloque}>
        <Simbolo alto={60} />
        <div>
          <div className={styles.marcaNombre}>Procurapp</div>
          <div className={styles.marcaSub}>BASE OPERATIVA · ARGENTINA</div>
        </div>
      </div>
      <div className={styles.barraMarcaDerecha}>{children}</div>
    </header>
  );
}
