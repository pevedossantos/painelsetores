// Deixa o painel abrir rápido e funcionar como app.
// Sempre tenta a versão mais nova da internet; usa a cópia salva só se estiver sem sinal.
// Os dados (Supabase) nunca passam pelo cache.
const CACHE = "tg-setores-v2";
const ARQUIVOS = ["./", "index.html", "style.css", "app.js", "config.js", "avatar.jpg", "icone-180.png", "manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request)));
});
