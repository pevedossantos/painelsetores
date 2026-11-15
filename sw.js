// Deixa o painel abrir rápido e funcionar como app.
// Sempre busca a versão mais nova na internet (sem cópia guardada do navegador);
// usa a cópia salva só se estiver sem sinal. Os dados (Supabase) nunca passam por aqui.
const CACHE = "tg-setores-v6";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
