"use client";

import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";

/**
 * Formatea una entrada libre a "DD/MM/AAAA HH:MM": se queda solo con
 * dígitos (máx. 12) e inserta "/" y " " y ":" automáticamente. El año
 * siempre completa sus 4 dígitos antes de dejar escribir la hora --
 * evita el bug de año truncado (ej. "206" en vez de "2026") que daba
 * el campo de texto libre anterior.
 */
export function formatFechaHora(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 2) return digits;
  let out = digits.slice(0, 2) + "/";
  if (digits.length <= 4) return out + digits.slice(2);
  out += digits.slice(2, 4) + "/";
  if (digits.length <= 8) return out + digits.slice(4);
  out += digits.slice(4, 8) + " ";
  if (digits.length <= 10) return out + digits.slice(8);
  out += digits.slice(8, 10) + ":";
  return out + digits.slice(10, 12);
}

/**
 * Campo de fecha + hora reutilizable: texto libre, formato
 * "DD/MM/AAAA HH:MM" con auto-inserción de separadores.
 */
export default function FechaHoraInput({
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
    onChangeValue(formatFechaHora(e.target.value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className="mini-input"
      style={{ width: 150, ...style }}
      value={value}
      placeholder="DD/MM/AAAA HH:MM"
      autoFocus={autoFocus}
      onChange={handleChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
