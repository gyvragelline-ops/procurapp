"use client";

import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";

/**
 * Formatea una entrada libre a HH:MM: se queda solo con dígitos
 * (máx. 4) e inserta ":" automáticamente después del 2º dígito.
 * Ej: "1430" -> "14:30".
 */
export function formatHora(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2);
}

/**
 * Campo de hora reutilizable: texto libre, sin selector nativo de
 * reloj, formato 24h con auto-inserción de ":". Usar para todo campo
 * de hora del proyecto (evaluación, mantenimiento, etc.).
 */
export default function HoraInput({
  value,
  onChangeValue,
  onBlur,
  onKeyDown,
  autoFocus,
  style,
}: {
  value: string;
  onChangeValue: (v: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  style?: CSSProperties;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChangeValue(formatHora(e.target.value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className="mini-input"
      style={{ width: 68, ...style }}
      value={value}
      placeholder="HH:MM"
      autoFocus={autoFocus}
      onChange={handleChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
