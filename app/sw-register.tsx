"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    // sw.js ya llama a skipWaiting()/clients.claim(), así que una versión
    // nueva toma control de esta pestaña sin esperar a que se cierre --
    // pero sin este reload, la pestaña sigue corriendo el JS ya cargado
    // en memoria aunque el SW haya cambiado por debajo. Recarga una sola
    // vez (guard con "recargado": controllerchange puede disparar más de
    // una vez en teoría, y un reload en loop sería peor que el problema
    // que soluciona).
    let recargado = false;
    function alCambiarControlador() {
      if (recargado) return;
      recargado = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", alCambiarControlador);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", alCambiarControlador);
  }, []);
  return null;
}
