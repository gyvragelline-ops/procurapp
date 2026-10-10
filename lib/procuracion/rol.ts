// Abstracción de rol. SIN LOGIN TODAVÍA: rolActual() devuelve el rol fijo
// de cada entrada (/base -> "base"). Cuando haya autenticación, se lee de
// la sesión acá y nada más cambia. Nunca usar claves secretas en el
// navegador: el cliente solo tiene la clave pública anon.
//
// ATENCIÓN: hasta que haya autenticación por rol (y RLS), la Base NO se
// usa con donantes reales.

export type Rol = "base" | "procurador" | "equipo";

export function rolActual(entrada: "base" | "procurador"): Rol {
  return entrada;
}

export const puedeVerBase = (rol: Rol) => rol === "base";
