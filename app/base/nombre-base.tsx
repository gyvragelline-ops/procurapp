"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { validarNombreBase } from "@/lib/procuracion/base-nombre";
import { guardarNombre, leerNombre } from "./ui";
import styles from "./base.module.css";

// Nombre de quien usa la Base en este dispositivo (el mismo del chat).
// Antes de cualquier acción que se graba: si no hay nombre guardado, se
// pide una sola vez y se guarda. Sin nombre, la acción no se hace.

type Asegurar = () => Promise<string | null>;
const NombreCtx = createContext<Asegurar>(async () => validarNombreBase(leerNombre()).ok ? leerNombre().trim() : null);

export const useNombre = () => useContext(NombreCtx);

export function ProveedorNombre({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const esperando = useRef<((n: string | null) => void)[]>([]);

  const asegurar = useCallback<Asegurar>(() => {
    const v = validarNombreBase(leerNombre());
    if (v.ok) return Promise.resolve(v.nombre);
    setValor("");
    setError(null);
    setAbierto(true);
    return new Promise((resolve) => esperando.current.push(resolve));
  }, []);

  function cerrar(n: string | null) {
    setAbierto(false);
    const xs = esperando.current;
    esperando.current = [];
    xs.forEach((r) => r(n));
  }

  function guardar() {
    const v = validarNombreBase(valor);
    if (!v.ok) return setError(v.error);
    guardarNombre(v.nombre);
    cerrar(v.nombre);
  }

  return (
    <NombreCtx.Provider value={asegurar}>
      {children}
      {abierto && (
        <div className={styles.fondoPanel} onClick={() => cerrar(null)}>
          <div className={styles.dialogoNombre} role="dialog" aria-modal="true" aria-labelledby="titulo-nombre" onClick={(e) => e.stopPropagation()}>
            <strong id="titulo-nombre">¿Quién sos?</strong>
            <span className={`${styles.chico} ${styles.mu}`}>Tu nombre queda en la línea de tiempo con cada acción. Se pide una sola vez y se guarda en este dispositivo (el mismo del chat).</span>
            <input
              className={styles.campo}
              autoFocus
              maxLength={80}
              placeholder="Tu nombre"
              aria-label="Tu nombre"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") guardar();
                if (e.key === "Escape") cerrar(null);
              }}
            />
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            <div className={styles.renglon}>
              <button type="button" className={`${styles.btn} ${styles.btnAcento}`} onClick={guardar}>
                Guardar y seguir
              </button>
              <button type="button" className={styles.btn} onClick={() => cerrar(null)}>
                Cancelar
              </button>
              <span className={`${styles.chico} ${styles.mu}`}>Sin nombre, la acción no se hace.</span>
            </div>
          </div>
        </div>
      )}
    </NombreCtx.Provider>
  );
}
