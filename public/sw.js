const CACHE_NAME = "procuracion-shell-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nunca tocar pedidos que no sean del propio origen: Supabase (u otro
  // servicio externo) tiene que seguir su curso normal, sin pasar por
  // acá. Sin este chequeo, un pedido cruzado a supabase.co entraba al
  // mismo respondWith() de abajo -- si fallaba y no había nada en caché
  // (nunca lo hay para supabase.co, SHELL_URLS no lo incluye),
  // caches.match() devolvía undefined y respondWith(undefined) tira
  // "Failed to convert value to 'Response'" en la página.
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cacheada) => cacheada || caches.match("/")))
  );
});
