// Guardado con reintento + error visible: hasta ahora, varios paneles
// hacían `await supabase....upsert(...)` sin revisar si devolvía error, y
// actualizaban el estado local (la pantalla) igual, hubiera funcionado el
// guardado o no. Con wifi hospitalario intermitente eso significa: el
// procurador ve el dato "cargado" en pantalla, pero nunca llegó a la base
// -- y recién se entera cuando un documento sale en blanco. Este helper
// reintenta unas veces (por si fue un corte momentáneo) y, si sigue
// fallando, devuelve un mensaje para mostrar en vez de fingir éxito.
export type ResultadoGuardado<T> = { ok: true; resultado: T } | { ok: false; mensaje: string };

export async function guardarConReintento<T extends { error: { message: string } | null }>(
  ejecutar: () => PromiseLike<T>,
  intentos = 3
): Promise<ResultadoGuardado<T>> {
  let ultimoMensaje = "";
  for (let intento = 0; intento < intentos; intento++) {
    const resultado = await ejecutar();
    if (!resultado.error) return { ok: true, resultado };
    ultimoMensaje = resultado.error.message;
    if (intento < intentos - 1) {
      await new Promise((r) => setTimeout(r, 500 * (intento + 1)));
    }
  }
  return { ok: false, mensaje: `No se pudo guardar -- revisá tu conexión e intentá de nuevo. (${ultimoMensaje || "sin conexión"})` };
}
